"""
server.py
REST API ที่เชื่อม backend (api_client + scoring + analyzer) เข้ากับ React frontend

Endpoints
  GET /api/health              → สถานะ + มี FB credential ไหม
  GET /api/analyze             → วิเคราะห์จริงผ่าน Graph API (ต้องมี .env)
        ?since=YYYY-MM-DD&until=YYYY-MM-DD&demo=1
        demo=1 หรือไม่มี credential → ใช้ sample_data (รัน pipeline จริงบน mock)

รัน:  uvicorn server:app --reload --port 8000
"""

import hmac
import json
import logging
import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app_security import RateLimiter, SecuritySettings, SessionManager, SESSION_COOKIE
from import_pipeline.models import ImportStage, SourceKind
from import_pipeline.registry import DIMENSIONS, METRICS
from portfolio import (
    BrandCreate,
    CampaignCreate,
    PortfolioError,
    PortfolioStore,
    ProjectCreate,
    ReportPeriodCreate,
    WorkspaceUpdate,
)
from report_elements import (
    ReportElementCreate,
    ReportElementError,
    ReportElementStore,
    ReportElementUpdate,
)
from metric_workspace import (
    CustomMetricCreate,
    MetricOverrideUpsert,
    MetricWorkspaceError,
    MetricWorkspaceStore,
)
from report_shares import ReportShareError, ReportShareStore
from report_library import (
    ReportCreate,
    ReportLibraryError,
    ReportLibraryStore,
    ReportPublish,
    ReportUpdate,
)
from scoring import PostScorer, calculate_baseline
from serializer import build_payload
import topic_extractor
from facebook_connection import FacebookConnectionError, FacebookOAuthService

load_dotenv()
logger = logging.getLogger(__name__)
security_settings = SecuritySettings.from_environment()
session_manager = SessionManager(security_settings)
rate_limiter = RateLimiter()
portfolio_store = PortfolioStore()
report_element_store = ReportElementStore()
metric_workspace_store = MetricWorkspaceStore()
report_share_store = ReportShareStore()
report_library_store = ReportLibraryStore()

app = FastAPI(
    title="FB Performance Analyzer API",
    docs_url=None if security_settings.production else "/docs",
    redoc_url=None if security_settings.production else "/redoc",
    openapi_url=None if security_settings.production else "/openapi.json",
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]
app_base_url = os.getenv("APP_BASE_URL", "http://localhost:8000").rstrip("/")
if app_base_url not in allowed_origins:
    allowed_origins.append(app_base_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
    allow_credentials=True,
)


def _apply_security_headers(request: Request, response: Response) -> Response:
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
        "img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "script-src 'self'; connect-src 'self'; form-action 'self' https://www.facebook.com"
    )
    if app_base_url.startswith("https://"):
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin:
        if origin.rstrip("/") not in allowed_origins:
            response = JSONResponse(
                status_code=403, content={"detail": "Origin ไม่ได้รับอนุญาต"}
            )
            return _apply_security_headers(request, response)

    response = await call_next(request)
    return _apply_security_headers(request, response)


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class ReportShareCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    since: date
    until: date
    project_id: str = Field(min_length=1, max_length=80)
    period_id: str = Field(min_length=1, max_length=80)
    campaign_ids: list[str] = Field(min_length=1, max_length=200)
    demo: bool = True
    expires_days: int = Field(default=30, ge=1, le=90)

    @model_validator(mode="after")
    def valid_range(self):
        if self.since > self.until:
            raise ValueError("since must not be after until")
        return self


def _client_key(request: Request, action: str) -> str:
    client_host = request.client.host if request.client else "unknown"
    return f"{action}:{client_host}"


def _enforce_rate_limit(
    request: Request, *, action: str, limit: int, window_seconds: int
) -> None:
    if not rate_limiter.allow(
        _client_key(request, action), limit=limit, window_seconds=window_seconds
    ):
        raise HTTPException(
            status_code=429,
            detail="ส่งคำขอถี่เกินไป กรุณารอสักครู่แล้วลองใหม่",
            headers={"Retry-After": str(window_seconds)},
        )


def _is_authenticated(request: Request) -> bool:
    if not security_settings.configured:
        return not security_settings.production
    return session_manager.verify_session(request.cookies.get(SESSION_COOKIE))


