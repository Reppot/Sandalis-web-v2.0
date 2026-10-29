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
    op_id: str | None = None          # операция, к которой привезено (до её даты)
    left_sec: int | None = None       # резерв: сколько оставалось при обновлении


_cache: dict[str, tuple[float, list[Credit], dict[str, str]]] = {}

# настройки командира (ClanSettings.game_settings); пустые поля — значения по умолчанию
DEFAULT_SETTINGS: Final[dict[str, Any]] = {
    "enabled": True,          # геймификация в клане включена
    "weights": {},            # свои веса очков: {crate, unit, line_done, reserve, reserve_save, attend, order_done}
    "excluded_roles": [],     # роли Discord, чьи носители не участвуют (боты, гости)
    "squads": [],             # роли Discord — отряды для соревнования
    "weekly_goal": 0,         # цель недели в ящиках (0 — без цели)
    "league_roles": False,    # бот выдаёт роли «Лига: …» по лиге участника
}


def settings_of(cs: Any) -> dict[str, Any]:
    raw = (getattr(cs, "game_settings", None) or {}) if cs is not None else {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in raw.items() if k in DEFAULT_SETTINGS}}


def weights_of(cfg: dict[str, Any]) -> dict[str, float]:
    return {**POINTS, **{k: float(v) for k, v in (cfg.get("weights") or {}).items() if k in POINTS}}


def forget(clan_id: str) -> None:
    _cache.pop(clan_id, None)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


async def credits(session: AsyncSession, clan_id: str) -> tuple[list[Credit], dict[str, str]]:
    """Все начисления клана и имена участников (session уже привязана к клану)."""
    hit = _cache.get(clan_id)
    if hit and hit[0] > time.monotonic():
        return hit[1], hit[2]

    from app.models.clan_settings import ClanSettings

    cfg = settings_of((await session.execute(select(ClanSettings))).scalar_one_or_none())
    W = weights_of(cfg)
    excluded_roles = set(cfg["excluded_roles"])
    names: dict[str, str] = {}
    excluded: set[str] = set()
    rows = (await session.execute(
        select(ClanMembership.user_id, User.display_name, ClanMembership.discord_role_ids).join(User, User.id == ClanMembership.user_id)
    )).all()
    for uid, name, role_ids in rows:
        names[uid] = name or uid
        if excluded_roles & set(role_ids or []):
            excluded.add(uid)

    reports = {r.id: r for r in (await session.execute(select(OrderReport))).scalars().all()}
    ops = (await session.execute(select(ClanOperation))).scalars().all()
    # заказ → (дата ближайшей операции, её id)
    op_date: dict[str, tuple[date, str]] = {}

    def link(rid: str, op: ClanOperation) -> None:
        if rid not in op_date or op.date < op_date[rid][0]:
            op_date[rid] = (op.date, str(op.id))

    for op in ops:
        for rid in op.report_ids or []:
            link(rid, op)
    for r in reports.values():
        op = next((o for o in ops if o.id == r.operation_id), None) if r.operation_id else None
        if op:
            link(str(r.id), op)

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
        to_op = bool(od and day <= od[0])
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
                base += got * W["unit"]
            else:
                crates += got
                base += got * W["crate"]
            if remaining[cl.line_id] == 0:
                closed += 1
        if base:
            out.append(Credit(c.user_id, at, "delivery", round(base * mult, 2), crates=crates, units=units,
                              to_operation=crates if to_op else 0, due_ok=due_ok, title=report.title, report_id=str(report.id),
                              op_id=od[1] if to_op else None))
        if closed:
            own = MULT["own"] if report.created_by == c.user_id else 1.0
            out.append(Credit(c.user_id, at, "line_done", W["line_done"] * closed * own, title=report.title, report_id=str(report.id)))

    for r in reports.values():
        if r.status == ReportStatus.DONE.value and not r.created_by.startswith(("token:", "guest:")):
            out.append(Credit(r.created_by, _aware(r.updated_at), "order_done", W["order_done"], title=r.title, report_id=str(r.id)))

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
        out.append(Credit(e.user_id, at, "reserve", W["reserve_save" if save else "reserve"], left_sec=e.left_sec))

    # заказ привезён целиком одним человеком — для достижения «Закрыл заказ»
    for r in reports.values():
        if r.lines and all(remaining.get(line.id, 1) == 0 for line in r.lines):
            who = {c.user_id for c in out if c.kind == "delivery" and c.report_id == str(r.id)}
            if len(who) == 1:
                out.append(Credit(next(iter(who)), _aware(r.updated_at), "closer", 0, title=r.title, report_id=str(r.id)))

    today = datetime.now(UTC).date()
    for op in ops:
        if op.date > today:
            continue
        at = datetime.combine(op.date, dtime(12), tzinfo=UTC)
        for p in op.participants or []:
            uid = p.get("user_id")
            # явка: отмеченные «был» — всегда; иначе «иду», если командир не отметил «не был»
            came = p.get("attended")
            if uid and (came is True or (came is None and p.get("status", "go") == "go")):
                names.setdefault(uid, p.get("name") or uid)
                out.append(Credit(uid, at, "attend", W["attend"], title=op.title))

    if excluded:
        out = [c for c in out if c.user_id not in excluded]
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


