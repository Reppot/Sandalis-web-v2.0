"""Заказ как задача («штаб» заказов): исполнители, приоритет, срок, теги, привязка к операции,
прогресс по ящикам для списка и письма в почту при назначении."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any, Final

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mail import ClanMail
from app.models.operation import ClanOperation
from app.models.rbac import ClanMembership, User
from app.models.report import OrderReport, ReportContribution, ReportContributionLine

PRIORITIES: Final[tuple[str, ...]] = ("high", "normal", "low")
MAX_ASSIGNEES: Final[int] = 10
MAX_TAGS: Final[int] = 8


async def members(session: AsyncSession) -> list[dict[str, str]]:
    """Активные участники клана — кого можно назначить исполнителем."""
    rows = (await session.execute(
        select(ClanMembership.user_id, User.display_name)
        .join(User, User.id == ClanMembership.user_id)
        .where(ClanMembership.is_active.is_(True))
        .order_by(User.display_name)
    )).all()
    return [{"user_id": uid, "name": name} for uid, name in rows]


async def progress_for(session: AsyncSession, reports: Sequence[OrderReport]) -> tuple[dict[uuid.UUID, int], dict[uuid.UUID, list[str]]]:
    """Сколько ящиков доставлено по каждому заказу (не больше заказанного по строке) и кто вносил вклад."""
    line_qty = {line.id: (r.id, line.quantity) for r in reports for line in r.lines}
    delivered: dict[uuid.UUID, int] = {r.id: 0 for r in reports}
    contributors: dict[uuid.UUID, list[str]] = {r.id: [] for r in reports}
    if not line_qty:
        return delivered, contributors
    sums = (await session.execute(
        select(ReportContributionLine.line_id, func.sum(ReportContributionLine.quantity))
        .where(ReportContributionLine.line_id.in_(list(line_qty)))
        .group_by(ReportContributionLine.line_id)
    )).all()
    for line_id, total in sums:
        rid, qty = line_qty[line_id]
        delivered[rid] += min(int(total or 0), qty)
    who = (await session.execute(
        select(ReportContribution.report_id, ReportContribution.user_id)
        .where(ReportContribution.report_id.in_([r.id for r in reports]))
        .distinct()
    )).all()
    for rid, uid in who:
        contributors[rid].append(uid)
    return delivered, contributors


async def operation_exists(session: AsyncSession, operation_id: uuid.UUID) -> bool:
    return (await session.execute(select(ClanOperation.id).where(ClanOperation.id == operation_id))).scalar_one_or_none() is not None


def notify_assigned(session: AsyncSession, *, clan_id: str, report: OrderReport, new_ids: list[str],
                    sender_id: str, sender_name: str) -> None:
    """Письмо в почту сайта каждому новому исполнителю (кроме того, кто назначил)."""
    payload: dict[str, Any] = {"report_id": str(report.id), "title": report.title,
                               "due_date": report.due_date.isoformat() if report.due_date else None,
                               "priority": report.priority}
    for uid in new_ids:
        if uid != sender_id:
            session.add(ClanMail(clan_id=clan_id, recipient_id=uid, sender_id=sender_id,
                                 sender_name=sender_name[:120], kind="task_assigned", payload=payload))
