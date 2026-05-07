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
import html
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
• Write the title and every page's story text in {language}. Keep the JSON keys
  exactly as shown in English.
• If the language is Bilingual, write each page with simple English followed by
  the same meaning in the family's selected non-English language when provided.

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


LULLABY_PROMPT = """\
You are a gentle children's lullaby writer. Turn a child's fear or feeling into
a short, calming rhyming lullaby.

RULES:
- Acknowledge the feeling honestly and softly.
- Use simple language for ages 3-8.
- Make the lines rhyme naturally.
- Keep it short enough for a 30-second bedtime moment.
- Write the title and lines in {language}. Keep JSON keys in English.

TONE: {tone}

Respond with only valid JSON:
{{
  "title": "Lullaby Title",
  "melody": "moonlight",
  "lines": ["Line one", "Line two"]
}}

Generate {line_count} lines.
"""


COLORING_SCENE_PROMPT = """\
You describe children's coloring book scenes. Convert each storybook page into
a simple line-art scene that can be represented with large fillable regions.

RULES:
- Keep each scene simple: 3-5 large objects.
- Mention the child hero when appropriate.
- Avoid tiny details and complicated backgrounds.
- Use calm, cozy, magical imagery.

Respond with only valid JSON:
{{
  "scenes": [
    {{
      "page_number": 1,
      "title": "Scene title",
      "description": "Simple line-art scene description"
    }}
  ]
}}
"""


async def _generate_story_text(
    prompt: str,
    child_name: str,
    tone: str,
    num_pages: int,
    language: str,
    gemini_api_key: str,
) -> dict[str, Any]:
    """Call Gemini to produce the structured story JSON."""

    client = genai.Client(api_key=gemini_api_key)

    system_instruction = SYSTEM_PROMPT.format(
        child_name=child_name,
        tone=tone,
        num_pages=num_pages,
        language=language,
    )

    user_message = (
        f"The child's name is {child_name}. "
        f"The reading language is {language}. "
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


async def _generate_lullaby_text(
    prompt: str,
    child_name: str,
    tone: str,
    line_count: int,
    language: str,
    gemini_api_key: str,
) -> dict[str, Any]:
    client = genai.Client(api_key=gemini_api_key)
    system_instruction = LULLABY_PROMPT.format(
        tone=tone,
        line_count=line_count,
        language=language,
    )
    user_message = (
        f"The child's name is {child_name}. "
        f"The reading language is {language}. "
        f"The feeling or fear is: \"{prompt}\""
    )
    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash-lite",
        contents=user_message,
        config=genai.types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.8,
            max_output_tokens=1200,
        ),
    )
    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned unparseable lullaby JSON: {exc}\n---\n{raw[:500]}")
    if not isinstance(data.get("lines"), list):
        raise ValueError("Gemini response missing lullaby 'lines'")
    return data


async def _describe_coloring_scenes(
    title: str,
    child_name: str,
    pages: list[Any],
    gemini_api_key: str,
) -> list[dict[str, Any]]:
    client = genai.Client(api_key=gemini_api_key)
    page_payload = []
    for page in pages:
        page_payload.append(
            {
                "page_number": getattr(page, "page_number", None) or page.get("page_number", 1),
                "text": getattr(page, "text", None) or page.get("text", ""),
                "mood": getattr(page, "mood", None) or page.get("mood", "cozy"),
            }
        )
    user_message = json.dumps(
        {
            "storybook_title": title,
            "child_name": child_name,
            "pages": page_payload,
        },
        ensure_ascii=True,
    )
    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.5-flash-lite",
        contents=user_message,
        config=genai.types.GenerateContentConfig(
            system_instruction=COLORING_SCENE_PROMPT,
            temperature=0.45,
            max_output_tokens=2200,
        ),
    )
    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Gemini returned unparseable coloring JSON: {exc}\n---\n{raw[:500]}")
    scenes = data.get("scenes")
    if not isinstance(scenes, list):
        raise ValueError("Gemini response missing coloring 'scenes'")
    return scenes


