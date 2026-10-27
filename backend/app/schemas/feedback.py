from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Category = Literal["idea", "bug", "other"]
Status = Literal["new", "read", "done"]


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Category = "idea"
    message: Annotated[str, Field(min_length=3, max_length=4000)]
    page: Annotated[str | None, Field(max_length=120)] = None

    @field_validator("message")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("too short")
        return value


class FeedbackReply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1, max_length=4000)]

    @field_validator("text")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("empty reply")
        return value


class FeedbackStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Status


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: str
    user_name: str
    clan_id: str | None
    clan_name: str | None
    category: Category
    message: str
    page: str | None
    status: Status
    reply: str | None = None
    replied_at: datetime | None = None
    created_at: datetime


class FeedbackOverview(BaseModel):
    """Страница «Обратная связь»: свои сообщения; владельцу сайта — все."""
    is_admin: bool
    can_write: bool
    mine: list[FeedbackRead]
    inbox: list[FeedbackRead] = []
    unread: int = 0
