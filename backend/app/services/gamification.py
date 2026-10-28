"""Очки снабжения (ОС), лиги и рейтинги клана.

Очки не хранятся — считаются на лету из того, что уже есть в базе: вклады в заказы, заказы,
операции и явка, журнал таймеров. Удалили вклад или заказ — очки исчезли сами. Результат
кэшируется на CACHE_SEC по клану.

Правила (концепт «геймификация статистики», этап 1):
  * доставка: 1 ОС за ящик, 5 за штуку (техника, постройки); засчитывается не больше, чем
    заказано в строке (вклады по порядку времени). Множители: в срок ×1,25, к операции до её
    даты ×1,5, высокий приоритет ×1,2, вклад в собственный заказ ×0,5;
  * своим вкладом закрыл строку до 100 % — +5;
  * обновил резерв склада — 15 (30, если оставалось меньше 2 ч), не больше 10 в сутки;
  * отметился в явке на прошедшую операцию — 5; создал заказ, который выполнен, — 2.
Лига — по сумме очков за всё время; титулы сезона (текущая война Foxhole) — по месту в сезоне.
"""
from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, time as dtime, timedelta
from typing import Any, Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operation import ClanOperation
from app.models.rbac import ClanMembership, User
from app.models.report import OrderReport, ReportContribution, ReportStatus
from app.models.timer import TimerEvent

POINTS: Final[dict[str, float]] = {
    "crate": 1, "unit": 5, "line_done": 5, "reserve": 15, "reserve_save": 30, "attend": 5, "order_done": 2,
}
MULT: Final[dict[str, float]] = {"on_time": 1.25, "operation": 1.5, "high": 1.2, "own": 0.5}
SAVE_WINDOW_SEC: Final[int] = 2 * 3600
RESERVE_DAILY_CAP: Final[int] = 10
LEAGUES: Final[tuple[tuple[str, int], ...]] = (
    ("iron", 0), ("bronze", 100), ("silver", 300), ("gold", 700),
    ("platinum", 1500), ("emerald", 3000), ("diamond", 6000), ("master", 10000),
)
SEASON_MIN: Final[int] = 500          # меньше — без титула сезона
ONTIME_MIN: Final[int] = 10           # рейтинг «точно в срок» — от 10 доставок со сроком
CACHE_SEC: Final[int] = 120
CATEGORIES: Final[tuple[str, ...]] = ("points", "crates", "reserves", "ontime", "operations")
PERIODS: Final[tuple[str, ...]] = ("week", "month", "season", "all")


@dataclass(frozen=True)
class Credit:
    user_id: str
    at: datetime
    kind: str                 # delivery | line_done | reserve | attend | order_done
    points: float
    crates: int = 0           # ящики (для рейтинга «грузчик»)
    units: int = 0            # штуки
    to_operation: int = 0     # ящики к операции до её даты
    due_ok: bool | None = None  # доставка в заказ со сроком: в срок / нет
    title: str = ""
    report_id: str | None = None


_cache: dict[str, tuple[float, list[Credit], dict[str, str]]] = {}


