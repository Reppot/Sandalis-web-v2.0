from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

DISCORD_WEBHOOK_PREFIXES = (
    "https://discord.com/api/webhooks/",
    "https://discordapp.com/api/webhooks/",
    "https://canary.discord.com/api/webhooks/",
    "https://ptb.discord.com/api/webhooks/",
)


class ClanSettingsRead(BaseModel):
    """Секрет вебхука наружу не уходит: только признак и последние символы."""
    discord_webhook_configured: bool
    discord_webhook_hint: str | None


class ClanSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # "" или null — отключить отправку в Discord
    discord_webhook_url: Annotated[str | None, Field(default=None, max_length=512)]

    @field_validator("discord_webhook_url")
    @classmethod
    def _webhook(cls, value: str | None) -> str | None:
        if not value:
            return None
        if not value.startswith(DISCORD_WEBHOOK_PREFIXES):
            raise ValueError("expected a Discord webhook URL (https://discord.com/api/webhooks/...)")
        return value


Level = Literal["basic", "medium", "high"]


class DiscordRoleRead(BaseModel):
    id: str
    name: str
    color: int
    position: int
    level: Level


class DiscordRolesRead(BaseModel):
    """«Роли Discord»: роли сервера клана, подтянутые командиром, и их уровни."""
    guild_id: str | None            # null — клан не привязан к Discord-серверу
    bot_configured: bool            # задан DISCORD_BOT_TOKEN
    bot_in_guild: bool              # бот видит сервер
    bot_invite_url: str | None
    synced_at: datetime | None      # когда роли подтянуты (null — ещё нет: вступление закрыто)
    roles: list[DiscordRoleRead]


class DiscordRolesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    levels: dict[Annotated[str, Field(pattern=r"^\d{5,25}$")], Level]


class DiscordRolesSaved(BaseModel):
    roles: DiscordRolesRead
    message: str


class DiscordMemberRead(BaseModel):
    id: str
    name: str
    roles: list[str]
    level: Level
    joined: bool                    # уже вступил в терминал
    role: str | None                # роль в терминале, если вступил


class DiscordMembersRead(BaseModel):
    status: Literal["ok", "no_bot", "intent_required", "no_guild"]
    members: list[DiscordMemberRead]


class ClanSettingsSaved(BaseModel):
    settings: ClanSettingsRead
    message: str
