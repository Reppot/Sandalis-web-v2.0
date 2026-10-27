"""Напоминания о резервных складах: «скоро истечёт» и «истёк» — в почту сайта и в канал Discord.

Фоновая проверка раз в минуту (main.lifespan). На каждый срок таймера письмо уходит один раз:
warned_for / expired_for запоминают ends_at, о котором уже предупредили. Сброс таймера
(«обновил резерв») двигает ends_at — и следующий срок снова под наблюдением.
Получатели письма: кто поставил таймер и носители роли из настроек клана (её же пингуем в Discord).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.i18n import Translator
from app.core.tenancy import bind_session_to_clan, bypass_clan_filter, set_current_clan_id
from app.models.clan_settings import ClanSettings
from app.models.mail import ClanMail
from app.models.rbac import ClanMembership
from app.models.stockpile import Stockpile
from app.models.timer import Timer
from app.services import discord_bot

log = logging.getLogger(__name__)

INTERVAL_SEC = 60
MAX_WARN = timedelta(hours=24)       # верхняя граница timer_warn_minutes
STALE = timedelta(hours=1)           # давно истёкшие (сервер спал) — без запоздалых писем
WARN_COLOR, EXPIRED_COLOR, DONE_COLOR = 0xF59E0B, 0xEF4444, 0xA3E635


def stockpiles_url() -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/?tab=clan&view=stockpiles"


def _stamp(value: datetime) -> int:
    return int(value.timestamp())


def alert_message(kind: str, timer: Timer, place: str | None, role_id: str | None, t: Translator) -> dict[str, Any]:
    tr = lambda key, **kw: t.t(key, domain="timers", **kw)  # noqa: E731
    stamp = _stamp(timer.ends_at)
    lines = [tr(f"timer.alert.{kind}_body", stamp=stamp)]
    if place:
        lines.insert(0, f"📦 {place}")
    return {
        "content": (f"<@&{role_id}> " if role_id else "") + tr(f"timer.alert.{kind}", title=timer.title),
        "embeds": [{
            "title": f"{'⏰' if kind == 'warn' else '❌'} {timer.title}"[:256],
            "url": stockpiles_url(),
            "description": "\n".join(lines),
            "color": WARN_COLOR if kind == "warn" else EXPIRED_COLOR,
            "footer": {"text": "SINDARIS LOGISTICS OVERWATCH"},
        }],
        "components": [{"type": 1, "components": [
            {"type": 2, "style": 3, "label": tr("timer.alert.reset"), "emoji": {"name": "🔄"}, "custom_id": f"timer:reset:{timer.id}"},
            {"type": 2, "style": 5, "label": tr("timer.alert.open"), "url": stockpiles_url()},
        ]}],
        "allowed_mentions": {"roles": [role_id]} if role_id else {"parse": []},
    }


def reset_message(timer: Timer, who: str, t: Translator) -> dict[str, Any]:
    """Сообщение-напоминание после «Обновил резерв»: без пинга и кнопок."""
    return {
        "content": "",
        "embeds": [{
            "title": f"✅ {timer.title}"[:256],
            "url": stockpiles_url(),
            "description": t.t("timer.alert.reset_done", domain="timers", name=who, stamp=_stamp(timer.ends_at)),
            "color": DONE_COLOR,
        }],
        "components": [],
        "allowed_mentions": {"parse": []},
    }


async def check(now: datetime | None = None) -> int:
    """Один проход: разослать причитающиеся напоминания. Возвращает число напоминаний."""
    now = now or datetime.now(UTC)
    async with AsyncSessionLocal() as session:
        with bypass_clan_filter():
            clans = (await session.execute(
                select(Timer.clan_id).where(
                    Timer.completed_at.is_(None),
                    Timer.ends_at <= now + MAX_WARN,
                    or_(Timer.warned_for.is_distinct_from(Timer.ends_at), Timer.expired_for.is_distinct_from(Timer.ends_at)),
                ).distinct()
            )).scalars().all()
    sent = 0
    for clan_id in clans:
        try:
            sent += await _clan(clan_id, now)
        except Exception:  # noqa: BLE001 — один клан не мешает остальным
            log.warning("timer alerts failed for clan %s", clan_id, exc_info=True)
    return sent


async def _clan(clan_id: str, now: datetime) -> int:
    async with AsyncSessionLocal() as session:
        set_current_clan_id(clan_id)
        bind_session_to_clan(session, clan_id)
        cs = (await session.execute(select(ClanSettings))).scalar_one_or_none()
        warn = timedelta(minutes=(cs.timer_warn_minutes if cs and cs.timer_warn_minutes else 120))
        role_id = cs.timer_ping_role_id if cs else None
        timers = (await session.execute(
            select(Timer).where(Timer.completed_at.is_(None), Timer.ends_at <= now + warn)
        )).scalars().all()
        alerts: list[tuple[str, Timer]] = []
        for timer in timers:
            if timer.ends_at <= now:
                if timer.expired_for != timer.ends_at:
                    timer.expired_for = timer.warned_for = timer.ends_at
                    if now - timer.ends_at <= STALE:
                        alerts.append(("expired", timer))
            elif timer.warned_for != timer.ends_at:
                timer.warned_for = timer.ends_at
                alerts.append(("warn", timer))
        if not alerts:
            await session.commit()
            return 0

        holders: set[str] = set()
        if role_id:
            rows = (await session.execute(select(ClanMembership).where(ClanMembership.is_active.is_(True)))).scalars().all()
            holders = {m.user_id for m in rows if role_id in (m.discord_role_ids or [])}
        ids = {t.stockpile_id for _, t in alerts if t.stockpile_id}
        places = {s.id: f"{s.region} • {s.name}" for s in (await session.execute(select(Stockpile).where(Stockpile.id.in_(ids)))).scalars()} if ids else {}
        for kind, timer in alerts:
            recipients = holders | ({timer.created_by} if not timer.created_by.startswith(("token:", "guest:")) else set())
            payload = {"timer_id": str(timer.id), "title": timer.title, "ends_at": timer.ends_at.isoformat(),
                       "stockpile": places.get(timer.stockpile_id)}
            for uid in sorted(recipients):
                session.add(ClanMail(clan_id=clan_id, recipient_id=uid, sender_id="system", sender_name="SINDARIS",
                                     kind=f"timer_{kind}", payload=payload))
        await session.commit()

        webhook = cs.discord_webhook_url if cs else None
        if webhook:
            t = Translator(locale=(cs.discord_locale if cs else None) or settings.DEFAULT_LOCALE, default_domain="timers")
            for kind, timer in alerts:
                if not await discord_bot.send_to_channel(webhook, alert_message(kind, timer, places.get(timer.stockpile_id), role_id, t)):
                    log.warning("timer alert for %s not delivered to Discord", timer.id)
        return len(alerts)


async def watch() -> None:
    """Бесконечный цикл проверки (задача из main.lifespan)."""
    while True:
        try:
            await check()
        except Exception:  # noqa: BLE001
            log.warning("timer alerts pass failed", exc_info=True)
        await asyncio.sleep(INTERVAL_SEC)
