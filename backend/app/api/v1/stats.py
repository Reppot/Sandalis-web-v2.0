"""Статистика клана (/clan/stats): кто сколько заказал, привёз и обслужил складов.

Считается на лету по таблицам заказов, вкладов и таймеров клана за период
(7 / 30 / 90 дней или всё время). Видят все, у кого есть доступ к заказам клана.
"""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from app.api.deps import CurrentPrincipal, DbDep, PermissionChecker
from app.core.permissions import Scopes
from app.core.tenancy import bypass_clan_filter
from app.models.rbac import ClanMembership, User
from app.models.report import OrderReport, OrderReportLine, ReportContribution, ReportContributionLine
from app.models.stockpile import Stockpile
from app.models.timer import Timer, TimerEvent

router = APIRouter(prefix="/clan", tags=["clan"])

PERIODS = {7, 30, 90, 0}   # 0 — за всё время
ACTIVITY_DAYS = 30         # график активности — последние 30 дней
TOP_ITEMS = 10


class MemberStats(BaseModel):
    user_id: str
    name: str
    role: str
    orders_created: int = 0
    deliveries: int = 0
    delivered_qty: int = 0
    timers_started: int = 0
    timer_notes: int = 0
    last_active: datetime | None = None


class DayActivity(BaseModel):
    date: date
    orders: int = 0
    deliveries: int = 0


class TopItem(BaseModel):
    name: str
    item_code: str | None
    quantity: int


class ClanStats(BaseModel):
    period_days: int
    members_total: int
    active_members: int
    orders_total: int
    orders_by_status: dict[str, int]
    deliveries: int
    delivered_qty: int
    timers_active: int
    stockpiles: int
    members: list[MemberStats]
    activity: list[DayActivity]
    top_items: list[TopItem]


def _later(a: datetime | None, b: datetime | None) -> datetime | None:
    return max(x for x in (a, b) if x) if (a or b) else None


