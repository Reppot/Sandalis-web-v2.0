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
    timer_ping_role_id: str | None = None
    timer_warn_minutes: int = 120


class ClanSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # "" или null — отключить отправку в Discord
    discord_webhook_url: Annotated[str | None, Field(default=None, max_length=512)]
    # напоминания о резервах: роль для пинга ("" / null — без пинга) и за сколько минут
    timer_ping_role_id: Annotated[str | None, Field(default=None, max_length=32, pattern=r"^\d*$")]
    timer_warn_minutes: Annotated[int | None, Field(default=None, ge=15, le=1440)]

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


class BlacklistUserIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    id: Annotated[str, Field(min_length=1, max_length=32, pattern=r"^\d+$")]   # Discord ID
    name: Annotated[str | None, Field(default=None, max_length=120)]
    reason: Annotated[str | None, Field(default=None, max_length=300)]


class BlacklistUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    users: Annotated[list[BlacklistUserIn], Field(max_length=500)]
    roles: Annotated[list[Annotated[str, Field(pattern=r"^\d+$", max_length=32)]], Field(max_length=200)]


class BlacklistUserRead(BaseModel):
    id: str
    name: str | None = None
    reason: str | None = None
    by: str | None = None
    at: str | None = None


class BlacklistRoleRead(BaseModel):
    id: str
    name: str
    color: int = 0


class BlacklistRead(BaseModel):
    users: list[BlacklistUserRead]
    roles: list[BlacklistRoleRead]


class BlacklistSaved(BaseModel):
    blacklist: BlacklistRead
    removed: int
    message: str


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


# --------------------------------------------------------------------------- #
# Пирамида снабжения
# --------------------------------------------------------------------------- #
class PyramidItem(BaseModel):
    code: Annotated[str, Field(min_length=1, max_length=64)]
    crates: Annotated[int, Field(ge=1, le=999)]


class PyramidTier(BaseModel):
    title: Annotated[str, Field(max_length=60)] = ""
    items: Annotated[list[PyramidItem], Field(max_length=40)]


class PyramidUpdate(BaseModel):
    """Уровни снизу вверх: tiers[0] — основа (привозить первым)."""
    faction: Literal["warden", "colonial"]
    tiers: Annotated[list[PyramidTier], Field(min_length=1, max_length=12)]


class PyramidPresetRead(BaseModel):
    key: str                        # normal | basic | tank | artillery | builder | frontline
    tiers: list[PyramidTier]


class PyramidConfigWrite(PyramidUpdate):
    """Кастомная конфигурация клана: название видят все участники в списке конфигураций."""
    name: Annotated[str, Field(min_length=1, max_length=40)]

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("empty name")
        return value


class PyramidConfigRead(PyramidConfigWrite):
    id: str
    updated_at: datetime | None = None
    updated_by: str | None = None


class PyramidRead(PyramidUpdate):
    """faction/tiers — шаблон («Обычная пирамида»); свои пирамиды клана — в configs."""
    is_default: bool
    updated_at: datetime | None
    presets: list[PyramidPresetRead] = []
    configs: list[PyramidConfigRead] = []
    max_configs: int = 10
