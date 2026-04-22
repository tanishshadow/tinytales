"""
Storybook data model and persistence store.

The prototype now keeps lightweight persistent state on disk so the feature
pages can behave like a real product instead of disconnected demos.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class StoryPage(BaseModel):
    page_number: int
    text: str
    mood: str = "curious"


class InputPreferences(BaseModel):
    input_method: str = "text"
    language: str = "English"
    guided_prompt: str = ""
    voice_style: str = "calm"
    notes: str = ""


class PersonalizationProfile(BaseModel):
    child_name: str = ""
    pronouns: str = "they/them"
    age_range: str = "4-6"
    avatar: str = "star"
    favorite_color: str = "Golden Honey"
    favorite_animal: str = "fox"
    comfort_object: str = "blanket"
    interests: list[str] = Field(default_factory=list)


class AudioSettings(BaseModel):
    narration_enabled: bool = True
    narrator_voice: str = "gentle"
    playback_speed: float = 1.0
    background_music: str = "moonlight"
    sound_effects: bool = True
    parent_voice_enabled: bool = False
    parent_voice_note: str = ""


class ExperienceSettings(BaseModel):
    mode: str = "day"
    theme: str = "sunrise-paper"
    text_size: str = "standard"
    reading_pace: str = "balanced"
    auto_play_audio: bool = False
    reduced_motion: bool = False


class ParentControls(BaseModel):
    intensity: str = "gentle"
    language: str = "English"
    allow_sharing: bool = True
    allow_exports: bool = True
    review_before_reading: bool = True
    notes: str = ""


class Storybook(BaseModel):
    id: str
    title: str
    child_name: str
    original_prompt: str
    tone: str = "gentle"
    pages: list[StoryPage] = Field(default_factory=list)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)
    is_favorite: bool = False
    share_id: Optional[str] = None
    input_preferences: InputPreferences = Field(default_factory=InputPreferences)
    personalization: PersonalizationProfile = Field(default_factory=PersonalizationProfile)
    audio_settings: AudioSettings = Field(default_factory=AudioSettings)
    experience_settings: ExperienceSettings = Field(default_factory=ExperienceSettings)
    parent_controls: ParentControls = Field(default_factory=ParentControls)

    def to_dict(self) -> dict[str, Any]:
        return self.model_dump()

    def summary_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "child_name": self.child_name,
            "tone": self.tone,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "page_count": len(self.pages),
            "is_favorite": self.is_favorite,
            "share_id": self.share_id,
        }


class AppState(BaseModel):
    stories: list[Storybook] = Field(default_factory=list)
    input_preferences: InputPreferences = Field(default_factory=InputPreferences)
    personalization: PersonalizationProfile = Field(default_factory=PersonalizationProfile)
    audio_settings: AudioSettings = Field(default_factory=AudioSettings)
    experience_settings: ExperienceSettings = Field(default_factory=ExperienceSettings)
    parent_controls: ParentControls = Field(default_factory=ParentControls)


class StorybookStore:
    """
    Thread-safe JSON-backed store for stories and family preferences.
    """

    def __init__(self, data_path: Path) -> None:
        self._data_path = Path(data_path)
        self._data_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._state = self._load_state()
        self._books = {book.id: book for book in self._state.stories}

    def _load_state(self) -> AppState:
        if not self._data_path.exists():
            return AppState()
        try:
            raw = json.loads(self._data_path.read_text(encoding="utf-8"))
            return AppState.model_validate(raw)
        except (json.JSONDecodeError, OSError, ValueError):
            return AppState()

    def _persist_locked(self) -> None:
        state = self._state.model_copy(
            update={
                "stories": sorted(
                    self._books.values(),
                    key=lambda book: book.created_at,
                    reverse=True,
                )
            }
        )
        self._data_path.write_text(
            json.dumps(state.model_dump(), indent=2),
            encoding="utf-8",
        )
        self._state = state

    def save(self, book: Storybook) -> Storybook:
        with self._lock:
            book.updated_at = utc_now_iso()
            if not book.created_at:
                book.created_at = book.updated_at
            self._books[book.id] = book
            self._persist_locked()
            return book

    def get(self, book_id: str) -> Optional[Storybook]:
        with self._lock:
            return self._books.get(book_id)

    def get_by_share_id(self, share_id: str) -> Optional[Storybook]:
        with self._lock:
            for book in self._books.values():
                if book.share_id == share_id:
                    return book
            return None

    def list_all(self) -> list[Storybook]:
        with self._lock:
            return sorted(
                self._books.values(),
                key=lambda book: book.created_at,
                reverse=True,
            )

    def delete(self, book_id: str) -> bool:
        with self._lock:
            removed = self._books.pop(book_id, None) is not None
            if removed:
                self._persist_locked()
            return removed

    def update_story(self, book_id: str, **changes: Any) -> Optional[Storybook]:
        with self._lock:
            book = self._books.get(book_id)
            if book is None:
                return None
            updated = book.model_copy(update=changes)
            updated.updated_at = utc_now_iso()
            self._books[book_id] = updated
            self._persist_locked()
            return updated

    def set_favorite(self, book_id: str, is_favorite: bool) -> Optional[Storybook]:
        return self.update_story(book_id, is_favorite=is_favorite)

    def create_share_id(self, book_id: str) -> Optional[Storybook]:
        with self._lock:
            book = self._books.get(book_id)
            if book is None:
                return None
            if not book.share_id:
                book.share_id = uuid4().hex[:12]
            book.updated_at = utc_now_iso()
            self._books[book_id] = book
            self._persist_locked()
            return book

    def get_input_preferences(self) -> InputPreferences:
        return self._state.input_preferences

    def update_input_preferences(self, payload: InputPreferences) -> InputPreferences:
        with self._lock:
            self._state.input_preferences = payload
            self._persist_locked()
            return self._state.input_preferences

    def get_personalization(self) -> PersonalizationProfile:
        return self._state.personalization

    def update_personalization(self, payload: PersonalizationProfile) -> PersonalizationProfile:
        with self._lock:
            self._state.personalization = payload
            self._persist_locked()
            return self._state.personalization

    def get_audio_settings(self) -> AudioSettings:
        return self._state.audio_settings

    def update_audio_settings(self, payload: AudioSettings) -> AudioSettings:
        with self._lock:
            self._state.audio_settings = payload
            self._persist_locked()
            return self._state.audio_settings

    def get_experience_settings(self) -> ExperienceSettings:
        return self._state.experience_settings

    def update_experience_settings(self, payload: ExperienceSettings) -> ExperienceSettings:
        with self._lock:
            self._state.experience_settings = payload
            self._persist_locked()
            return self._state.experience_settings

    def get_parent_controls(self) -> ParentControls:
        return self._state.parent_controls

    def update_parent_controls(self, payload: ParentControls) -> ParentControls:
        with self._lock:
            self._state.parent_controls = payload
            self._persist_locked()
            return self._state.parent_controls

    def dashboard(self) -> dict[str, Any]:
        stories = self.list_all()
        latest = stories[0] if stories else None
        recurring_themes: dict[str, int] = {}
        for story in stories:
            theme = story.original_prompt.strip().split(".")[0][:48] or "General comfort"
            recurring_themes[theme] = recurring_themes.get(theme, 0) + 1

        top_themes = [
            {"label": label, "count": count}
            for label, count in sorted(
                recurring_themes.items(),
                key=lambda item: item[1],
                reverse=True,
            )[:3]
        ]

        profile_child_name = self._state.personalization.child_name
        if not profile_child_name and latest:
            profile_child_name = latest.child_name

        return {
            "story_count": len(stories),
            "favorite_count": sum(1 for story in stories if story.is_favorite),
            "latest_story_id": latest.id if latest else None,
            "latest_updated_at": latest.updated_at if latest else None,
            "current_child": latest.child_name if latest else "",
            "top_themes": top_themes,
            "profiles": [
                {
                    "child_name": profile_child_name,
                    "pronouns": self._state.personalization.pronouns,
                    "age_range": self._state.personalization.age_range,
                    "favorite_animal": self._state.personalization.favorite_animal,
                }
            ],
        }
