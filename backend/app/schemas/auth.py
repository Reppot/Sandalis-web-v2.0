from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.permissions import ClanRole


class MeRead(BaseModel):
    """Кто я и что мне можно — зеркало Principal для фронта."""
    model_config = ConfigDict(frozen=True)

    subject_type: Literal["user", "clan_token"]
    user_id: str
    clan_id: str
    role: ClanRole
    scopes: list[str]
    display_name: str | None


class DevTokenRequest(BaseModel):
    """Выдача токена для разработки/администрирования (ENV!=prod либо DEV_AUTH_SECRET)."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    user_id: Annotated[str, Field(min_length=1, max_length=64)]
    clan_id: Annotated[str, Field(min_length=1, max_length=64)]
    role: ClanRole = ClanRole.MEMBER
    display_name: Annotated[str | None, Field(default=None, max_length=120)]
    # удобство для dev-flow: создать клан/юзера/membership, если их ещё нет
    upsert: bool = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int          # секунды
    me: MeRead
    message: str             # локализованное уведомление


class RedeemCodeRequest(BaseModel):
    """Вступление в клан по пригласительному коду (стендин Discord OAuth: пока
    личность передаёт клиент, в проде её даст OAuth-профиль Discord)."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: Annotated[str, Field(min_length=4, max_length=24)]
    user_id: Annotated[str, Field(min_length=1, max_length=64)]
    display_name: Annotated[str, Field(min_length=1, max_length=120)]


class DiscordUserProfile(BaseModel):
    """Нормализованный профиль Discord (GET /users/@me, scope=identify)."""
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)

    id: Annotated[str, Field(min_length=1, max_length=64)]
    username: Annotated[str, Field(default="", max_length=120)]
    global_name: Annotated[str | None, Field(default=None, max_length=120)]
    avatar: Annotated[str | None, Field(default=None, max_length=128)]
    locale: Annotated[str | None, Field(default=None, max_length=8)]

    @field_validator("id", "username", "global_name", "avatar", "locale", mode="before")
    @classmethod
    def _coerce_str(cls, value: object) -> object:
        # Discord присылает строки, но number-safe парсинг дешевле 500-ки.
        if value is None or isinstance(value, str):
            return value
        return str(value)

    @property
    def display_name(self) -> str:
        return self.global_name or self.username or self.id


class DiscordTokenResponse(BaseModel):
    """Ответ POST {DISCORD_API_BASE_URL}/oauth2/token."""
    model_config = ConfigDict(extra="ignore")

    access_token: str
    token_type: str = "Bearer"
    expires_in: int = 604800
    refresh_token: str | None = None
    scope: str | None = None


class ClanApiTokenCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: Annotated[str, Field(min_length=1, max_length=64)]
    role: ClanRole = ClanRole.GUEST
    expires_in_hours: Annotated[int | None, Field(default=None, gt=0, le=24 * 365)]


class ClanApiTokenCreated(BaseModel):
    id: str
    label: str
    role: ClanRole
    expires_at: datetime | None
    raw_token: str           # показывается ОДИН раз, хранится только sha256
    message: str
