from __future__ import annotations

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


class DiscordRoleRead(BaseModel):
    id: str
    name: str
    color: int
    position: int


class DiscordRolesRead(BaseModel):
    """Экран «Роли Discord»: роли сервера клана и их сопоставление."""
    guild_id: str | None            # null — клан не привязан к Discord-серверу
    bot_configured: bool            # задан DISCORD_BOT_TOKEN
    bot_in_guild: bool              # бот видит сервер (роли загружены)
    bot_invite_url: str | None
    enabled: bool
    roles: list[DiscordRoleRead]
    role_map: dict[str, str]


class DiscordRolesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool
    role_map: dict[Annotated[str, Field(pattern=r"^\d{5,25}$")], Literal["guest", "member", "officer", "admin"]]


class DiscordRolesSaved(BaseModel):
    roles: DiscordRolesRead
    message: str


class ClanSettingsSaved(BaseModel):
    settings: ClanSettingsRead
    message: str