def forget(clan_id: str) -> None:
    _cache.pop(clan_id, None)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def credits(session: AsyncSession, clan_id: str) -> tuple[list[Credit], dict[str, str]]:
    """Все начисления клана и имена участников (session уже привязана к клану)."""
    hit = _cache.get(clan_id)
    if hit and hit[0] > time.monotonic():
        return hit[1], hit[2]

    names: dict[str, str] = {}
    rows = (await session.execute(
        select(ClanMembership.user_id, User.display_name).join(User, User.id == ClanMembership.user_id)
    )).all()
    names.update({uid: name or uid for uid, name in rows})

    reports = {r.id: r for r in (await session.execute(select(OrderReport))).scalars().all()}
    ops = (await session.execute(select(ClanOperation))).scalars().all()
    op_date: dict[Any, date] = {}
    for op in ops:
        for rid in op.report_ids or []:
            op_date[rid] = min(op_date.get(rid, op.date), op.date)
    for r in reports.values():
        if r.operation_id:
            d = next((o.date for o in ops if o.id == r.operation_id), None)
            if d:
                op_date[str(r.id)] = min(op_date.get(str(r.id), d), d)

    out: list[Credit] = []
    remaining = {line.id: line.quantity for r in reports.values() for line in r.lines}
    unit_of = {line.id: line.unit for r in reports.values() for line in r.lines}
    contributions = (await session.execute(
        select(ReportContribution).order_by(ReportContribution.created_at.asc(), ReportContribution.id.asc())
    )).scalars().all()
    for c in contributions:
        report = reports.get(c.report_id)
        if report is None or c.user_id.startswith(("token:", "guest:")):
            continue
        names.setdefault(c.user_id, c.user_name or c.user_id)
        at = _aware(c.created_at)
        day = at.date()
        mult = 1.0
        due_ok = None
        if report.due_date:
            due_ok = day <= report.due_date
            if due_ok:
                mult *= MULT["on_time"]
        od = op_date.get(str(report.id))
        to_op = bool(od and day <= od)
        if to_op:
            mult *= MULT["operation"]
        if report.priority == "high":
            mult *= MULT["high"]
        if report.created_by == c.user_id:
            mult *= MULT["own"]
        crates = units = 0
        base = 0.0
        closed = 0
        for cl in c.lines:
            left = remaining.get(cl.line_id, 0)
            got = min(cl.quantity, left)
            if got <= 0:
                continue
            remaining[cl.line_id] = left - got
            if unit_of.get(cl.line_id) == "unit":
                units += got
                base += got * POINTS["unit"]
            else:
                crates += got
                base += got * POINTS["crate"]
            if remaining[cl.line_id] == 0:
                closed += 1
        if base:
            out.append(Credit(c.user_id, at, "delivery", round(base * mult, 2), crates=crates, units=units,
                              to_operation=crates if to_op else 0, due_ok=due_ok, title=report.title, report_id=str(report.id)))
        if closed:
            own = MULT["own"] if report.created_by == c.user_id else 1.0
            out.append(Credit(c.user_id, at, "line_done", POINTS["line_done"] * closed * own, title=report.title, report_id=str(report.id)))

    for r in reports.values():
        if r.status == ReportStatus.DONE.value and not r.created_by.startswith(("token:", "guest:")):
            out.append(Credit(r.created_by, _aware(r.updated_at), "order_done", POINTS["order_done"], title=r.title, report_id=str(r.id)))

    events = (await session.execute(
        select(TimerEvent).where(TimerEvent.kind == "restart", TimerEvent.user_id.is_not(None))
        .order_by(TimerEvent.created_at.asc())
    )).scalars().all()
    per_day: dict[tuple[str, date], int] = defaultdict(int)
    for e in events:
        at = _aware(e.created_at)
        key = (e.user_id, at.date())
        if per_day[key] >= RESERVE_DAILY_CAP:
            continue
        per_day[key] += 1
        save = e.left_sec is not None and e.left_sec < SAVE_WINDOW_SEC
        out.append(Credit(e.user_id, at, "reserve", POINTS["reserve_save" if save else "reserve"]))

    today = datetime.now(UTC).date()
    for op in ops:
        if op.date > today:
            continue
        at = datetime.combine(op.date, dtime(12), tzinfo=UTC)
        for p in op.participants or []:
            uid = p.get("user_id")
            if uid:
                names.setdefault(uid, p.get("name") or uid)
                out.append(Credit(uid, at, "attend", POINTS["attend"], title=op.title))

    _cache[clan_id] = (time.monotonic() + CACHE_SEC, out, names)
    return out, names


# ───────────────────────── лиги ─────────────────────────

def league(points: float) -> dict[str, Any]:
    """Лига и ступень (IV..I) по сумме очков; next_at — очки до следующей ступени/лиги."""
    p = max(0.0, points)
    idx = max(i for i, (_, lo) in enumerate(LEAGUES) if p >= lo)
    tier, lo = LEAGUES[idx]
    if idx == len(LEAGUES) - 1:
        return {"tier": tier, "division": None, "points": round(p), "floor": lo, "next_at": None}
    hi = LEAGUES[idx + 1][1]
    step = (hi - lo) / 4
    k = min(3, int((p - lo) // step))
    return {"tier": tier, "division": 4 - k, "points": round(p), "floor": round(lo + k * step), "next_at": round(lo + (k + 1) * step)}


def since(period: str, season_start: datetime | None) -> datetime | None:
    now = datetime.now(UTC)
    if period == "week":
        return now - timedelta(days=7)
    if period == "month":
        return now - timedelta(days=30)
    if period == "season":
        return season_start or now - timedelta(days=30)
    return None


def totals(items: list[Credit], start: datetime | None) -> dict[str, dict[str, float]]:
    agg: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for c in items:
        if start and c.at < start:
            continue
        a = agg[c.user_id]
        a["points"] += c.points
        a["crates"] += c.crates
        a["units"] += c.units
        a["operations"] += c.to_operation
        if c.kind == "reserve":
            a["reserves"] += 1
        if c.due_ok is not None:
            a["due_total"] += 1
            a["due_ok"] += 1 if c.due_ok else 0
        a[f"by_{c.kind}"] += c.points
    for a in agg.values():
        a["ontime"] = round(100 * a["due_ok"] / a["due_total"], 1) if a["due_total"] >= ONTIME_MIN else 0
    return agg


def titles(items: list[Credit], season_start: datetime | None) -> dict[str, str]:
    """Титулы сезона: №1 — challenger, 2–5 — grandmaster (от SEASON_MIN очков)."""
    agg = totals(items, since("season", season_start))
    ranked = sorted(((u, a["points"]) for u, a in agg.items() if a["points"] >= SEASON_MIN), key=lambda x: -x[1])
    return {u: ("challenger" if i == 0 else "grandmaster") for i, (u, _) in enumerate(ranked[:5])}


def badges(items: list[Credit], season_start: datetime | None) -> dict[str, dict[str, Any]]:
    lifetime = totals(items, None)
    season = titles(items, season_start)
    out = {}
    for uid, a in lifetime.items():
        lg = league(a["points"])
        out[uid] = {"tier": lg["tier"], "division": lg["division"], "title": season.get(uid)}
    return out
