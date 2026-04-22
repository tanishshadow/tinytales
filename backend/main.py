"""
TinyTales backend API.

Story generation still uses Gemini, while the rest of the product now exposes
real persistence-backed endpoints so the frontend feature pages can save and
load working state.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

if not GEMINI_API_KEY:
    print("[WARNING] GEMINI_API_KEY not set -- story generation will fail")


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
    ],
    allow_origin_regex=r"https://([a-zA-Z0-9-]+\.)?vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
store = StorybookStore(DATA_PATH)


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

    book = Storybook(
        **storybook_data,
        child_name=resolved_child_name,
        original_prompt=clean_prompt,
        tone=requested_tone,
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
