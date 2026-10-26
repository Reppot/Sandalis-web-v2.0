from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ClanCourseWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Annotated[str, Field(min_length=1, max_length=120)]
    summary: Annotated[str, Field(max_length=300)] = ""
    body: Annotated[str, Field(max_length=60_000)] = ""

    @field_validator("title")
    @classmethod
    def _title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("empty title")
        return value

    @field_validator("summary", "body")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class ClanCourseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    summary: str
    body: str
    sort: int
    author_name: str
    created_at: datetime
    updated_at: datetime


class ClanCourseList(BaseModel):
    can_edit: bool
    max_courses: int
    courses: list[ClanCourseRead]


class ClanCourseOrder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ids: Annotated[list[uuid.UUID], Field(max_length=200)]
