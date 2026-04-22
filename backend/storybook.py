"""
Storybook data model and persistence store
===========================================
Defines the Storybook Pydantic model and an in-memory store.
Swap `StorybookStore` for a database-backed implementation later.
"""

from __future__ import annotations

import threading
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Models ───────────────────────────────────────────────────────────

class StoryPage(BaseModel):
    """A single page in a storybook."""
    page_number: int
    text: str
    mood: str = "curious"         # emotional tone — drives frontend ambient effects


class Storybook(BaseModel):
    """Complete storybook generated for a child."""
    id: str
    title: str
    child_name: str
    original_prompt: str
    tone: str = "gentle"
    pages: list[StoryPage] = Field(default_factory=list)
    created_at: str = ""          # ISO-8601

    def to_dict(self) -> dict[str, Any]:
        """Serialise for JSON responses."""
        return {
            "id": self.id,
            "title": self.title,
            "child_name": self.child_name,
            "original_prompt": self.original_prompt,
            "tone": self.tone,
            "created_at": self.created_at,
            "pages": [
                {
                    "page_number": p.page_number,
                    "text": p.text,
                    "mood": p.mood,
                }
                for p in self.pages
            ],
        }


# ── In-memory store (thread-safe) ───────────────────────────────────

class StorybookStore:
    """
    Simple in-memory store for storybooks.
    Replace with SQLite / Postgres / Firebase in production.
    """

    def __init__(self) -> None:
        self._books: dict[str, Storybook] = {}
        self._lock = threading.Lock()

    def save(self, book: Storybook) -> None:
        with self._lock:
            self._books[book.id] = book

    def get(self, book_id: str) -> Optional[Storybook]:
        with self._lock:
            return self._books.get(book_id)

    def list_all(self) -> list[Storybook]:
        with self._lock:
            return sorted(
                self._books.values(),
                key=lambda b: b.created_at,
                reverse=True,
            )

    def delete(self, book_id: str) -> bool:
        with self._lock:
            return self._books.pop(book_id, None) is not None