def _require_authenticated(request: Request) -> None:
    if not _is_authenticated(request):
        raise HTTPException(status_code=401, detail="กรุณาเข้าสู่ระบบก่อนใช้งาน")


def _require_project(project_id: str) -> None:
    try:
        projects = portfolio_store.snapshot().projects
    except PortfolioError as exc:
        raise HTTPException(status_code=500, detail="อ่าน portfolio registry ไม่สำเร็จ") from exc
    if not any(project.id == project_id for project in projects):
        raise HTTPException(status_code=404, detail="ไม่พบโปรเจกต์ที่เลือก")


def _require_element_owner(owner_id: str) -> None:
    if owner_id.startswith("rpt_"):
        try:
            report_library_store.get(owner_id)
            return
        except ReportLibraryError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    _require_project(owner_id)


def _validate_report_scope(payload: ReportCreate | ReportUpdate, existing: dict | None = None) -> None:
    snapshot = portfolio_store.snapshot()
    values = {**(existing or {}), **payload.model_dump(exclude_unset=True, mode="json")}
    brand_id = values.get("brand_id")
    if not any(brand.id == brand_id for brand in snapshot.brands):
        raise HTTPException(status_code=404, detail="ไม่พบแบรนด์ที่เลือก")
    project_id = values.get("project_id")
    campaign_ids = values.get("campaign_ids") or []
    if not project_id:
        return
    project = next((item for item in snapshot.projects if item.id == project_id), None)
    if project is None or brand_id not in project.brand_ids:
        raise HTTPException(status_code=422, detail="Project ไม่ได้อยู่ในแบรนด์ที่เลือก")
    matched = [item for item in snapshot.campaigns if item.id in campaign_ids and item.project_id == project_id and brand_id in item.brand_ids]
    if len(matched) != len(campaign_ids):
        raise HTTPException(status_code=422, detail="Campaign scope ไม่ตรงกับ Brand/Project")


def _library_analysis_scope(report: dict) -> dict | None:
    if not report.get("project_id") or not report.get("campaign_ids"):
        return None
    snapshot = portfolio_store.snapshot()
    project = next(item for item in snapshot.projects if item.id == report["project_id"])
    campaigns = [item for item in snapshot.campaigns if item.id in report["campaign_ids"]]
    return {
        "project_id": project.id,
        "project_name": project.name,
        "period_id": report["id"],
        "period_label": report["name"],
        "brand_id": report["brand_id"],
        "campaigns": [{"id": item.id, "name": item.name, "source": item.source, "source_account_id": item.source_account_id, "source_campaign_id": item.source_campaign_id} for item in campaigns],
    }


def _resolve_analysis_scope(
    project_id: str | None,
    period_id: str | None,
    campaign_ids: list[str],
) -> dict | None:
    if not project_id and not period_id and not campaign_ids:
        return None
    if not project_id or not period_id or not campaign_ids:
        raise HTTPException(
            status_code=422,
            detail="ต้องเลือก Project, Period และ Campaign อย่างน้อยหนึ่งรายการให้ครบ",
        )
    try:
        snapshot = portfolio_store.snapshot()
    except PortfolioError as exc:
        raise HTTPException(status_code=500, detail="อ่าน portfolio registry ไม่สำเร็จ") from exc
    project = next((item for item in snapshot.projects if item.id == project_id), None)
    if project is None:
        raise HTTPException(status_code=404, detail="ไม่พบโปรเจกต์ที่เลือก")
    period = next(
        (
            item
            for item in snapshot.periods
            if item.id == period_id and item.project_id == project_id
        ),
        None,
    )
    if period is None:
        raise HTTPException(status_code=422, detail="Period ไม่ได้อยู่ใน Project ที่เลือก")
    unique_campaign_ids = list(dict.fromkeys(campaign_ids))
    selected_campaigns = [
        item
        for item in snapshot.campaigns
        if item.id in unique_campaign_ids and item.project_id == project_id
    ]
    if len(selected_campaigns) != len(unique_campaign_ids):
        raise HTTPException(status_code=422, detail="Campaign scope ไม่ตรงกับ Project ที่เลือก")
    return {
        "project_id": project.id,
        "project_name": project.name,
        "period_id": period.id,
        "period_label": period.label,
        "campaigns": [
            {
                "id": item.id,
                "name": item.name,
                "source": item.source,
                "source_account_id": item.source_account_id,
                "source_campaign_id": item.source_campaign_id,
            }
            for item in selected_campaigns
        ],
    }