# ───────────────────────── серии ─────────────────────────

def _active_days(items: list[Credit], user_id: str) -> set[date]:
    return {c.at.date() for c in items if c.user_id == user_id and c.kind in ("delivery", "reserve")}


def _run(days: set[date], end: date) -> int:
    """Серия, заканчивающаяся днём end: дни подряд с вкладом; один пропуск в неделю (ISO) прощается."""
    n, d, rested = 0, end, set()
    while True:
        if d in days:
            n += 1
        else:
            week = d.isocalendar()[:2]
            if week in rested or (d - timedelta(days=1)) not in days:
                break
            rested.add(week)
        d -= timedelta(days=1)
    return n


def streak(items: list[Credit], user_id: str) -> dict[str, int]:
    """Текущая серия (сегодняшний день ещё не обрывает её) и лучшая."""
    days = _active_days(items, user_id)
    if not days:
        return {"current": 0, "best": 0}
    today = datetime.now(UTC).date()
    start = today if today in days else today - timedelta(days=1)
    current = _run(days, start) if (start in days or start - timedelta(days=1) in days) else 0
    best = max(_run(days, d) for d in days if d + timedelta(days=1) not in days)
    return {"current": current, "best": max(best, current)}


# ───────────────────────── достижения ─────────────────────────

# ключ → пороги ступеней (одна ступень — без бронзы/серебра/золота)
ACHIEVEMENTS: Final[dict[str, tuple[int, ...]]] = {
    "first_delivery": (1,),
    "hauler": (100, 1000, 10000),
    "keeper": (10, 100, 500),
    "savior": (1,),
    "on_time": (10,),
    "closer": (1,),
    "op_pillar": (500,),
    "veteran": (10, 25, 50),
    "hot_week": (300,),
    "streak": (7, 30),
    "multitasker": (1,),
    "team_player": (1,),
}
RARE: Final[frozenset[str]] = frozenset({"savior", "closer", "op_pillar", "hot_week", "team_player"})


def metrics(items: list[Credit], user_id: str) -> dict[str, int]:
    mine = [c for c in items if c.user_id == user_id]
    deliveries = [c for c in mine if c.kind == "delivery"]
    by_op: dict[str, int] = defaultdict(int)
    by_week: dict[tuple[int, int], int] = defaultdict(int)
    by_day: dict[date, set[str]] = defaultdict(set)
    for c in deliveries:
        if c.op_id:
            by_op[c.op_id] += c.to_operation
        by_week[c.at.isocalendar()[:2]] += c.crates
        if c.report_id:
            by_day[c.at.date()].add(c.report_id)
    people: dict[str, set[str]] = defaultdict(set)
    for c in items:
        if c.kind == "delivery" and c.report_id:
            people[c.report_id].add(c.user_id)
    return {
        "first_delivery": len(deliveries),
        "hauler": sum(c.crates for c in deliveries),
        "keeper": sum(1 for c in mine if c.kind == "reserve"),
        "savior": sum(1 for c in mine if c.kind == "reserve" and c.left_sec is not None and c.left_sec < 1800),
        "on_time": sum(1 for c in deliveries if c.due_ok),
        "closer": sum(1 for c in mine if c.kind == "closer"),
        "op_pillar": max(by_op.values(), default=0),
        "veteran": sum(1 for c in mine if c.kind == "attend"),
        "hot_week": max(by_week.values(), default=0),
        "streak": streak(items, user_id)["best"],
        "multitasker": sum(1 for ids in by_day.values() if len(ids) >= 5),
        "team_player": sum(1 for c in deliveries if c.report_id and len(people[c.report_id]) >= 5) and 1,
    }


