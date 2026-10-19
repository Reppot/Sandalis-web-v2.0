from __future__ import annotations

from sqlalchemy import select

from app.models.clan_settings import ClanSettings
from app.schemas.clan_settings import ClanSettingsRead, ClanSettingsUpdate
from app.services.base import ClanScopedService

DOMAIN = "reports"


def to_read(row: ClanSettings | None) -> ClanSettingsRead:
    url = row.discord_webhook_url if row else None
    return ClanSettingsRead(
        discord_webhook_configured=bool(url),
        # узнаваемый хвост без секрета: «…/a1b2»
        discord_webhook_hint=f"…/{url.rstrip('/')[-4:]}" if url else None,
    )


class ClanSettingsService(ClanScopedService):
    async def get(self) -> ClanSettings | None:
        return (
            await self.session.execute(self._scoped(select(ClanSettings), ClanSettings))
        ).scalar_one_or_none()

    async def update(self, payload: ClanSettingsUpdate) -> tuple[ClanSettings, str]:
        row = await self.get()
        if row is None:
            row = ClanSettings()
            self.session.add(row)
        if "discord_webhook_url" in payload.model_fields_set:
            row.discord_webhook_url = payload.discord_webhook_url
        await self.session.commit()
        await self.session.refresh(row)
        return row, self.t.t("settings.saved", domain=DOMAIN)