def _scene_to_svg(scene: dict[str, Any], page_index: int) -> str:
    title = html.escape(str(scene.get("title") or f"Page {page_index + 1}"))
    description = html.escape(str(scene.get("description") or "A gentle magical scene."))
    offset = (page_index % 4) * 8
    return f"""<svg class="coloring-svg" viewBox="0 0 360 260" role="img" aria-label="{title}">
  <title>{title}</title>
  <desc>{description}</desc>
  <rect class="color-region" data-fill="#F3EDE4" x="16" y="16" width="328" height="228" rx="18"></rect>
  <path class="color-region" data-fill="#B8E4DC" d="M28 214 C70 174, 103 188, 133 154 C166 116, 207 139, 229 101 C252 62, 310 91, 334 214 Z"></path>
  <circle class="color-region" data-fill="#F2C4CE" cx="{88 + offset}" cy="{75 + offset}" r="34"></circle>
  <path class="color-region" data-fill="#F5E6C0" d="M171 91 c0-27 18-45 45-45 25 0 43 18 43 43 0 31-21 54-48 54-24 0-40-19-40-52z"></path>
  <path class="color-region" data-fill="#A8D8D8" d="M146 221 c10-44 37-70 77-78 40 8 66 34 77 78z"></path>
  <path class="color-line" d="M28 214 C70 174, 103 188, 133 154 C166 116, 207 139, 229 101 C252 62, 310 91, 334 214"></path>
  <path class="color-line" d="M171 91 c0-27 18-45 45-45 25 0 43 18 43 43 0 31-21 54-48 54-24 0-40-19-40-52z"></path>
  <path class="color-line" d="M146 221 c10-44 37-70 77-78 40 8 66 34 77 78"></path>
  <path class="color-line" d="M199 96 c6-5 13-5 19 0 M229 96 c6-5 13-5 19 0 M209 120 c10 7 22 7 32 0"></path>
  <path class="color-line" d="M65 90 l12-12 12 12 16 4-9 13 4 16-15-7-15 7 4-16-9-13z"></path>
</svg>"""


# ── Orchestrator ─────────────────────────────────────────────────────

async def generate_story(
    prompt: str,
    child_name: str,
    tone: str,
    num_pages: int,
    language: str,
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
        language=language,
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


async def generate_lullaby(
    prompt: str,
    child_name: str,
    tone: str,
    line_count: int,
    language: str,
    gemini_api_key: str,
) -> dict[str, Any]:
    lullaby_id = uuid.uuid4().hex[:16]
    data = await _generate_lullaby_text(
        prompt=prompt,
        child_name=child_name,
        tone=tone,
        line_count=line_count,
        language=language,
        gemini_api_key=gemini_api_key,
    )
    lines = [str(line).strip() for line in data.get("lines", []) if str(line).strip()]
    return {
        "id": lullaby_id,
        "title": data.get("title", "A Little Brave Lullaby"),
        "child_name": child_name,
        "original_prompt": prompt,
        "tone": tone,
        "language": language,
        "lines": lines[:line_count],
        "melody": data.get("melody", "moonlight"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


async def generate_coloring_scenes(
    title: str,
    child_name: str,
    pages: list[Any],
    gemini_api_key: str,
) -> list[dict[str, Any]]:
    scene_descriptions = await _describe_coloring_scenes(
        title=title,
        child_name=child_name,
        pages=pages,
        gemini_api_key=gemini_api_key,
    )
    scenes = []
    for index, scene in enumerate(scene_descriptions):
        scenes.append(
            {
                "page_number": int(scene.get("page_number") or index + 1),
                "title": str(scene.get("title") or f"Coloring Page {index + 1}"),
                "description": str(scene.get("description") or "A gentle magical scene."),
                "svg": _scene_to_svg(scene, index),
            }
        )
    return scenes
