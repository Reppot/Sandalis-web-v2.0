"""Заказ как задача («штаб» заказов): исполнители, приоритет, срок, теги, привязка к операции,
прогресс по ящикам для списка и письма в почту при назначении."""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import TYPE_CHECKING, Any, Final

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mail import ClanMail
from app.models.operation import ClanOperation
from app.models.rbac import ClanMembership, User
from app.models.report import OrderReport, ReportContribution, ReportContributionLine

if TYPE_CHECKING:
    from app.schemas.report import ContributionCreate, ReportProgressRead

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


def take(session: AsyncSession, report: OrderReport, user_id: str, name: str, *, take: bool) -> bool:
    """«Взять себе» / отказаться (сайт и кнопка в Discord). True — что-то изменилось."""
    was = any(a.get("user_id") == user_id for a in report.assignees or [])
    people = [a for a in report.assignees or [] if a.get("user_id") != user_id]
    if take:
        people.append({"user_id": user_id, "name": (name or user_id)[:120]})
    report.assignees = people
    if was != take:
        log(session, report.id, "take" if take else "drop", user_id, name)
    return was != take


async def after_contribution(session: AsyncSession, report_id: uuid.UUID, payload: ContributionCreate,
                             result: ReportProgressRead, clan_id: str, actor: str, actor_name: str) -> None:
    """После вклада (сайт и «Привёз» в Discord): запись в ленту и «доставлен полностью»."""
    qty = sum(line.quantity for line in payload.lines)
    newest = max(result.contributions, key=lambda c: c.created_at, default=None)
    log(session, report_id, "contribution", actor, actor_name, qty=qty,
        place=payload.stockpile_label or (newest.stockpile_label if newest else None), note=payload.note or None)
    report = (await session.execute(select(OrderReport).where(OrderReport.id == report_id))).scalar_one()
    await check_delivered(session, report, clan_id=clan_id, actor_id=actor, actor_name=actor_name)
    await session.commit()


# ───────────────────────── лента событий ─────────────────────────

def log(session: AsyncSession, report_id: uuid.UUID, kind: str, actor_id: str, actor_name: str, **payload: Any) -> None:
    """Запись в ленту заказа (коммит — вместе с основным изменением)."""
    from app.models.report_event import ReportEvent

    session.add(ReportEvent(report_id=report_id, kind=kind, actor_id=actor_id, actor_name=(actor_name or actor_id)[:120],
                            payload={k: v for k, v in payload.items() if v is not None}))


async def events(session: AsyncSession, report_id: uuid.UUID, limit: int = 200) -> list[Any]:
    from app.models.report_event import ReportEvent

    return list((await session.execute(
        select(ReportEvent).where(ReportEvent.report_id == report_id).order_by(ReportEvent.created_at.desc()).limit(limit)
    )).scalars().all())


# ───────────────────────── комментарии и упоминания ─────────────────────────

async def comment_recipients(session: AsyncSession, text: str, author_id: str, *, everyone: bool = True) -> tuple[list[str], list[str]]:
    """Кому письмо по комментарию: носители упомянутых ролей (@роль, @everyone) и упомянутые
    участники (@Ник). Возвращает (user_id получателей, упомянутые названия)."""
    from app.services.mentions import clan_roles, mentioned

    low = (text or "").lower()
    roles = [r for r in mentioned(text, await clan_roles(session)) if everyone or r["id"] != "everyone"]
    role_ids = {r["id"] for r in roles}
    people = await members(session)
    named = sorted((m for m in people if f"@{m['name'].lower()}" in low), key=lambda m: -len(m["name"]))
    recipients: set[str] = {m["user_id"] for m in named}
    if role_ids:
        rows = (await session.execute(select(ClanMembership).where(ClanMembership.is_active.is_(True)))).scalars().all()
        recipients |= {m.user_id for m in rows if "everyone" in role_ids or role_ids & set(m.discord_role_ids or [])}
    recipients.discard(author_id)
    return sorted(recipients), [r["name"] for r in roles] + [m["name"] for m in named]


def mail(session: AsyncSession, *, clan_id: str, recipients: list[str], sender_id: str, sender_name: str, kind: str, payload: dict[str, Any]) -> None:
    for uid in recipients:
        session.add(ClanMail(clan_id=clan_id, recipient_id=uid, sender_id=sender_id, sender_name=(sender_name or sender_id)[:120],
                             kind=kind, payload=payload))


# ───────────────────────── напоминания и «доставлен полностью» ─────────────────────────

async def remind_due(session: AsyncSession, clan_id: str, today: Any) -> int:
    """Ленивое напоминание (при открытии списка заказов): исполнителям активных заказов со сроком
    сегодня или завтра — одно письмо на каждый срок (reminded_due запоминает, на какой срок уже писали)."""
    from datetime import timedelta

    rows = (await session.execute(
        select(OrderReport).where(
            OrderReport.status.in_(["open", "in_progress"]),
            OrderReport.due_date.is_not(None),
            OrderReport.due_date <= today + timedelta(days=1),
            OrderReport.due_date >= today,
        )
    )).scalars().all()
    sent = 0
    for r in rows:
        if r.reminded_due == r.due_date or not r.assignees:
            continue
        mail(session, clan_id=clan_id, recipients=[a["user_id"] for a in r.assignees], sender_id="system", sender_name="SINDARIS",
             kind="task_due", payload={"report_id": str(r.id), "title": r.title, "due_date": r.due_date.isoformat()})
        r.reminded_due = r.due_date
        sent += 1
    return sent


async def check_delivered(session: AsyncSession, report: OrderReport, *, clan_id: str, actor_id: str, actor_name: str) -> bool:
    """Заказ к операции доставлен полностью → письмо автору и запись в ленту (один раз)."""
    if report.delivered_notified:
        return False
    delivered, _ = await progress_for(session, [report])
    total = sum(line.quantity for line in report.lines)
    if not total or delivered.get(report.id, 0) < total:
        return False
    ops = (await session.execute(select(ClanOperation))).scalars().all()
    linked = [o for o in ops if o.id == report.operation_id or str(report.id) in (o.report_ids or [])]
    if not linked:
        return False
    report.delivered_notified = True
    op = min(linked, key=lambda o: o.date)
    log(session, report.id, "delivered", actor_id, actor_name, operation=op.title)
    if report.created_by != actor_id:
        mail(session, clan_id=clan_id, recipients=[report.created_by], sender_id=actor_id, sender_name=actor_name,
             kind="order_delivered", payload={"report_id": str(report.id), "title": report.title, "operation": op.title, "date": op.date.isoformat()})
    return True