def _has_credentials() -> bool:
    return bool(os.getenv("FB_PAGE_ACCESS_TOKEN") and os.getenv("FB_PAGE_ID"))


def _facebook_service() -> FacebookOAuthService:
    return FacebookOAuthService()


def _run_pipeline(posts_raw: list, page_info: dict, since: str, until: str) -> dict:
    """scoring + analyzer + serialize (+ optional Claude layer) — ใช้ร่วมกันทั้ง demo และ live"""
    follower = page_info.get("fan_count") or page_info.get("followers_count") or 1
    baseline = calculate_baseline(posts_raw, follower)
    scorer = PostScorer(baseline, posts_raw)
    scores = {p["post_id"]: scorer.score(p) for p in posts_raw}
    payload = build_payload(posts_raw, scores, baseline, page_info, since, until)
    _enrich_with_claude(payload, posts_raw)
    return payload


def _attach_campaign_results(
    payload: dict,
    posts_raw: list[dict],
    analysis_scope: dict | None,
    source_label: str,
) -> None:
    """Build a transparent campaign ledger; demo rows use deterministic post allocation."""
    if not analysis_scope:
        payload["campaign_results"] = []
        payload["custom_metrics"] = []
        payload["campaign_overview"] = None
        return
    campaigns = analysis_scope["campaigns"]
    paid_posts = [post for post in posts_raw if post.get("post_class") in ("boosted", "ad_only")]
    rows = []
    for index, campaign in enumerate(campaigns):
        assigned = [post for post_index, post in enumerate(paid_posts) if post_index % len(campaigns) == index]
        revenue_values = [
            post.get("ad_revenue")
            if post.get("ad_revenue") is not None
            else (post.get("ad_spend") or 0) * post.get("ad_roas")
            for post in assigned
            if post.get("ad_revenue") is not None or post.get("ad_roas") is not None
        ]
        rows.append(
            {
                "campaign_id": campaign["id"],
                "campaign_name": campaign["name"],
                "source": campaign["source"],
                "source_account_id": campaign["source_account_id"],
                "source_campaign_id": campaign["source_campaign_id"],
                "record_source": source_label,
                "impressions": sum((post.get("ad_impressions") or post.get("impressions") or 0) for post in assigned),
                "reach": sum((post.get("ad_reach") or post.get("reach") or 0) for post in assigned),
                "engagement": sum((post.get("engaged_users") or 0) for post in assigned),
                "link_clicks": sum((post.get("link_clicks") or 0) for post in assigned),
                "spend": round(sum((post.get("ad_spend") or 0) for post in assigned), 2),
                "purchases": round(sum((post.get("ad_purchases") or 0) for post in assigned), 2),
                "revenue": round(sum(revenue_values), 2),
                "post_count": len(assigned),
            }
        )
    try:
        applied, definitions = metric_workspace_store.apply(
            analysis_scope["project_id"], analysis_scope["period_id"], rows
        )
    except MetricWorkspaceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    payload["campaign_results"] = applied
    payload["custom_metrics"] = definitions
    impressions = sum(row.get("impressions") or 0 for row in applied)
    reach = sum(row.get("reach") or 0 for row in applied)
    engagement = sum(row.get("engagement") or 0 for row in applied)
    link_clicks = sum(row.get("link_clicks") or 0 for row in applied)
    spend = sum(row.get("spend") or 0 for row in applied)
    purchases = sum(row.get("purchases") or 0 for row in applied)
    revenue = sum(row.get("revenue") or 0 for row in applied)
    conversion_spend = sum(
        row.get("spend") or 0 for row in applied if (row.get("revenue") or 0) > 0
    )
    manual_fields = sorted({field for row in applied for field in row.get("manual_fields", [])})
    payload["campaign_overview"] = {
        "impressions_total": impressions,
        "reach_total": reach,
        "reach_organic": 0,
        "reach_paid": reach,
        "frequency": round(impressions / reach, 2) if reach else None,
        "engagement_total": engagement,
        "avg_er": round(engagement / reach * 100, 2) if reach else None,
        "link_clicks_total": link_clicks,
        "link_ctr": round(link_clicks / impressions * 100, 2) if impressions else None,
        "spend_total": round(spend, 2) if spend else None,
        "cpm": round(spend / impressions * 1000, 2) if spend and impressions else None,
        "cpe": round(spend / engagement, 2) if spend and engagement else None,
        "purchases": round(purchases, 2),
        "revenue": round(revenue, 2),
        "conversion_spend": round(conversion_spend, 2) if conversion_spend else None,
        "revenue_source": "manual_or_import" if "revenue" in manual_fields else "meta_action_values",
        "roas": round(revenue / conversion_spend, 2) if revenue and conversion_spend else None,
        "roi": round((revenue - conversion_spend) / conversion_spend * 100, 2) if revenue and conversion_spend else None,
        "manual_fields": manual_fields,
    }


