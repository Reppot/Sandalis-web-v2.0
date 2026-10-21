"""Журнал выполнения заказа: вклады участников (что, сколько, на какой склад)."""
from __future__ import annotations

import uuid

from sqlalchemy import select

from app.core.errors import ConflictError, PermissionDeniedError
from app.core.permissions import Scopes, has_scope
from app.models.report import OrderReport, ReportContribution, ReportContributionLine, ReportStatus
from app.models.stockpile import Stockpile
from app.schemas.report import (
    ContributionCreate,
    ContributionLineRead,
    ContributionRead,
    ProgressLineRead,
    ReportProgressRead,
)
from app.services.reports import DOMAIN, ReportService


class ReportProgressService(ReportService):
    async def _contributions(self, report_id: uuid.UUID) -> list[ReportContribution]:
        rows = await self.session.execute(
            select(ReportContribution)
            .where(ReportContribution.report_id == report_id, ReportContribution.clan_id == self.clan_id)
            .order_by(ReportContribution.created_at.desc())
        )
        return list(rows.scalars().all())

    async def progress(self, report_id: uuid.UUID, message: str | None = None) -> ReportProgressRead:
        report = await self.get_report(report_id)
        icons = await self.icons_for([report])
        contributions = await self._contributions(report.id)
        by_line = {line.id: line for line in report.lines}
        delivered: dict[uuid.UUID, int] = {}
        for c in contributions:
            for cl in c.lines:
                delivered[cl.line_id] = delivered.get(cl.line_id, 0) + cl.quantity
        lines = [
            ProgressLineRead(
                line_id=line.id, name=line.name, item_code=line.item_code, icon_url=icons.get(line.item_code or ""),
                unit=line.unit, ordered=line.quantity, delivered=delivered.get(line.id, 0),
            )
            for line in report.lines
        ]
        return ReportProgressRead(
            report_id=report.id,
            lines=lines,
            contributions=[
                ContributionRead(
                    id=c.id, user_id=c.user_id, user_name=c.user_name, stockpile_id=c.stockpile_id,
                    stockpile_label=c.stockpile_label, note=c.note, created_at=c.created_at,
                    lines=[
                        ContributionLineRead(
                            line_id=cl.line_id, name=by_line[cl.line_id].name,
                            icon_url=icons.get(by_line[cl.line_id].item_code or ""),
                            unit=by_line[cl.line_id].unit, quantity=cl.quantity,
                        )
                        for cl in c.lines if cl.line_id in by_line
                    ],
                )
                for c in contributions
            ],
            ordered_total=sum(line.ordered for line in lines),
            delivered_total=sum(min(line.delivered, line.ordered) for line in lines),
            message=message,
        )

    async def contribute(self, report_id: uuid.UUID, payload: ContributionCreate) -> ReportProgressRead:
        report: OrderReport = await self.get_report(report_id, for_update=True)
        if report.status == ReportStatus.CANCELLED.value:
            raise ConflictError(message_key="report.progress_cancelled", domain=DOMAIN, params={})
        line_ids = {line.id for line in report.lines}
        if any(l.line_id not in line_ids for l in payload.lines):
            raise ConflictError(message_key="report.progress_bad_line", domain=DOMAIN, params={})
        label = payload.stockpile_label
        if payload.stockpile_id:
            stockpile = await self._get_scoped(
                Stockpile, payload.stockpile_id, not_found_key="report.progress_no_stockpile", domain=DOMAIN,
            )
            label = f"{stockpile.region} ▶ {stockpile.name}"
        merged: dict[uuid.UUID, int] = {}
        for l in payload.lines:
            merged[l.line_id] = merged.get(l.line_id, 0) + l.quantity
        self.session.add(ReportContribution(
            report_id=report.id,
            user_id=self.principal.user_id,
            user_name=self.principal.display_name,
            stockpile_id=payload.stockpile_id,
            stockpile_label=label,
            note=payload.note or None,
            lines=[ReportContributionLine(line_id=lid, quantity=q) for lid, q in merged.items()],
        ))
        # первый вклад берёт открытый заказ в работу
        if report.status == ReportStatus.OPEN.value:
            report.status = ReportStatus.IN_PROGRESS.value
        await self.session.commit()
        total = sum(merged.values())
        return await self.progress(report.id, self.t.t("report.progress_saved", domain=DOMAIN, n=total))

    async def remove_contribution(self, report_id: uuid.UUID, contribution_id: uuid.UUID) -> ReportProgressRead:
        await self.get_report(report_id)
        contribution = await self._get_scoped(
            ReportContribution, contribution_id, not_found_key="report.progress_not_found", domain=DOMAIN,
        )
        if contribution.report_id != report_id:
            raise ConflictError(message_key="report.progress_not_found", domain=DOMAIN, params={})
        own = contribution.user_id == self.principal.user_id
        if not own and not has_scope(self.principal.scopes, Scopes.REPORTS_DELETE):
            raise PermissionDeniedError(message_key="report.progress_not_yours", domain=DOMAIN, params={})
        await self.session.delete(contribution)
        await self.session.commit()
        return await self.progress(report_id)