def achievements(items: list[Credit], user_id: str) -> list[dict[str, Any]]:
    """Каждое достижение: сколько ступеней получено, текущее значение и следующая цель."""
    m = metrics(items, user_id)
    out = []
    for key, steps in ACHIEVEMENTS.items():
        value = m.get(key, 0)
        level = sum(1 for t in steps if value >= t)
        out.append({"key": key, "level": level, "levels": len(steps), "value": value,
                    "target": steps[level] if level < len(steps) else steps[-1]})
    return out


def award_keys(items: list[Credit], user_id: str, badge: dict[str, Any] | None) -> set[str]:
    """Полученные «награды» для уведомлений: ступени достижений и лиги (без ступеней внутри лиги)."""
    keys = {f"ach:{a['key']}:{lvl}" for a in achievements(items, user_id) for lvl in range(1, a["level"] + 1)}
    if badge:
        idx = [t for t, _ in LEAGUES].index(badge["tier"])
        keys |= {f"league:{t}" for t, _ in LEAGUES[1: idx + 1]}
    return keys


# ───────────────────────── цель недели, отряды ─────────────────────────

def week_start(now: datetime) -> datetime:
    day = now.astimezone(UTC).date()
    return datetime.combine(day - timedelta(days=day.weekday()), dtime(0), tzinfo=UTC)


def week_key(now: datetime) -> str:
    y, w, _ = now.isocalendar()
    return f"{y}-W{w:02d}"


def goal(items: list[Credit], cfg: dict[str, Any], now: datetime) -> dict[str, Any] | None:
    target = int(cfg.get("weekly_goal") or 0)
    if target <= 0:
        return None
    start = week_start(now)
    week = [c for c in items if c.at >= start and c.crates]
    progress = sum(c.crates for c in week)
    by_user: dict[str, int] = defaultdict(int)
    for c in week:
        by_user[c.user_id] += c.crates
    return {"target": target, "progress": progress, "done": progress >= target, "week": week_key(now),
            "contributors": sorted(by_user.items(), key=lambda x: -x[1])}


def squads(items: list[Credit], cfg: dict[str, Any], roles: list[dict[str, Any]], member_roles: dict[str, list[str]],
           now: datetime) -> list[dict[str, Any]]:
    """Отряды (роли Discord): очки за неделю на одного активного участника отряда."""
    agg = totals(items, week_start(now))
    by_id = {r["id"]: r for r in roles}
    out = []
    for rid in cfg.get("squads") or []:
        members = [u for u, ids in member_roles.items() if rid in (ids or [])]
        active = [u for u in members if agg.get(u, {}).get("points", 0) > 0]
        points = sum(agg[u]["points"] for u in active)
        out.append({"role_id": rid, "name": by_id.get(rid, {}).get("name") or rid, "color": by_id.get(rid, {}).get("color", 0),
                    "members": len(members), "active": len(active), "points": round(points, 1),
                    "per_active": round(points / len(active), 1) if active else 0.0})
    out.sort(key=lambda x: -x["per_active"])
    for i, sq in enumerate(out):
        sq["rank"] = i + 1
    return out


def season_top(items: list[Credit], since: datetime | None, until: datetime, names: dict[str, str], n: int = 3) -> list[dict[str, Any]]:
    agg = totals([c for c in items if c.at < until], since)
    lifetime = totals(items, None)
    ranked = sorted(((u, a["points"]) for u, a in agg.items() if a["points"] > 0), key=lambda x: -x[1])[:n]
    return [{"user_id": u, "name": names.get(u, u), "points": round(p, 1), "tier": league(lifetime[u]["points"])["tier"]} for u, p in ranked]
