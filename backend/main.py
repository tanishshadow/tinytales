"""
TinyTales backend API.

Story generation still uses Gemini, while the rest of the product now exposes
real persistence-backed endpoints so the frontend feature pages can save and
load working state.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from pathlib import Path
from urllib.parse import urlencode
from typing import Any, Optional
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel

from story_generator import generate_story
from storybook import (
    AudioSettings,
    ExperienceSettings,
    InputPreferences,
    ParentControls,
    PersonalizationProfile,
    StoryPage,
    StoryGenerationCacheEntry,
    Storybook,
    StorybookStore,
)

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")
AUTH_COOKIE_SECRET = os.getenv("AUTH_COOKIE_SECRET", "")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000").rstrip("/")
AUTH_COOKIE_SECURE = os.getenv("AUTH_COOKIE_SECURE", "false").lower() == "true"
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", "lax").lower()
if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    AUTH_COOKIE_SAMESITE = "lax"
AUTH_SESSION_COOKIE = "tinytales_session"
AUTH_STATE_COOKIE = "tinytales_oauth_state"
AUTH_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

if not GEMINI_API_KEY:
    print("[WARNING] GEMINI_API_KEY not set -- story generation will fail")

if not AUTH_COOKIE_SECRET:
    AUTH_COOKIE_SECRET = secrets.token_urlsafe(32)
    print("[WARNING] AUTH_COOKIE_SECRET not set -- sessions reset when the server restarts")

if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
    print("[WARNING] Google OAuth is not configured -- auth endpoints will return 503")


class StoryUpdateRequest(BaseModel):
    title: Optional[str] = None
    child_name: Optional[str] = None
    tone: Optional[str] = None
    original_prompt: Optional[str] = None
    pages: Optional[list[StoryPage]] = None


class FavoriteRequest(BaseModel):
    is_favorite: bool


class StoryExportResponse(BaseModel):
    id: str
    title: str
    printable_text: str
    share_url: Optional[str] = None


class AuthUser(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None


class AuthSessionResponse(BaseModel):
    authenticated: bool
    user: Optional[AuthUser] = None


DATA_PATH = Path(__file__).resolve().parent / "data" / "storybook_store.json"

app = FastAPI(
    title="TinyTales API",
    description="Gemini-powered backend for the children's storybook generator",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://tinytales-azure.vercel.app",
        "https://tinytales-azure.vercel.app/"
    ],
    allow_origin_regex=r"https://([a-zA-Z0-9-]+\.)?vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = StorybookStore(DATA_PATH)


def auth_redirect_uri(request: Request) -> str:
    if GOOGLE_REDIRECT_URI:
        return GOOGLE_REDIRECT_URI
    return str(request.url_for("google_auth_callback"))


def encode_cookie_payload(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    body = urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    signature = hmac.new(AUTH_COOKIE_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    signed = urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"{body}.{signed}"


def decode_cookie_payload(value: str) -> dict[str, Any] | None:
    try:
        body, signed = value.split(".", 1)
    except ValueError:
        return None

    expected = hmac.new(AUTH_COOKIE_SECRET.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    expected_signed = urlsafe_b64encode(expected).decode("ascii").rstrip("=")
    if not hmac.compare_digest(expected_signed, signed):
        return None

    padded = body + "=" * (-len(body) % 4)
    try:
        decoded = urlsafe_b64decode(padded.encode("ascii"))
        return json.loads(decoded.decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None


def get_session_user(request: Request) -> AuthUser | None:
    payload = decode_cookie_payload(request.cookies.get(AUTH_SESSION_COOKIE, ""))
    if not payload or int(payload.get("exp", 0)) < int(time.time()):
        return None

    user_payload = payload.get("user")
    if not isinstance(user_payload, dict):
        return None
    try:
        return AuthUser(**user_payload)
    except ValueError:
        return None


def set_session_cookie(response: RedirectResponse | JSONResponse, user: AuthUser) -> None:
    payload = {
        "user": user.model_dump(),
        "exp": int(time.time()) + AUTH_SESSION_TTL_SECONDS,
    }
    response.set_cookie(
        AUTH_SESSION_COOKIE,
        encode_cookie_payload(payload),
        max_age=AUTH_SESSION_TTL_SECONDS,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
    )


def require_story(book_id: str) -> Storybook:
    book = store.get(book_id)
    if book is None:
        raise HTTPException(404, "Storybook not found")
    return book


def build_story_export_text(book: Storybook) -> str:
    page_lines = []
    for page in book.pages:
        page_lines.append(f"Page {page.page_number}")
        page_lines.append(page.text)
        page_lines.append("")
    return "\n".join(
        [
            book.title,
            f"Child: {book.child_name}",
            f"Tone: {book.tone}",
            f"Prompt: {book.original_prompt}",
            "",
            *page_lines,
        ]
    ).strip()


def normalize_cache_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def build_generation_cache_key(
    prompt: str,
    child_name: str,
    tone: str,
    num_pages: int,
) -> str:
    normalized_parts = [
        normalize_cache_text(prompt),
        normalize_cache_text(child_name),
        normalize_cache_text(tone).lower(),
        str(int(num_pages)),
    ]
    return hashlib.sha256("||".join(normalized_parts).encode("utf-8")).hexdigest()


@app.get("/api/auth/google")
async def start_google_auth(request: Request, mode: str = "login"):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(503, "Google OAuth is not configured")

    auth_mode = "signup" if mode == "signup" else "login"
    state = secrets.token_urlsafe(32)
    state_payload = encode_cookie_payload(
        {
            "state": state,
            "mode": auth_mode,
            "exp": int(time.time()) + 600,
        }
    )
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": auth_redirect_uri(request),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account",
    }
    response = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}", status_code=302)
    response.set_cookie(
        AUTH_STATE_COOKIE,
        state_payload,
        max_age=600,
        httponly=True,
        secure=AUTH_COOKIE_SECURE,
        samesite=AUTH_COOKIE_SAMESITE,
    )
    return response


@app.get("/api/auth/google/callback", name="google_auth_callback")
async def google_auth_callback(request: Request, code: str = "", state: str = "", error: str = ""):
    if error:
        return RedirectResponse(f"{FRONTEND_BASE_URL}/auth.html?auth=error&reason=google", status_code=302)
    if not code or not state:
        raise HTTPException(400, "Missing OAuth callback data")

    state_payload = decode_cookie_payload(request.cookies.get(AUTH_STATE_COOKIE, ""))
    if not state_payload or state_payload.get("state") != state or int(state_payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(400, "Invalid OAuth state")

    async with httpx.AsyncClient(timeout=12) as client:
        token_response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": auth_redirect_uri(request),
                "grant_type": "authorization_code",
            },
        )
        if token_response.status_code >= 400:
            raise HTTPException(502, "Google token exchange failed")
        token_payload = token_response.json()
        user_response = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {token_payload.get('access_token', '')}"},
        )
        if user_response.status_code >= 400:
            raise HTTPException(502, "Google profile lookup failed")
        profile = user_response.json()

    email = str(profile.get("email") or "").strip().lower()
    subject = str(profile.get("sub") or "").strip()
    if not email or not subject:
        raise HTTPException(502, "Google profile did not include an email address")

    user = AuthUser(
        id=subject,
        email=email,
        name=str(profile.get("name") or email.split("@")[0]),
        picture=profile.get("picture"),
    )
    mode = state_payload.get("mode") or "login"
    response = RedirectResponse(f"{FRONTEND_BASE_URL}/auth.html?auth=success&mode={mode}", status_code=302)
    set_session_cookie(response, user)
    response.delete_cookie(AUTH_STATE_COOKIE, secure=AUTH_COOKIE_SECURE, samesite=AUTH_COOKIE_SAMESITE)
    return response


@app.get("/api/auth/session", response_model=AuthSessionResponse)
async def get_auth_session(request: Request):
    user = get_session_user(request)
    return AuthSessionResponse(authenticated=bool(user), user=user)


@app.post("/api/auth/logout")
async def logout():
    response = JSONResponse({"authenticated": False})
    response.delete_cookie(AUTH_SESSION_COOKIE, secure=AUTH_COOKIE_SECURE, samesite=AUTH_COOKIE_SAMESITE)
    return response


@app.post("/api/generate")
async def create_storybook(
    prompt: str = Form(..., description="The child's fear, worry, or story seed"),
    child_name: Optional[str] = Form("the little one", description="Child's name for personalization"),
    tone: Optional[str] = Form("gentle", description="Story tone: gentle | fun | adventurous"),
    num_pages: Optional[int] = Form(5, ge=3, le=10, description="Number of story pages"),
):
    if not GEMINI_API_KEY:
        raise HTTPException(503, "Gemini API key is not configured")

    clean_prompt = normalize_cache_text(prompt)
    if not clean_prompt:
        raise HTTPException(422, "Prompt cannot be empty")

    requested_child_name = normalize_cache_text(child_name or "the little one") or "the little one"
    requested_tone = normalize_cache_text(tone or "gentle").lower() or "gentle"
    requested_num_pages = num_pages or 5
    request_cache_key = build_generation_cache_key(
        prompt=clean_prompt,
        child_name=requested_child_name,
        tone=requested_tone,
        num_pages=requested_num_pages,
    )

    saved_profile = store.get_personalization()
    resolved_child_name = saved_profile.child_name or requested_child_name
    cached_generation = store.get_cached_generation(request_cache_key)

    if cached_generation is not None:
        book = Storybook(
            id=uuid4().hex[:16],
            title=cached_generation.title,
            child_name=resolved_child_name,
            original_prompt=clean_prompt,
            tone=cached_generation.tone,
            pages=cached_generation.pages,
            input_preferences=store.get_input_preferences(),
            personalization=saved_profile.model_copy(update={"child_name": resolved_child_name}),
            audio_settings=store.get_audio_settings(),
            experience_settings=store.get_experience_settings(),
            parent_controls=store.get_parent_controls(),
            request_cache_key=request_cache_key,
            generation_source="cache",
        )
        store.save(book)
        return JSONResponse(content=book.to_dict(), status_code=201)

    try:
        storybook_data = await generate_story(
            prompt=clean_prompt,
            child_name=requested_child_name,
            tone=requested_tone,
            num_pages=requested_num_pages,
            gemini_api_key=GEMINI_API_KEY,
        )
    except Exception as exc:
        raise HTTPException(502, f"Story generation failed: {exc}")

    store.save_cached_generation(
        StoryGenerationCacheEntry(
            request_cache_key=request_cache_key,
            title=storybook_data["title"],
            child_name=storybook_data["child_name"],
            original_prompt=clean_prompt,
            tone=requested_tone,
            num_pages=requested_num_pages,
            pages=storybook_data["pages"],
        )
    )

    storybook_payload = dict(storybook_data)
    storybook_payload["child_name"] = resolved_child_name
    storybook_payload["original_prompt"] = clean_prompt
    storybook_payload["tone"] = requested_tone

    book = Storybook(
        **storybook_payload,
        input_preferences=store.get_input_preferences(),
        personalization=saved_profile.model_copy(update={"child_name": resolved_child_name}),
        audio_settings=store.get_audio_settings(),
        experience_settings=store.get_experience_settings(),
        parent_controls=store.get_parent_controls(),
        request_cache_key=request_cache_key,
        generation_source="gemini",
    )
    store.save(book)
    return JSONResponse(content=book.to_dict(), status_code=201)


@app.get("/api/storybook/{storybook_id}")
async def get_storybook(storybook_id: str):
    return require_story(storybook_id).to_dict()


@app.patch("/api/storybook/{storybook_id}")
async def update_storybook(storybook_id: str, payload: StoryUpdateRequest):
    book = require_story(storybook_id)
    changes: dict[str, Any] = {}
    if payload.title is not None:
        changes["title"] = payload.title.strip() or book.title
    if payload.child_name is not None:
        changes["child_name"] = payload.child_name.strip() or book.child_name
    if payload.tone is not None:
        changes["tone"] = payload.tone.strip() or book.tone
    if payload.original_prompt is not None:
        changes["original_prompt"] = payload.original_prompt.strip() or book.original_prompt
    if payload.pages is not None:
        changes["pages"] = payload.pages

    updated = store.update_story(storybook_id, **changes)
    if updated is None:
        raise HTTPException(404, "Storybook not found")
    return updated.to_dict()


@app.post("/api/storybook/{storybook_id}/favorite")
async def set_storybook_favorite(storybook_id: str, payload: FavoriteRequest):
    updated = store.set_favorite(storybook_id, payload.is_favorite)
    if updated is None:
        raise HTTPException(404, "Storybook not found")
    return updated.summary_dict()


@app.post("/api/storybook/{storybook_id}/share")
async def create_storybook_share(storybook_id: str):
    updated = store.create_share_id(storybook_id)
    if updated is None:
        raise HTTPException(404, "Storybook not found")
    return {
        "id": updated.id,
        "share_id": updated.share_id,
        "share_path": f"/api/shared/{updated.share_id}",
    }


@app.get("/api/shared/{share_id}")
async def get_shared_storybook(share_id: str):
    book = store.get_by_share_id(share_id)
    if book is None:
        raise HTTPException(404, "Shared storybook not found")
    return book.to_dict()


@app.get("/api/storybook/{storybook_id}/export")
async def export_storybook(storybook_id: str):
    book = require_story(storybook_id)
    return StoryExportResponse(
        id=book.id,
        title=book.title,
        printable_text=build_story_export_text(book),
        share_url=f"/api/shared/{book.share_id}" if book.share_id else None,
    )


@app.get("/api/storybooks")
async def list_storybooks():
    return [book.summary_dict() for book in store.list_all()]


@app.get("/api/preferences/input")
async def get_input_preferences():
    return store.get_input_preferences().model_dump()


@app.put("/api/preferences/input")
async def update_input_preferences(payload: InputPreferences):
    return store.update_input_preferences(payload).model_dump()


@app.get("/api/preferences/personalization")
async def get_personalization():
    return store.get_personalization().model_dump()


@app.put("/api/preferences/personalization")
async def update_personalization(payload: PersonalizationProfile):
    return store.update_personalization(payload).model_dump()


@app.get("/api/preferences/audio")
async def get_audio_settings():
    return store.get_audio_settings().model_dump()


@app.put("/api/preferences/audio")
async def update_audio_settings(payload: AudioSettings):
    return store.update_audio_settings(payload).model_dump()


@app.get("/api/preferences/experience")
async def get_experience_settings():
    return store.get_experience_settings().model_dump()


@app.put("/api/preferences/experience")
async def update_experience_settings(payload: ExperienceSettings):
    return store.update_experience_settings(payload).model_dump()


@app.get("/api/parent-controls")
async def get_parent_controls():
    return store.get_parent_controls().model_dump()


@app.put("/api/parent-controls")
async def update_parent_controls(payload: ParentControls):
    return store.update_parent_controls(payload).model_dump()


@app.get("/api/dashboard")
async def get_dashboard():
    return store.dashboard()


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
        "story_count": len(store.list_all()),
        "data_path": str(DATA_PATH),
    }
