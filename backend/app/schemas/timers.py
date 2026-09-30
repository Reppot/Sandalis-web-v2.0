from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.auth import APIModel


TimerType = Literal[
    "stockpile_decay",
    "facility_craft",
    "operation",
]


class CreateTimerRequest(APIModel):
    name: str = Field(min_length=1, max_length=255)
    type: TimerType
    duration_seconds: int = Field(ge=1, le=2_592_000)


class TimerResponse(APIModel):
    id: str
    name: str
    type: TimerType
    target_timestamp: int
    duration_seconds: int
    created_at: datetime
    updated_at: datetime