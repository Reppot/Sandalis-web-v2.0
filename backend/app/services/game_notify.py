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


async def check_clan(clan_id: str, now: datetime | None = None) -> int:
    """Новые награды клана: записать, поздравить; сводка недели. Возвращает число новых наград."""
    now = now or datetime.now(UTC)
    async with AsyncSessionLocal() as session:
        set_current_clan_id(clan_id)
        bind_session_to_clan(session, clan_id)
        cs = (await session.execute(select(ClanSettings))).scalar_one_or_none()
        game.forget(clan_id)
        items, names = await game.credits(session, clan_id)
        if not items:
            return 0
        since = await season_start()
        badge_map = game.badges(items, since)
        rows = (await session.execute(select(GameAward.user_id, GameAward.key))).all()
        have = {(u, k) for u, k in rows}
        first_run = not have
        fresh: list[tuple[str, str]] = []
        for uid in sorted({c.user_id for c in items}):
            for key in sorted(game.award_keys(items, uid, badge_map.get(uid))):
                if (uid, key) not in have:
                    fresh.append((uid, key))
                    session.add(GameAward(user_id=uid, key=key))
        if fresh and not first_run:
            for uid, key in fresh:
                session.add(ClanMail(clan_id=clan_id, recipient_id=uid, sender_id="system", sender_name="SINDARIS",
                                     kind="game_award", payload={"key": key}))
        webhook = cs.discord_webhook_url if cs else None
        t = Translator(locale=(cs.discord_locale if cs else None) or settings.DEFAULT_LOCALE, default_domain="reports")
        week = now.isocalendar()
        week_key = f"{week[0]}-W{week[1]:02d}"
        digest = bool(webhook and cs and now.weekday() == 0 and now.hour >= DIGEST_HOUR and cs.game_digest_week != week_key)
        if digest:
            cs.game_digest_week = week_key
        await session.commit()

        if webhook and fresh and not first_run:
            lines = [f"**{names.get(uid, uid)}** — {award_label(key, t)}" for uid, key in fresh if notable(key)]
            if lines:
                await discord_bot.send_to_channel(webhook, {
                    "embeds": [{"title": t.t("game.congrats_title"), "description": "\n".join(lines[:20]), "color": COLOR}],
                    "allowed_mentions": {"parse": []},
                })
        if digest:
            await discord_bot.send_to_channel(webhook, await digest_message(session, clan_id, items, names, badge_map, now, t))
        return len(fresh)


async def digest_message(session: Any, clan_id: str, items: list[game.Credit], names: dict[str, str],
                         badge_map: dict[str, dict[str, Any]], now: datetime, t: Translator) -> dict[str, Any]:
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
