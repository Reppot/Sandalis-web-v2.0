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


Level = Literal["basic", "medium", "high", "custom"]


class DiscordRoleRead(BaseModel):
    id: str
    name: str
    color: int
    position: int
    level: Level
    permissions: list[str]          # для custom — выбранные права, иначе права пресета


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
    # права для ролей с уровнем custom
    permissions: dict[Annotated[str, Field(pattern=r"^\d{5,25}$")], list[Annotated[str, Field(max_length=40)]]] = {}


class DiscordRolesSaved(BaseModel):
    roles: DiscordRolesRead
    message: str


class MemberRoleRead(BaseModel):
    name: str
    color: int


class DiscordMemberRead(BaseModel):
    id: str
    name: str
    roles: list[MemberRoleRead]     # роли Discord-сервера (из снимка)
    level: str                      # owner | high | medium | custom | basic | guest
    in_discord: bool                # виден ботом на сервере
    joined: bool                    # вступил в терминал
    role: str | None                # роль в терминале, если вступил
    permissions: list[str]          # итоговые права (owner — ["*"])


class DiscordMembersRead(BaseModel):
    """Страница участников. next_after — курсор «Загрузить ещё» (None — конец списка)."""
    status: Literal["ok", "no_bot", "intent_required", "no_guild"]
    members: list[DiscordMemberRead]
    next_after: str | None = None
    total: int | None = None        # участников на сервере (только первая страница)
    joined_total: int = 0           # вступили в терминал


class PermissionGroupRead(BaseModel):
    key: str
    permissions: list[str]


class PermissionCatalogRead(BaseModel):
    """Все действия сайта по группам и состав пресетов уровней."""
    groups: list[PermissionGroupRead]
    presets: dict[str, list[str]]


class ClanSettingsSaved(BaseModel):
    settings: ClanSettingsRead
    message: str
