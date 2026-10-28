"""Очки снабжения, лиги и рейтинги клана (/clan/game). Расчёт — services/gamification.py."""
from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import CurrentPrincipal, DbDep, PermissionChecker
from app.core.errors import NotFoundError
from app.core.permissions import Scopes
from app.models.game_award import GameAward
from app.services import gamification as game
from app.services.war_api import current_war

router = APIRouter(prefix="/clan/game", tags=["clan"])
CanRead = [Depends(PermissionChecker([Scopes.CLAN_STATS]))]


class LeagueRead(BaseModel):
    tier: str
    division: int | None
    points: int
    floor: int
    next_at: int | None


class BadgeRead(BaseModel):
    tier: str
    division: int | None
    title: str | None = None


class BoardRow(BaseModel):
    rank: int
    user_id: str
    name: str
    value: float
    league: LeagueRead
    title: str | None = None
    streak: int = 0


class SeasonRead(BaseModel):
    war: int | None
    since: datetime | None


class BoardRead(BaseModel):
    period: str
    category: str
    season: SeasonRead
    rows: list[BoardRow]
    me: BoardRow | None
    participants: int


class CreditRead(BaseModel):
    kind: str
    points: float
    title: str
    at: datetime
    crates: int
    units: int
    report_id: str | None


class WeekRead(BaseModel):
    start: date
    points: float


class AchievementRead(BaseModel):
    key: str
    level: int
    levels: int
    value: int
    target: int
    earned_at: datetime | None = None


class StreakRead(BaseModel):
    current: int
    best: int


class ProfileRead(BaseModel):
    user_id: str
    name: str
    league: LeagueRead
    title: str | None
    season_points: float
    season_rank: int | None
    breakdown: dict[str, float]
    crates: int
    units: int
    reserves: int
    operations: int
    due_ok: int
    due_total: int
    weeks: list[WeekRead]
    recent: list[CreditRead]
    streak: StreakRead
    achievements: list[AchievementRead]


async def _season() -> SeasonRead:
    war = await current_war() or {}
    start = war.get("conquestStartTime")
    return SeasonRead(war=war.get("warNumber"),
                      since=datetime.fromtimestamp(start / 1000, UTC) if isinstance(start, (int, float)) else None)


def _value(a: dict[str, float], category: str) -> float:
    return round(a.get(category, 0), 1)


@router.get("", response_model=BoardRead, dependencies=CanRead, summary="Рейтинг клана по очкам снабжения")
async def leaderboard(
    principal: CurrentPrincipal,
    session: DbDep,
    period: Annotated[str, Query(pattern="^(week|month|season|all)$")] = "week",
    category: Annotated[str, Query(pattern="^(points|crates|reserves|ontime|operations)$")] = "points",
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> BoardRead:
    items, names = await game.credits(session, principal.clan_id)
    season = await _season()
    agg = game.totals(items, game.since(period, season.since))
    lifetime = game.totals(items, None)
    titles = game.titles(items, season.since)
    ranked = sorted(((u, _value(a, category)) for u, a in agg.items() if _value(a, category) > 0), key=lambda x: -x[1])
    rows = [
        BoardRow(rank=i + 1, user_id=u, name=names.get(u, u), value=v,
                 league=LeagueRead(**game.league(lifetime[u]["points"])), title=titles.get(u),
                 streak=game.streak(items, u)["current"])
        for i, (u, v) in enumerate(ranked)
    ]
    me = next((r for r in rows if r.user_id == principal.user_id), None)
    return BoardRead(period=period, category=category, season=season, rows=rows[:limit], me=me, participants=len(rows))


@router.get("/badges", response_model=dict[str, BadgeRead], dependencies=CanRead,
            summary="Лиги и титулы участников — значки у ников")
async def league_badges(principal: CurrentPrincipal, session: DbDep) -> dict[str, BadgeRead]:
    items, _ = await game.credits(session, principal.clan_id)
    season = await _season()
    return {u: BadgeRead(**b) for u, b in game.badges(items, season.since).items()}


@router.get("/members/{user_id}", response_model=ProfileRead, dependencies=CanRead, summary="Профиль бойца")
async def member_profile(user_id: str, principal: CurrentPrincipal, session: DbDep) -> ProfileRead:
    items, names = await game.credits(session, principal.clan_id)
    mine = [c for c in items if c.user_id == user_id]
    if not mine and user_id not in names:
        raise NotFoundError()
    season = await _season()
    life = game.totals(mine, None).get(user_id, {})
    season_agg = game.totals(items, game.since("season", season.since))
    ranked = [u for u, _ in sorted(((u, a["points"]) for u, a in season_agg.items() if a["points"] > 0), key=lambda x: -x[1])]
    now = datetime.now(UTC)
    week0 = (now - timedelta(days=now.weekday())).date()
    weeks: dict[date, float] = defaultdict(float)
    for c in mine:
        start = (c.at - timedelta(days=c.at.weekday())).date()
        if (week0 - start).days < 7 * 12:
            weeks[start] += c.points
    got = dict((await session.execute(
        select(GameAward.key, GameAward.created_at).where(GameAward.user_id == user_id)
    )).all())
    achievements = [
        AchievementRead(**a, earned_at=got.get(f"ach:{a['key']}:{a['level']}") if a["level"] else None)
        for a in game.achievements(items, user_id)
    ]
    return ProfileRead(
        streak=StreakRead(**game.streak(items, user_id)),
        achievements=achievements,
        user_id=user_id,
        name=names.get(user_id, user_id),
        league=LeagueRead(**game.league(life.get("points", 0))),
        title=game.titles(items, season.since).get(user_id),
        season_points=round(season_agg.get(user_id, {}).get("points", 0), 1),
        season_rank=ranked.index(user_id) + 1 if user_id in ranked else None,
        breakdown={k: round(life.get(f"by_{k}", 0), 1) for k in ("delivery", "line_done", "reserve", "attend", "order_done")},
        crates=int(life.get("crates", 0)),
        units=int(life.get("units", 0)),
        reserves=int(life.get("reserves", 0)),
        operations=int(life.get("operations", 0)),
        due_ok=int(life.get("due_ok", 0)),
        due_total=int(life.get("due_total", 0)),
        weeks=[WeekRead(start=week0 - timedelta(weeks=i), points=round(weeks.get(week0 - timedelta(weeks=i), 0), 1)) for i in range(11, -1, -1)],
        recent=[CreditRead(kind=c.kind, points=c.points, title=c.title, at=c.at, crates=c.crates, units=c.units, report_id=c.report_id)
                for c in sorted(mine, key=lambda c: c.at, reverse=True)[:15]],
    )
