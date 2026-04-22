"""
Where Colors Dream — Backend API
=================================
FastAPI entry-point that wires together:
  • /api/generate       — text prompt → full storybook JSON  (Gemini)
  • /api/storybook/{id} — retrieve a previously generated storybook
  • /api/storybooks     — list all generated storybooks

No illustrations are generated — the frontend UI handles all visuals.

Run with:
    uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from story_generator import generate_story
from storybook import StorybookStore, Storybook

# ── env ──────────────────────────────────────────────────────────────
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

if not GEMINI_API_KEY:
    print("[WARNING] GEMINI_API_KEY not set -- story generation will fail")

# ── app ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Where Colors Dream API",
    description="Gemini-powered backend for the children's storybook generator",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store (swap for DB later)
store = StorybookStore()


# ─────────────────────────────────────────────────────────────────────
# 1. GENERATE — text / voice-transcribed prompt → storybook
# ─────────────────────────────────────────────────────────────────────
@app.post("/api/generate")
async def create_storybook(
    prompt: str = Form(..., description="The child's fear, worry, or story seed"),
    child_name: Optional[str] = Form("the little one", description="Child's name for personalization"),
    tone: Optional[str] = Form("gentle", description="Story tone: gentle | fun | adventurous"),
    num_pages: Optional[int] = Form(5, ge=3, le=10, description="Number of story pages"),
):
    """
    Full pipeline:
      1. Send the child's prompt to Gemini to generate a multi-page story
      2. Store the complete storybook and return it as JSON
    No illustrations — the frontend UI provides all visuals.
    """
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

    # Persist
    book = Storybook(**storybook_data)
    store.save(book)

    return JSONResponse(content=book.to_dict(), status_code=201)


# ─────────────────────────────────────────────────────────────────────
# 2. RETRIEVE — fetch a previously generated storybook
# ─────────────────────────────────────────────────────────────────────
@app.get("/api/storybook/{storybook_id}")
async def get_storybook(storybook_id: str):
    """Return the full storybook JSON by its ID."""
    book = store.get(storybook_id)
    if book is None:
        raise HTTPException(404, "Storybook not found")
    return book.to_dict()


@app.get("/api/storybooks")
async def list_storybooks():
    """Return a lightweight list of all saved storybooks."""
    return [
        {
            "id": b.id,
            "title": b.title,
            "child_name": b.child_name,
            "created_at": b.created_at,
            "page_count": len(b.pages),
        }
        for b in store.list_all()
    ]


# ── health ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "gemini_configured": bool(GEMINI_API_KEY),
    }
