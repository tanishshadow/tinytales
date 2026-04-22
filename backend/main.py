"""
TinyTales backend API.

Story generation still uses Gemini, while the rest of the product now exposes
real persistence-backed endpoints so the frontend feature pages can save and
load working state.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

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
    allow_origins=["null"],
    allow_origin_regex=r"https://.*\.vercel\.app|http://localhost(?::\d+)?|http://127\.0\.0\.1(?::\d+)?",
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


@app.post("/api/generate")
async def create_storybook(
    prompt: str = Form(..., description="The child's fear, worry, or story seed"),
    child_name: Optional[str] = Form("the little one", description="Child's name for personalization"),
    tone: Optional[str] = Form("gentle", description="Story tone: gentle | fun | adventurous"),
    num_pages: Optional[int] = Form(5, ge=3, le=10, description="Number of story pages"),
):
    if not GEMINI_API_KEY:
        raise HTTPException(503, "Gemini API key is not configured")

    try:
        storybook_data = await generate_story(
            prompt=prompt,
            child_name=child_name or "the little one",
            tone=tone or "gentle",
            num_pages=num_pages or 5,
            gemini_api_key=GEMINI_API_KEY,
        )
    except Exception as exc:
        raise HTTPException(502, f"Story generation failed: {exc}")

    saved_profile = store.get_personalization()
    resolved_child_name = saved_profile.child_name or storybook_data["child_name"]

    book = Storybook(
        **storybook_data,
        child_name=resolved_child_name,
        input_preferences=store.get_input_preferences(),
        personalization=saved_profile.model_copy(update={"child_name": resolved_child_name}),
        audio_settings=store.get_audio_settings(),
        experience_settings=store.get_experience_settings(),
        parent_controls=store.get_parent_controls(),
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