def _demo_payload(since_date: date, until_date: date, analysis_scope: dict | None) -> dict:
    from sample_data import sample_page_info, sample_posts

    posts_raw = sample_posts(
        start_date=since_date,
        span_days=(until_date - since_date).days + 1,
    )
    payload = _run_pipeline(
        posts_raw,
        sample_page_info(),
        str(since_date),
        str(until_date),
    )
    payload["demo"] = True
    payload["scope"] = analysis_scope
    _attach_campaign_results(payload, posts_raw, analysis_scope, "demo")
    return payload


def _public_snapshot(payload: dict) -> dict:
    """Strip provider identifiers and mark the immutable client-facing copy read-only."""
    safe = json.loads(json.dumps(payload))
    for campaign in (safe.get("scope") or {}).get("campaigns", []):
        campaign.pop("source_account_id", None)
        campaign.pop("source_campaign_id", None)
    for row in safe.get("campaign_results", []):
        row.pop("source_account_id", None)
        row.pop("source_campaign_id", None)
        row.pop("override_reason", None)
        row.pop("override_updated_at", None)
    safe["read_only"] = True
    return safe


def _enrich_with_claude(payload: dict, posts_raw: list) -> None:
    """
    ชั้น Claude API (optional) — ถ้ามี ANTHROPIC_API_KEY จะเติม
      - topic / content_type / hook_style ราย post
      - ai_summary narrative ภาพรวม
    ถ้าเรียกไม่ได้/ไม่มี key → ai.enabled = False, frontend fallback เป็น deterministic insight
    """
    enabled = topic_extractor.is_available()
    payload["ai"] = {"enabled": enabled, "source": "claude" if enabled else None}
    if not enabled:
        return
    try:
        topics = topic_extractor.extract_topics(posts_raw)
        if topics:
            for p in payload["posts"]:
                tag = topics.get(p["id"])
                if tag:
                    p["topic"] = tag.get("topic")
                    p["content_type"] = tag.get("content_type")
                    p["hook_style"] = tag.get("hook_style")
        summary = topic_extractor.generate_overview_insight(
            payload["overview"], payload["baseline"], payload["format_perf"],
            payload["correlations"], payload["creative_patterns"],
        )
        if summary:
            payload["ai_summary"] = summary
    except Exception:
        logger.exception("Optional AI enrichment failed")
        payload["ai"] = {
            "enabled": False,
            "source": None,
            "error": "AI enrichment ไม่พร้อมใช้งานในรอบนี้",
        }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "has_credentials": _has_credentials(),
        "auth_configured": security_settings.configured,
    }


@app.get("/api/auth/status")
def auth_status(request: Request):
    return {
        "configured": security_settings.configured,
        "required": security_settings.configured or security_settings.production,
        "authenticated": _is_authenticated(request),
    }


@app.post("/api/auth/login")
def auth_login(payload: LoginRequest, request: Request, response: Response):
    _enforce_rate_limit(request, action="login", limit=5, window_seconds=300)
    if not security_settings.configured:
        raise HTTPException(status_code=503, detail="ยังไม่ได้ตั้งค่าระบบล็อกอิน")
    if not session_manager.password_matches(payload.password):
        raise HTTPException(status_code=401, detail="รหัสผ่านไม่ถูกต้อง")
    response.set_cookie(
        SESSION_COOKIE,
        session_manager.create_session(),
        max_age=12 * 60 * 60,
        httponly=True,
        secure=app_base_url.startswith("https://"),
        samesite="lax",
        path="/",
    )
    return {"authenticated": True}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    _require_authenticated(request)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"authenticated": False}


