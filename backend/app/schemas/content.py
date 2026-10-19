from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

ContentKind = Annotated[str, Field(pattern=r"^[a-z_]{1,32}$")]


class ContentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    kind: str
    key: str
    sort: int
    is_active: bool
    payload: dict[str, Any]


class ContentUpsert(BaseModel):
    """Правка записи реестра контента (например, новый URL видео экрана входа)."""
    model_config = ConfigDict(extra="forbid")

    payload: dict[str, Any]
    sort: int | None = None
    is_active: bool | None = None
