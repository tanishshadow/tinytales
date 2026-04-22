"""
Story Generator — Gemini 2.5 Flash Lite powered story text generation
=======================================================
This module handles the core creative pipeline:

  1. Build a detailed system prompt that instructs Gemini to transform a
     child's fear / worry into a multi-page calming storybook.
  2. Parse the structured JSON response into pages (title + text per page).
  3. Return the complete storybook data ready for persistence.

No illustrations are generated — the frontend UI handles all visuals.
"""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from google import genai


# ── Gemini story generation ──────────────────────────────────────────

SYSTEM_PROMPT = """\
You are a world-class children's story writer. Your specialty is turning a
child's real fear or worry into a gentle, magical storybook adventure.

RULES:
• The story must ACKNOWLEDGE the fear honestly — never dismiss it.
• Transform the fear into a symbolic challenge inside a magical world.
• Give the child character (named {child_name}) agency to solve the challenge.
• End with comfort, safety, and positive reinforcement.
• Use simple, vivid language suitable for ages 3-8.
• Each page should be 2-4 short sentences.
• Each page needs a "mood" field — a single word describing the emotional
  tone of that page (e.g. "curious", "brave", "cozy", "wondering", "safe").
  The frontend uses this to set background colors and ambient effects.

TONE: {tone}

Respond with **only** valid JSON in this exact structure (no markdown fences):
{{
  "title": "Story Title",
  "pages": [
    {{
      "page_number": 1,
      "text": "Story text for this page.",
      "mood": "curious"
    }}
  ]
}}

Generate exactly {num_pages} pages.
"""


async def _generate_story_text(
    prompt: str,
    child_name: str,
    tone: str,
    num_pages: int,
    gemini_api_key: str,
) -> dict[str, Any]:
    """Call Gemini to produce the structured story JSON."""

    client = genai.Client(api_key=gemini_api_key)

    system_instruction = SYSTEM_PROMPT.format(
        child_name=child_name,
        tone=tone,
        num_pages=num_pages,
    )

    user_message = (
        f"The child's name is {child_name}. "
        f"Here is what they shared: \"{prompt}\"\n\n"
        f"Please create a {num_pages}-page storybook."
    )

    # Run the blocking SDK call in a thread so we don't block the event loop
    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash-lite",
        contents=user_message,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.85,
            max_output_tokens=4096,
        ),
    )

    raw = response.text.strip()

    # Strip markdown fences if Gemini wraps them anyway
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned unparseable JSON: {exc}\n---\n{raw[:500]}")

    if "pages" not in data:
        raise ValueError("Gemini response missing 'pages' key")

    return data


# ── Orchestrator ─────────────────────────────────────────────────────

async def generate_story(
    prompt: str,
    child_name: str,
    tone: str,
    num_pages: int,
    gemini_api_key: str,
) -> dict[str, Any]:
    """
    Generate a complete storybook (text only, no illustrations).
    The frontend UI provides all visual design and ambient effects.
    """
    book_id = uuid.uuid4().hex[:16]

    # Generate story text via Gemini
    story_data = await _generate_story_text(
        prompt=prompt,
        child_name=child_name,
        tone=tone,
        num_pages=num_pages,
        gemini_api_key=gemini_api_key,
    )

    title = story_data.get("title", "A Brave Little Story")
    pages = story_data.get("pages", [])

    return {
        "id": book_id,
        "title": title,
        "child_name": child_name,
        "original_prompt": prompt,
        "tone": tone,
        "pages": pages,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
