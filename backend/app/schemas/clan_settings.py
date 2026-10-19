from __future__ import annotations

from typing import Annotated

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


class ClanSettingsSaved(BaseModel):
    settings: ClanSettingsRead
    message: str
