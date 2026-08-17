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
import logging
import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app_security import RateLimiter, SecuritySettings, SessionManager, SESSION_COOKIE
from import_pipeline.models import ImportStage, SourceKind
from import_pipeline.registry import DIMENSIONS, METRICS
from portfolio import (
    BrandCreate,
    CampaignCreate,
    PortfolioError,
    PortfolioStore,
    ProjectCreate,
    WorkspaceUpdate,
)
from report_elements import (
    ReportElementCreate,
    ReportElementError,
    ReportElementStore,
    ReportElementUpdate,
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


@app.post("/api/portfolio/campaigns", status_code=201)
def portfolio_create_campaign(payload: CampaignCreate, request: Request):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="portfolio_write", limit=60, window_seconds=60)
    try:
        return portfolio_store.create_campaign(payload).model_dump(mode="json")
    except PortfolioError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/projects/{project_id}/elements")
def report_element_list(
    project_id: str,
    request: Request,
    report_key: str = Query(default="working", min_length=1, max_length=80),
):
    _require_authenticated(request)
    _require_project(project_id)
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
    _require_project(project_id)
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
    _require_project(project_id)
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
    _require_project(project_id)
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


@app.get("/api/analyze")
def analyze(
    request: Request,
    since: date | None = Query(default=None),
    until: date | None = Query(default=None),
    demo: int = Query(default=0),
):
    _require_authenticated(request)
    _enforce_rate_limit(request, action="analyze", limit=30, window_seconds=60)
    until_date = until or date.today()
    since_date = since or (until_date - timedelta(days=89))
    if since_date > until_date:
        raise HTTPException(status_code=422, detail="วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด")
    since_value = str(since_date)
    until_value = str(until_date)

    use_demo = bool(demo) or not _has_credentials()

    if use_demo:
        from sample_data import sample_posts, sample_page_info
        posts_raw = sample_posts(start_date=since_date, span_days=(until_date - since_date).days + 1)
        page_info = sample_page_info()
        payload = _run_pipeline(posts_raw, page_info, since_value, until_value)
        payload["demo"] = True
        return payload

    try:
        from api_client import FBClient
        client = FBClient()
        page_info = client.get_page_info()
        posts_raw = client.pull_all(since_value, until_value)
        payload = _run_pipeline(posts_raw, page_info, since_value, until_value)
        payload["demo"] = False
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
