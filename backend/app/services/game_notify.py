"""Поздравления и еженедельная сводка очков снабжения (фон, раз в INTERVAL_SEC).

Новые награды (ступени достижений, переход в новую лигу) записываются в game_awards и
приходят в почту сайта; заметные (лиги, редкие достижения, ступени II–III) — ещё и постом
в канал клана. Первый проход по клану — тихий: всё уже заработанное до запуска просто
отмечается, без потока поздравлений. По понедельникам (после DIGEST_HOUR по UTC) — сводка
недели в канал: топ-3 по очкам, грузчик, хранитель резервов, лучшая серия, новые лиги.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.i18n import Translator
from app.core.tenancy import bind_session_to_clan, bypass_clan_filter, set_current_clan_id
from app.models.clan_settings import ClanSettings
from app.models.game_award import GameAward
from app.models.mail import ClanMail
from app.models.report import ReportContribution
from app.services import discord_bot
from app.services import gamification as game
from app.services.war_api import current_war

log = logging.getLogger(__name__)

INTERVAL_SEC = 600
DIGEST_HOUR = 9
ROMAN = ["", "I", "II", "III", "IV"]
COLOR = 0xA3E635


def award_label(key: str, t: Translator) -> str:
    """«Грузчик II» / «лига Золото» на языке канала."""
    kind, _, rest = key.partition(":")
    if kind == "league":
        return t.t("game.league_up", tier=t.t(f"game.tier.{rest}"))
    name, _, lvl = rest.partition(":")
    return t.t("game.achievement", name=ach_name(name, int(lvl), t))


def ach_name(key: str, level: int, t: Translator) -> str:
    """Название достижения со ступенью: «Грузчик II» (у одноступенчатых — без цифры)."""
    levels = len(game.ACHIEVEMENTS.get(key, (1,)))
    return t.t(f"game.ach.{key}") + (f" {ROMAN[level]}" if levels > 1 else "")


def notable(key: str) -> bool:
    if key.startswith("league:"):
        return True
    _, name, lvl = key.split(":")
    return name in game.RARE or int(lvl) >= 2


async def season_start() -> datetime | None:
    war = await current_war() or {}
    start = war.get("conquestStartTime")
    return datetime.fromtimestamp(start / 1000, UTC) if isinstance(start, (int, float)) else None


TIER_COLOR = {"iron": 0x5F5E5A, "bronze": 0xB4693E, "silver": 0xA8ABB0, "gold": 0xE0A526, "platinum": 0x1D9E75,
              "emerald": 0x3FA34D, "diamond": 0x378ADD, "master": 0x7F77DD}
ROLE_CHANGES_PER_PASS = 25


def _parse(ts: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(ts) if isinstance(ts, str) else None
    except ValueError:
        return None


async def check_clan(clan_id: str, now: datetime | None = None) -> int:
    """Проход по клану: новые награды и поздравления, итоги войны в Зал славы, цель недели,
    роли лиг в Discord, сводка недели. Возвращает число новых наград."""
    now = now or datetime.now(UTC)
    async with AsyncSessionLocal() as session:
        set_current_clan_id(clan_id)
        bind_session_to_clan(session, clan_id)
        cs = (await session.execute(select(ClanSettings))).scalar_one_or_none()
        cfg = game.settings_of(cs)
        if not cfg["enabled"]:
            return 0
        game.forget(clan_id)
        items, names = await game.credits(session, clan_id)
        if not items:
            return 0
        war = await current_war() or {}
        war_no = war.get("warNumber")
        start = war.get("conquestStartTime")
        since = datetime.fromtimestamp(start / 1000, UTC) if isinstance(start, (int, float)) else None
        badge_map = game.badges(items, since)
        rows = (await session.execute(select(GameAward.user_id, GameAward.key))).all()
        have = {(u, k) for u, k in rows}
        first_run = not have

        def award(uid: str, key: str) -> bool:
            if (uid, key) in have:
                return False
            have.add((uid, key))
            session.add(GameAward(user_id=uid, key=key))
            return True

        fresh: list[tuple[str, str]] = []
        for uid in sorted({c.user_id for c in items}):
            for key in sorted(game.award_keys(items, uid, badge_map.get(uid))):
                if award(uid, key):
                    fresh.append((uid, key))
        if fresh and not first_run:
            for uid, key in fresh:
                session.add(ClanMail(clan_id=clan_id, recipient_id=uid, sender_id="system", sender_name="SINDARIS",
                                     kind="game_award", payload={"key": key}))
        t = Translator(locale=(cs.discord_locale if cs else None) or settings.DEFAULT_LOCALE, default_domain="reports")
        posts: list[dict[str, Any]] = []
        state = dict(cs.game_state or {}) if cs else {}

        # сезон = война Foxhole: сменилась война — итоги прошлой в Зал славы
        if cs and war_no:
            prev = state.get("season_war")
            if prev is None:
                state.update(season_war=war_no, season_since=since.isoformat() if since else None)
            elif prev != war_no:
                prev_since = _parse(state.get("season_since"))
                # граница сезонов — начало новой войны (если War API отдал его позже прошлого), иначе сейчас
                until = since if since and (prev_since is None or since > prev_since) else now
                top = game.season_top(items, prev_since, until, names)
                cs.game_hall = ([{"war": prev, "since": state.get("season_since"), "until": until.isoformat(), "top": top}]
                                + list(cs.game_hall or []))[:20]
                for i, e in enumerate(top):
                    award(e["user_id"], f"season:{prev}:{i + 1}")
                if top:
                    medals = ["🥇", "🥈", "🥉"]
                    posts.append({"embeds": [{"title": t.t("game.hall_title", war=prev), "color": 0xF5C84B, "description": "\n".join(
                        f"{medals[i]} **{e['name']}** — {round(e['points'])}" for i, e in enumerate(top))}]})
                state.update(season_war=war_no, season_since=since.isoformat() if since else None)

        # цель недели: выполнена — всем, кто возил на этой неделе, отметка недели и пост в канал
        g = game.goal(items, cfg, now)
        if cs and g and g["done"] and state.get("goal_done_week") != g["week"]:
            state["goal_done_week"] = g["week"]
            for uid, _ in g["contributors"]:
                award(uid, f"goal:{g['week']}")
            posts.append({"embeds": [{"title": t.t("game.goal_done_title"), "color": COLOR, "description": t.t(
                "game.goal_done", n=g["progress"], target=g["target"],
                list=", ".join(names.get(u, u) for u, _ in g["contributors"][:15]))}]})

        webhook = cs.discord_webhook_url if cs else None
        week_key = game.week_key(now)
        digest = bool(webhook and cs and now.weekday() == 0 and now.hour >= DIGEST_HOUR and cs.game_digest_week != week_key)
        if digest:
            cs.game_digest_week = week_key
        if cs:
            cs.game_state = state
        await session.commit()

        if webhook and fresh and not first_run:
            lines = [f"**{names.get(uid, uid)}** — {award_label(key, t)}" for uid, key in fresh if notable(key)]
            if lines:
                posts.insert(0, {"embeds": [{"title": t.t("game.congrats_title"), "description": "\n".join(lines[:20]), "color": COLOR}]})
        if webhook:
            for p in posts:
                await discord_bot.send_to_channel(webhook, {**p, "allowed_mentions": {"parse": []}})
        if digest:
            await discord_bot.send_to_channel(webhook, await digest_message(session, clan_id, items, names, badge_map, now, t, cfg, cs))
        if cs and cfg["league_roles"] and discord_bot.enabled():
            await sync_league_roles(session, clan_id, cs, badge_map, t)
        return len(fresh)


async def sync_league_roles(session: Any, clan_id: str, cs: ClanSettings, badge_map: dict[str, dict[str, Any]], t: Translator) -> int:
    """Роли «Лига: …» на сервере клана: создать недостающие, выдать по лиге, снять прежнюю.
    За проход — не больше ROLE_CHANGES_PER_PASS участников (лимиты Discord)."""
    from app.models.rbac import Clan, ClanMembership

    with bypass_clan_filter():
        guild = (await session.execute(select(Clan.discord_guild_id).where(Clan.id == clan_id))).scalar_one_or_none()
    if not guild:
        return 0
    state = dict(cs.game_state or {})
    role_ids: dict[str, str] = dict(state.get("league_role_ids") or {})
    for tier, _ in game.LEAGUES:
        if tier not in role_ids:
            rid = await discord_bot.create_role(guild, f"{t.t('game.role_prefix')} {t.t('game.tier.' + tier)}", TIER_COLOR[tier])
            if rid:
                role_ids[tier] = rid
    members = set((await session.execute(select(ClanMembership.user_id).where(ClanMembership.is_active.is_(True)))).scalars().all())
    assigned: dict[str, str] = dict(state.get("league_roles_assigned") or {})
    changes = 0
    for uid, b in sorted(badge_map.items()):
        tier = b["tier"]
        if uid not in members or assigned.get(uid) == tier or tier not in role_ids:
            continue
        if changes >= ROLE_CHANGES_PER_PASS:
            break
        if await discord_bot.add_role(guild, uid, role_ids[tier]):
            old = assigned.get(uid)
            if old and old in role_ids:
                await discord_bot.remove_role(guild, uid, role_ids[old])
            assigned[uid] = tier
            changes += 1
    state.update(league_role_ids=role_ids, league_roles_assigned=assigned)
    cs.game_state = state
    await session.commit()
    return changes


async def digest_message(session: Any, clan_id: str, items: list[game.Credit], names: dict[str, str],
                         badge_map: dict[str, dict[str, Any]], now: datetime, t: Translator,
                         cfg: dict[str, Any] | None = None, cs: ClanSettings | None = None) -> dict[str, Any]:
    start = now - timedelta(days=7)
    agg = game.totals(items, start)
    top = sorted(agg.items(), key=lambda x: -x[1]["points"])[:3]
    medals = ["🥇", "🥈", "🥉"]
    lines = [t.t("game.digest_top")]
    for i, (uid, a) in enumerate(top):
        b = badge_map.get(uid) or {}
        tier = t.t(f"game.tier.{b.get('tier', 'iron')}") + (f" {ROMAN[b['division']]}" if b.get("division") else "")
        lines.append(f"{medals[i]} **{names.get(uid, uid)}** — {round(a['points'])} · {tier}")
    if not top:
        lines.append(t.t("game.digest_quiet"))
    hauler = max(agg.items(), key=lambda x: x[1]["crates"], default=None)
    keeper = max(agg.items(), key=lambda x: x[1]["reserves"], default=None)
    if hauler and hauler[1]["crates"]:
        lines.append(t.t("game.digest_hauler", name=names.get(hauler[0], hauler[0]), n=int(hauler[1]["crates"])))
    if keeper and keeper[1]["reserves"]:
        lines.append(t.t("game.digest_keeper", name=names.get(keeper[0], keeper[0]), n=int(keeper[1]["reserves"])))
    streaks = sorted(((u, game.streak(items, u)["current"]) for u in {c.user_id for c in items}), key=lambda x: -x[1])
    if streaks and streaks[0][1] >= 3:
        lines.append(t.t("game.digest_streak", name=names.get(streaks[0][0], streaks[0][0]), n=streaks[0][1]))
    rows = (await session.execute(
        select(GameAward.user_id, GameAward.key).where(GameAward.created_at >= start, GameAward.key.like("league:%"))
    )).all()
    ups = [f"{names.get(u, u)} → {t.t('game.tier.' + k.split(':')[1])}" for u, k in rows]
    if ups:
        lines.append(t.t("game.digest_leagues", list=", ".join(ups[:10])))
    # прошлая неделя: цель и лучший отряд
    if cfg:
        last = now - timedelta(days=1)
        g = game.goal(items, cfg, last)
        if g:
            lines.append(t.t("game.digest_goal", n=g["progress"], target=g["target"]))
        if cfg.get("squads") and cs is not None:
            from app.models.rbac import ClanMembership

            member_roles = dict((await session.execute(select(ClanMembership.user_id, ClanMembership.discord_role_ids))).all())
            sq = game.squads(items, cfg, list(cs.discord_roles or []), member_roles, last)
            if sq and sq[0]["per_active"] > 0:
                lines.append(t.t("game.digest_squad", name=sq[0]["name"], n=round(sq[0]["per_active"])))
    return {
        "embeds": [{"title": t.t("game.digest_title"), "description": "\n".join(lines)[:4000], "color": COLOR,
                    "url": f"{settings.FRONTEND_URL.rstrip('/')}/?tab=clan&view=stats"}],
        "allowed_mentions": {"parse": []},
    }


async def watch() -> None:
    """Фоновый цикл (main.lifespan): все кланы, где есть вклады в заказы."""
    while True:
        try:
            async with AsyncSessionLocal() as session:
                with bypass_clan_filter():
                    clans = (await session.execute(select(ReportContribution.clan_id).distinct())).scalars().all()
            for clan_id in clans:
                try:
                    await check_clan(clan_id)
                except Exception:  # noqa: BLE001 — один клан не мешает остальным
                    log.warning("game notify failed for clan %s", clan_id, exc_info=True)
        except Exception:  # noqa: BLE001
            log.warning("game notify pass failed", exc_info=True)
        await asyncio.sleep(INTERVAL_SEC)
