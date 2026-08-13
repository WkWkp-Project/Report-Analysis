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
import os
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from import_pipeline.models import ImportStage, SourceKind
from import_pipeline.registry import DIMENSIONS, METRICS
from scoring import PostScorer, calculate_baseline
from serializer import build_payload
import topic_extractor
from facebook_connection import FacebookConnectionError, FacebookOAuthService

load_dotenv()

app = FastAPI(title="FB Performance Analyzer API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)


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
    except Exception as e:
        payload["ai"] = {"enabled": False, "source": None, "error": str(e)[:200]}


@app.get("/api/health")
def health():
    return {"status": "ok", "has_credentials": _has_credentials()}


@app.get("/api/import/contracts")
def import_contracts():
    """Canonical contract used by future API/file import screens."""
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


@app.get("/api/facebook/status")
def facebook_status():
    """Return safe connection metadata. Access tokens never leave the backend."""
    try:
        return _facebook_service().status()
    except FacebookConnectionError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/facebook/oauth/start")
def facebook_oauth_start(response: Response):
    """Create a signed OAuth attempt and return Meta's consent URL."""
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
def facebook_refresh():
    """Re-read accessible Pages and Ad Accounts from Meta."""
    try:
        return _facebook_service().refresh_resources()
    except FacebookConnectionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.delete("/api/facebook/connection")
def facebook_disconnect():
    """Delete this workspace's encrypted Facebook connection."""
    deleted = _facebook_service().store.delete()
    return {"disconnected": deleted}


@app.get("/api/analyze")
def analyze(
    since: str = Query(default=None),
    until: str = Query(default=None),
    demo: int = Query(default=0),
):
    until = until or str(date.today())
    since = since or str(date.today() - timedelta(days=90))

    use_demo = bool(demo) or not _has_credentials()

    if use_demo:
        from sample_data import sample_posts, sample_page_info
        posts_raw = sample_posts()
        page_info = sample_page_info()
        payload = _run_pipeline(posts_raw, page_info, since, until)
        payload["demo"] = True
        return payload

    try:
        from api_client import FBClient
        client = FBClient()
        page_info = client.get_page_info()
        posts_raw = client.pull_all(since, until)
        payload = _run_pipeline(posts_raw, page_info, since, until)
        payload["demo"] = False
        return payload
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": str(e)})


# Production serves the compiled React app from the same origin as the API.
frontend_dist = Path(__file__).parent / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