@app.get("/api/import/contracts")
def import_contracts(request: Request):
    """Canonical contract used by future API/file import screens."""
    _require_authenticated(request)
    return {
        "schema_version": 1,
        "stages": [stage.value for stage in ImportStage],
        "source_kinds": [kind.value for kind in SourceKind],
        "dimensions": [
            {
                "key": spec.key,
                "label": spec.label,
                "data_type": spec.data_type.value,
                "required": spec.required_for_import,
            }
            for spec in DIMENSIONS.values()
        ],
        "metrics": [
            {
                "key": spec.key,
                "label": spec.label,
                "data_type": spec.data_type.value,
                "aggregation": spec.aggregation.value,
                "unit": spec.unit,
            }
            for spec in METRICS.values()
        ],
    }


@app.get("/api/portfolio")
def portfolio_snapshot(request: Request):
    """Return the one-workspace portfolio registry used to scope reports and imports."""
    _require_authenticated(request)
    try:
        return portfolio_store.snapshot().model_dump(mode="json")
    except PortfolioError as exc:
        raise HTTPException(status_code=500, detail="อ่าน portfolio registry ไม่สำเร็จ") from exc


@app.patch("/api/portfolio/workspace")
def portfolio_update_workspace(payload: WorkspaceUpdate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="portfolio_write", limit=60, window_seconds=60)
    return portfolio_store.update_workspace(payload).model_dump(mode="json")


@app.post("/api/portfolio/brands", status_code=201)
def portfolio_create_brand(payload: BrandCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="portfolio_write", limit=60, window_seconds=60)
    try:
        return portfolio_store.create_brand(payload).model_dump(mode="json")
    except PortfolioError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/portfolio/projects", status_code=201)
def portfolio_create_project(payload: ProjectCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="portfolio_write", limit=60, window_seconds=60)
    try:
        return portfolio_store.create_project(payload).model_dump(mode="json")
    except PortfolioError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/portfolio/periods", status_code=201)
def portfolio_create_period(payload: ReportPeriodCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="portfolio_write", limit=60, window_seconds=60)
    try:
        return portfolio_store.create_period(payload).model_dump(mode="json")
    except PortfolioError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/portfolio/campaigns", status_code=201)
def portfolio_create_campaign(payload: CampaignCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="portfolio_write", limit=60, window_seconds=60)
    try:
        return portfolio_store.create_campaign(payload).model_dump(mode="json")
    except PortfolioError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/reports")
def report_library_list(request: Request, brand_id: str | None = Query(default=None, max_length=80), include_archived: bool = False):
    _require_authenticated(request)
    try:
        return report_library_store.list({brand_id} if brand_id else None, include_archived)
    except ReportLibraryError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/reports", status_code=201)
def report_library_create(payload: ReportCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="report_library_write", limit=60, window_seconds=60)
    _validate_report_scope(payload)
    try:
        return report_library_store.create(payload)
    except ReportLibraryError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/reports/{report_id}")
def report_library_detail(report_id: str, request: Request):
    _require_authenticated(request)
    try:
        return report_library_store.get(report_id)
    except ReportLibraryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/reports/{report_id}")
def report_library_update(report_id: str, payload: ReportUpdate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="report_library_write", limit=60, window_seconds=60)
    try:
        current = report_library_store.get(report_id)["report"]
        _validate_report_scope(payload, current)
        return report_library_store.update(report_id, payload)
    except ReportLibraryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/reports/{report_id}")
def report_library_archive(report_id: str, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="report_library_write", limit=60, window_seconds=60)
    try:
        return report_library_store.archive(report_id)
    except ReportLibraryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/reports/{report_id}/publish")
def report_library_publish(report_id: str, payload: ReportPublish, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="report_publish", limit=20, window_seconds=60)
    try:
        report = report_library_store.get(report_id)["report"]
        _validate_report_scope(ReportUpdate(), report)
        if not payload.demo:
            raise HTTPException(status_code=501, detail="ข้อมูลจริงต้องผ่าน import validation ก่อน Publish")
        analysis = _demo_payload(date.fromisoformat(report["date_from"]), date.fromisoformat(report["date_to"]), _library_analysis_scope(report))
        analysis["report"] = {key: report[key] for key in ("id", "brand_id", "name", "date_from", "date_to")}
        return report_library_store.publish(report_id, _public_snapshot(analysis), payload.note)
    except ReportLibraryError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/projects/{project_id}/elements")