@router.get(
    "/stats",
    response_model=ClanStats,
    summary="Статистика участников клана за период",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_STATS]))],
)
async def clan_stats(
    principal: CurrentPrincipal,
    session: DbDep,
    days: Annotated[int, Query(description="7, 30, 90 или 0 — всё время")] = 30,
) -> ClanStats:
    days = days if days in PERIODS else 30
    clan = principal.clan_id
    now = datetime.now(UTC)
    since = now - timedelta(days=days) if days else None

    def period(column):  # noqa: ANN001, ANN202
        return [column >= since] if since else []

    with bypass_clan_filter():
        rows = (await session.execute(
            select(ClanMembership.user_id, ClanMembership.role, User.display_name)
            .join(User, User.id == ClanMembership.user_id)
            .where(ClanMembership.clan_id == clan, ClanMembership.is_active.is_(True))
        )).all()
        members: dict[str, MemberStats] = {
            uid: MemberStats(user_id=uid, name=name or uid, role=str(getattr(role, "value", role))) for uid, role, name in rows
        }
        by_name = {m.name: m for m in members.values()}

        def member(uid: str, name: str | None = None) -> MemberStats:
            if uid not in members:
                members[uid] = MemberStats(user_id=uid, name=name or uid, role="former")
            return members[uid]

        # заказы: автор, статусы
        for uid, name, n, last in (await session.execute(
            select(OrderReport.created_by, func.max(OrderReport.created_by_name), func.count(), func.max(OrderReport.created_at))
            .where(OrderReport.clan_id == clan, *period(OrderReport.created_at))
            .group_by(OrderReport.created_by)
        )).all():
            m = member(uid, name)
            m.orders_created = n
            m.last_active = _later(m.last_active, last)
        by_status = dict((await session.execute(
            select(OrderReport.status, func.count()).where(OrderReport.clan_id == clan, *period(OrderReport.created_at)).group_by(OrderReport.status)
        )).all())

        # вклады: кто сколько привёз
        delivered = (
            select(ReportContribution.user_id, func.max(ReportContribution.user_name), func.count(func.distinct(ReportContribution.id)),
                   func.coalesce(func.sum(ReportContributionLine.quantity), 0), func.max(ReportContribution.created_at))
            .join(ReportContributionLine, ReportContributionLine.contribution_id == ReportContribution.id)
            .where(ReportContribution.clan_id == clan, *period(ReportContribution.created_at))
            .group_by(ReportContribution.user_id)
        )
        for uid, name, n, qty, last in (await session.execute(delivered)).all():
            m = member(uid, name)
            m.deliveries, m.delivered_qty = n, int(qty)
            m.last_active = _later(m.last_active, last)

        # таймеры: кто ставил склады на мониторинг (id) и вёл журнал (ник автора)
        for uid, n, last in (await session.execute(
            select(Timer.created_by, func.count(), func.max(Timer.created_at))
            .where(Timer.clan_id == clan, *period(Timer.created_at)).group_by(Timer.created_by)
        )).all():
            m = member(uid)
            m.timers_started = n
            m.last_active = _later(m.last_active, last)
        for author, n, last in (await session.execute(
            select(TimerEvent.created_by, func.count(), func.max(TimerEvent.created_at))
            .where(TimerEvent.clan_id == clan, *period(TimerEvent.created_at)).group_by(TimerEvent.created_by)
        )).all():
            m = members.get(author) or by_name.get(author)
            if m is None:
                continue
            m.timer_notes += n
            m.last_active = _later(m.last_active, last)

        # активность по дням (последние 30 дней)
        start = (now - timedelta(days=ACTIVITY_DAYS - 1)).date()
        activity = {start + timedelta(days=i): DayActivity(date=start + timedelta(days=i)) for i in range(ACTIVITY_DAYS)}
        day = func.date(OrderReport.created_at)
        for d, n in (await session.execute(
            select(day, func.count()).where(OrderReport.clan_id == clan, OrderReport.created_at >= datetime.combine(start, datetime.min.time(), UTC)).group_by(day)
        )).all():
            if d in activity:
                activity[d].orders = n
        cday = func.date(ReportContribution.created_at)
        for d, n in (await session.execute(
            select(cday, func.count()).where(ReportContribution.clan_id == clan, ReportContribution.created_at >= datetime.combine(start, datetime.min.time(), UTC)).group_by(cday)
        )).all():
            if d in activity:
                activity[d].deliveries = n

        # чаще всего привозят
        top = (await session.execute(
            select(OrderReportLine.name, OrderReportLine.item_code, func.sum(ReportContributionLine.quantity).label("q"))
            .join(ReportContributionLine, ReportContributionLine.line_id == OrderReportLine.id)
            .join(ReportContribution, ReportContribution.id == ReportContributionLine.contribution_id)
            .where(ReportContribution.clan_id == clan, *period(ReportContribution.created_at))
            .group_by(OrderReportLine.name, OrderReportLine.item_code)
            .order_by(func.sum(ReportContributionLine.quantity).desc())
            .limit(TOP_ITEMS)
        )).all()

        timers_active = (await session.execute(
            select(func.count()).select_from(Timer).where(Timer.clan_id == clan, Timer.completed_at.is_(None), Timer.ends_at > now)
        )).scalar_one()
        stockpiles = (await session.execute(select(func.count()).select_from(Stockpile).where(Stockpile.clan_id == clan))).scalar_one()

    people = sorted(members.values(), key=lambda m: (-(m.delivered_qty), -m.deliveries, -m.orders_created, m.name.lower()))
    active = sum(1 for m in people if m.orders_created or m.deliveries or m.timers_started or m.timer_notes)
    return ClanStats(
        period_days=days,
        members_total=sum(1 for m in people if m.role != "former"),
        active_members=active,
        orders_total=sum(by_status.values()),
        orders_by_status=by_status,
        deliveries=sum(m.deliveries for m in people),
        delivered_qty=sum(m.delivered_qty for m in people),
        timers_active=timers_active,
        stockpiles=stockpiles,
        members=people,
        activity=list(activity.values()),
        top_items=[TopItem(name=n, item_code=c, quantity=int(q)) for n, c, q in top],
    )
