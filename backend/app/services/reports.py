from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Sequence

from sqlalchemy import select

from app.core.errors import ConflictError
from app.domain.catalog.resolve import CatalogIndex
from app.models.catalog import CatalogItem
from app.models.clan_settings import ClanSettings
from app.models.report import REPORT_TRANSITIONS, OrderReport, OrderReportLine, ReportStatus
from app.schemas.report import ReportCreate, ReportLineIn, ReportStatusUpdate, ReportUpdate
from app.services.base import ClanScopedService
from app.services.discord_webhook import post_webhook, truncate_lines

DOMAIN = "reports"
STATUS_COLORS = {
    ReportStatus.OPEN: 0xA3E635,
    ReportStatus.IN_PROGRESS: 0x60A5FA,
    ReportStatus.DONE: 0x4ADE80,
    ReportStatus.CANCELLED: 0xEF4444,
}


class ReportService(ClanScopedService):
    """Рапорты снабжения клана («Текущие заказы клана»): CRUD, статусы, отправка в Discord."""

    # ---------------- read ------------------------------------------------- #
    async def list_reports(
        self,
        *,
        statuses: Sequence[ReportStatus] | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[Sequence[OrderReport], int]:
        stmt = self._scoped(select(OrderReport), OrderReport)
        if statuses:
            stmt = stmt.where(OrderReport.status.in_([s.value for s in statuses]))
        total = await self._count(stmt)
        rows = (
            await self.session.execute(
                stmt.order_by(OrderReport.created_at.desc())
                .limit(min(limit, 200)).offset(offset)
            )
        ).scalars().all()
        return rows, total

    async def get_report(self, report_id: uuid.UUID, *, for_update: bool = False) -> OrderReport:
        return await self._get_scoped(
            OrderReport, report_id, not_found_key="report.not_found", domain=DOMAIN,
            for_update=for_update,
        )

    async def icons_for(self, reports: Sequence[OrderReport]) -> dict[str, str | None]:
        codes = {line.item_code for r in reports for line in r.lines if line.item_code}
        if not codes:
            return {}
        rows = await self.session.execute(
            select(CatalogItem.code, CatalogItem.icon_url).where(CatalogItem.code.in_(codes))
        )
        return dict(rows.all())

    # ---------------- write ------------------------------------------------ #
    async def _build_lines(self, lines: Sequence[ReportLineIn]) -> list[OrderReportLine]:
        """Строки без кода резолвятся по названию на сервере — веб и десктоп получают
        одинаковую привязку к каталогу (иконки, экспорт кодов)."""
        need_resolve = any(line.item_code is None for line in lines)
        index = None
        if need_resolve:
            items = (
                await self.session.execute(select(CatalogItem).where(CatalogItem.is_active.is_(True)))
            ).scalars().all()
            index = CatalogIndex.build(items)
        out: list[OrderReportLine] = []
        for position, line in enumerate(lines):
            code = line.item_code or (index.resolve(line.name) if index else None)
            out.append(OrderReportLine(
                position=position, name=line.name, item_code=code,
                quantity=line.quantity, unit=line.unit,
            ))
        return out

    async def create_report(self, payload: ReportCreate) -> tuple[OrderReport, str]:
        now = datetime.now(UTC)
        title = payload.title or self.t.t(
            "report.default_title", domain=DOMAIN, date=now.strftime("%d.%m %H:%M")
        )
        report = OrderReport(
            title=title,
            note=payload.note,
            meta=payload.meta.model_dump(exclude_none=True),
            created_by=self.principal.user_id,
            created_by_name=self.principal.display_name,
            lines=await self._build_lines(payload.lines),
        )
        self.session.add(report)
        await self.session.commit()
        report = await self.get_report(report.id)
        return report, self.t.t("report.created", domain=DOMAIN, count=len(report.lines))

    async def update_report(
        self, report_id: uuid.UUID, payload: ReportUpdate
    ) -> tuple[OrderReport, str]:
        report = await self.get_report(report_id, for_update=True)
        fields = payload.model_dump(exclude_unset=True)
        if "title" in fields and payload.title:
            report.title = payload.title
        if "note" in fields:
            report.note = payload.note
        if payload.meta is not None:
            report.meta = payload.meta.model_dump(exclude_none=True)
        if payload.lines is not None:
            report.lines = await self._build_lines(payload.lines)
        await self.session.commit()
        report = await self.get_report(report.id)
        return report, self.t.t("report.updated", domain=DOMAIN, title=report.title)

    async def change_status(
        self, report_id: uuid.UUID, payload: ReportStatusUpdate
    ) -> tuple[OrderReport, str]:
        report = await self.get_report(report_id, for_update=True)
        current = ReportStatus(report.status)
        if payload.status != current and payload.status not in REPORT_TRANSITIONS[current]:
            raise ConflictError(
                message_key="report.bad_transition", domain=DOMAIN,
                params={"from": current.value, "to": payload.status.value},
            )
        report.status = payload.status.value
        await self.session.commit()
        report = await self.get_report(report.id)
        status_label = self.t.t(f"report.status.{report.status}", domain=DOMAIN)
        return report, self.t.t("report.status_changed", domain=DOMAIN,
                                title=report.title, status=status_label)

    async def delete_report(self, report_id: uuid.UUID) -> None:
        report = await self.get_report(report_id)
        await self.session.delete(report)
        await self.session.commit()

    # ---------------- discord ---------------------------------------------- #
    async def send_to_discord(
        self, report_id: uuid.UUID, image: tuple[str, bytes] | None = None
    ) -> tuple[OrderReport, str]:
        report = await self.get_report(report_id)
        settings_row = (
            await self.session.execute(self._scoped(select(ClanSettings), ClanSettings))
        ).scalar_one_or_none()
        webhook = settings_row.discord_webhook_url if settings_row else None
        if not webhook:
            raise ConflictError(
                message_key="report.discord_not_configured", domain=DOMAIN,
                code="discord_not_configured",
            )

        units = {
            "crate": self.t.t("report.unit.crate", domain=DOMAIN),
            "unit": self.t.t("report.unit.unit", domain=DOMAIN),
        }
        status = ReportStatus(report.status)
        fields = [
            {"name": self.t.t("report.embed.status", domain=DOMAIN),
             "value": self.t.t(f"report.status.{status.value}", domain=DOMAIN), "inline": True},
            {"name": self.t.t("report.embed.lines", domain=DOMAIN),
             "value": str(len(report.lines)), "inline": True},
            {"name": self.t.t("report.embed.author", domain=DOMAIN),
             "value": report.created_by_name or report.created_by, "inline": True},
        ]
        meta_parts = [report.meta.get(k) for k in ("region", "type", "stockpile") if report.meta.get(k)]
        if meta_parts:
            fields.append({"name": self.t.t("report.embed.place", domain=DOMAIN),
                           "value": " • ".join(meta_parts), "inline": False})
        if report.note:
            fields.append({"name": self.t.t("report.embed.note", domain=DOMAIN),
                           "value": report.note[:1024], "inline": False})

        embed = {
            "title": f"📋 {report.title}"[:256],
            "description": truncate_lines(
                [f"• {line.name} — **{line.quantity}** {units[line.unit]}" for line in report.lines]
            ),
            "color": STATUS_COLORS[status],
            "fields": fields,
            "timestamp": report.created_at.isoformat(),
            "footer": {"text": "SINDARIS LOGISTICS OVERWATCH"},
        }
        await post_webhook(webhook, embed=embed, image=image)

        report.discord_sent_at = datetime.now(UTC)
        await self.session.commit()
        report = await self.get_report(report.id)
        return report, self.t.t("report.discord_sent", domain=DOMAIN, title=report.title)