def report_element_list(
    project_id: str,
    request: Request,
    report_key: str = Query(default="working", min_length=1, max_length=80),
):
    _require_authenticated(request)
    _require_element_owner(project_id)
    try:
        return {
            "project_id": project_id,
            "report_key": report_key,
            "elements": [
                item.model_dump(mode="json")
                for item in report_element_store.list(project_id, report_key)
            ],
        }
    except ReportElementError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/elements", status_code=201)
def report_element_create(
    project_id: str, payload: ReportElementCreate, request: Request
):
    _require_authenticated(request)
    _require_element_owner(project_id)
    _enforce_rate_limit(request, action="report_element_write", limit=120, window_seconds=60)
    try:
        return report_element_store.create(project_id, payload).model_dump(mode="json")
    except ReportElementError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/projects/{project_id}/elements/{element_id}")
def report_element_update(
    project_id: str,
    element_id: str,
    payload: ReportElementUpdate,
    request: Request,
):
    _require_authenticated(request)
    _require_element_owner(project_id)
    _enforce_rate_limit(request, action="report_element_write", limit=120, window_seconds=60)
    try:
        return report_element_store.update(project_id, element_id, payload).model_dump(
            mode="json"
        )
    except ReportElementError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.delete("/api/projects/{project_id}/elements/{element_id}")
def report_element_delete(project_id: str, element_id: str, request: Request):
    _require_authenticated(request)
    _require_element_owner(project_id)
    _enforce_rate_limit(request, action="report_element_write", limit=120, window_seconds=60)
    try:
        deleted = report_element_store.delete(project_id, element_id)
    except ReportElementError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="ไม่พบ report element")
    return {"deleted": True}


@app.get("/api/facebook/status")
def facebook_status(request: Request):
    """Return safe connection metadata. Access tokens never leave the backend."""
    _require_authenticated(request)
    try:
        return _facebook_service().status()
    except FacebookConnectionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/facebook/oauth/start")
def facebook_oauth_start(request: Request, response: Response):
    """Create a signed OAuth attempt and return Meta's consent URL."""
    _require_authenticated(request)
    _enforce_rate_limit(request, action="facebook_oauth", limit=10, window_seconds=600)
    try:
        service = _facebook_service()
        state = service.create_state()
        authorization_url = service.authorization_url(state)
        response.set_cookie(
            "fb_oauth_state",
            state,
            max_age=600,
            httponly=True,
            secure=service.config.redirect_uri.startswith("https://"),
            samesite="lax",
            path="/api/facebook/oauth/callback",
        )
        return {
            "authorization_url": authorization_url,
            "redirect_uri": service.config.redirect_uri,
        }
    except FacebookConnectionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/facebook/oauth/callback")
def facebook_oauth_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    """Exchange the code server-side, encrypt tokens, then return to the app."""
    service = _facebook_service()
    if not _is_authenticated(request):
        return RedirectResponse(
            f"{service.config.frontend_url}/?auth=required", status_code=302
        )
    stored_state = request.cookies.get("fb_oauth_state")
    state_matches = bool(state and stored_state and hmac.compare_digest(state, stored_state))
    if error:
        target = f"{service.config.frontend_url}/?facebook=cancelled"
    elif not code or not state:
        target = f"{service.config.frontend_url}/?facebook=missing_callback"
    elif not state_matches:
        target = f"{service.config.frontend_url}/?facebook=state_mismatch"
    else:
        try:
            service.complete_oauth(code, state)
            target = f"{service.config.frontend_url}/?facebook=connected"
        except FacebookConnectionError:
            target = f"{service.config.frontend_url}/?facebook=connection_failed"
    redirect = RedirectResponse(target, status_code=302)
    redirect.delete_cookie("fb_oauth_state", path="/api/facebook/oauth/callback")
    return redirect


@app.post("/api/facebook/refresh")
def facebook_refresh(request: Request):
    """Re-read accessible Pages and Ad Accounts from Meta."""
    _require_authenticated(request)
    _enforce_rate_limit(request, action="facebook_refresh", limit=10, window_seconds=60)
    try:
        return _facebook_service().refresh_resources()
    except FacebookConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete("/api/facebook/connection")
def facebook_disconnect(request: Request):
    """Delete this workspace's encrypted Facebook connection."""
    _require_authenticated(request)
    _enforce_rate_limit(request, action="facebook_disconnect", limit=5, window_seconds=60)
    deleted = _facebook_service().store.delete()
    return {"disconnected": deleted}


@app.patch("/api/projects/{project_id}/campaign-metrics")
def update_campaign_metrics(project_id: str, payload: MetricOverrideUpsert, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="metric_override", limit=60, window_seconds=60)
    if payload.period_id.startswith("rpt_"):
        try:
            report = report_library_store.get(payload.period_id)["report"]
        except ReportLibraryError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if report.get("project_id") != project_id or payload.campaign_id not in report.get("campaign_ids", []):
            raise HTTPException(status_code=422, detail="Campaign ไม่ได้อยู่ในรายงานนี้")
    else:
        _resolve_analysis_scope(project_id, payload.period_id, [payload.campaign_id])
    try:
        return metric_workspace_store.upsert_override(project_id, payload)
    except MetricWorkspaceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/projects/{project_id}/custom-metrics", status_code=201)
def create_custom_metric(project_id: str, payload: CustomMetricCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="custom_metric", limit=20, window_seconds=60)
    _require_project(project_id)
    try:
        return metric_workspace_store.create_custom_metric(project_id, payload)
    except MetricWorkspaceError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/api/report-shares", status_code=201)
def create_report_share(payload: ReportShareCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="report_share", limit=10, window_seconds=60)
    scope = _resolve_analysis_scope(payload.project_id, payload.period_id, payload.campaign_ids)
    if not payload.demo:
        raise HTTPException(
            status_code=501,
            detail="การสร้าง snapshot จากข้อมูลจริงจะเปิดพร้อม scoped Ads Insights connector",
        )
    report = _demo_payload(payload.since, payload.until, scope)
    created = report_share_store.create(_public_snapshot(report), payload.expires_days)
    return created


@app.get("/api/public/reports/{token}")
def public_report(token: str, request: Request):
    _enforce_rate_limit(request, action="public_report", limit=60, window_seconds=60)
    try:
        record = report_share_store.get(token)
    except ReportShareError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "id": record["id"],
        "created_at": record["created_at"],
        "expires_at": record["expires_at"],
        "report": record["payload"],
    }


@app.get("/api/analyze")
def analyze(
    request: Request,
    since: date | None = Query(default=None),
    until: date | None = Query(default=None),
    demo: int = Query(default=0),
    project_id: str | None = Query(default=None, max_length=80),
    period_id: str | None = Query(default=None, max_length=80),
    campaign_ids: list[str] | None = Query(default=None),
    report_id: str | None = Query(default=None, max_length=80),
):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="analyze", limit=30, window_seconds=60)
    saved_report = None
    if report_id:
        try:
            saved_report = report_library_store.get(report_id)["report"]
        except ReportLibraryError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    until_date = date.fromisoformat(saved_report["date_to"]) if saved_report else (until or date.today())
    since_date = date.fromisoformat(saved_report["date_from"]) if saved_report else (since or (until_date - timedelta(days=89)))
    if since_date > until_date:
        raise HTTPException(status_code=422, detail="วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด")
    since_value = str(since_date)
    until_value = str(until_date)
    analysis_scope = _library_analysis_scope(saved_report) if saved_report else _resolve_analysis_scope(project_id, period_id, campaign_ids or [])

    use_demo = bool(demo) or not _has_credentials()

    if use_demo:
        payload = _demo_payload(since_date, until_date, analysis_scope)
        if saved_report:
            payload["report"] = {key: saved_report[key] for key in ("id", "brand_id", "name", "date_from", "date_to", "status", "current_revision")}
        return payload

    if analysis_scope:
        raise HTTPException(
            status_code=501,
            detail="Project-scoped live import ต้องใช้ Ads Insights connector ซึ่งยังไม่เปิดใช้งาน",
        )

    try:
        from api_client import FBClient
        client = FBClient()
        page_info = client.get_page_info()
        posts_raw = client.pull_all(since_value, until_value)
        payload = _run_pipeline(posts_raw, page_info, since_value, until_value)
        payload["demo"] = False
        payload["scope"] = None
        _attach_campaign_results(payload, posts_raw, None, "meta_api")
        return payload
    except Exception:
        logger.exception("Facebook analysis pipeline failed")
        return JSONResponse(
            status_code=502,
            content={"error": "ดึงหรือประมวลผลข้อมูลจาก Facebook ไม่สำเร็จ"},
        )


# Production serves the compiled React app from the same origin as the API.
frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
