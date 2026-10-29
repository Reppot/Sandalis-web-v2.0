"""Операции клана в Discord: пост с кнопками явки, ветка обсуждения, событие сервера,
напоминание за час до начала с пингом записавшихся.

Пост — в канал вебхука клана (через бота: у вебхука нет рабочих кнопок). Кнопки
op:go:<id> / op:no:<id> обрабатывает discord_interactions. Сбои Discord только в лог.
"""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, time, timedelta
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.i18n import Translator
from app.core.tenancy import bind_session_to_clan, bypass_clan_filter, set_current_clan_id
from app.models.clan_settings import ClanSettings
from app.models.operation import ClanOperation
from app.models.rbac import Clan
from app.services import discord_bot, operation_plan
from app.services.report_tasks import progress_for

log = logging.getLogger(__name__)

DEFAULT_START = time(18, 0)        # без времени — 18:00 UTC
EVENT_HOURS = 3
REMIND_BEFORE = timedelta(hours=1)
COLOR = 0xF59E0B


def start_of(op: ClanOperation) -> datetime:
    return op.starts_at or datetime.combine(op.date, DEFAULT_START, tzinfo=UTC)


def ids_of(op: ClanOperation) -> dict[str, str | None]:
    return {"channel": op.discord_channel_id, "message": op.discord_message_id,
            "thread": op.discord_thread_id, "event": op.discord_event_id}


def site_url() -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/?tab=clan&view=operations"


async def _readiness(session: Any, op: ClanOperation) -> tuple[int, int, int]:
    """(заказов, доставлено ящиков, заказано ящиков) по заказам к операции."""
    from app.models.report import OrderReport

    ids = set(op.report_ids or [])
    reports = [r for r in (await session.execute(select(OrderReport))).scalars().all()
               if str(r.id) in ids or r.operation_id == op.id]
    if not reports:
        return 0, 0, 0
    delivered, _ = await progress_for(session, reports)
    ordered = sum(sum(line.quantity for line in r.lines) for r in reports)
    return len(reports), sum(min(delivered.get(r.id, 0), sum(x.quantity for x in r.lines)) for r in reports), ordered


async def message(session: Any, op: ClanOperation, t: Translator) -> dict[str, Any]:
    stamp = int(start_of(op).timestamp())
    people = operation_plan.going(op)
    maybe = [p for p in operation_plan.people(op) if p["status"] == "maybe"]
    n, done, total = await _readiness(session, op)
    fields = [
        {"name": t.t("ops.when"), "value": f"<t:{stamp}:F> · <t:{stamp}:R>", "inline": False},
        {"name": t.t("ops.going", n=len(people)), "value": (", ".join(p.get("name") or "?" for p in people[:30]) or "—")[:1024], "inline": False},
    ]
    if maybe:
        fields.append({"name": t.t("ops.maybe_n", n=len(maybe)), "value": ", ".join(p["name"] for p in maybe[:30])[:1024], "inline": False})
    plan = operation_plan.plan_of(op)
    if plan.roles and "roles" not in plan.hidden:
        fill = [f"{r.name} {sum(1 for p in people if p['role'] == r.id)}/{r.slots}" if r.slots
                else f"{r.name} {sum(1 for p in people if p['role'] == r.id)}" for r in plan.roles]
        fields.append({"name": t.t("ops.brief.roles"), "value": " · ".join(fill)[:1024], "inline": False})
    if n:
        fields.append({"name": t.t("ops.orders", n=n), "value": f"{round(100 * done / total) if total else 0}% ({done}/{total})", "inline": True})
    return {
        "embeds": [{"title": f"⚑ {op.title}"[:256], "url": site_url(), "description": (op.note or "")[:2000],
                    "color": COLOR, "fields": fields, "footer": {"text": t.t("ops.author", name=op.author_name)}}],
        "components": [{"type": 1, "components": [
            {"type": 2, "style": 3, "label": t.t("ops.btn_go"), "emoji": {"name": "✅"}, "custom_id": f"op:go:{op.id}"},
            {"type": 2, "style": 1, "label": t.t("ops.btn_maybe"), "emoji": {"name": "❔"}, "custom_id": f"op:maybe:{op.id}"},
            {"type": 2, "style": 2, "label": t.t("ops.btn_no"), "custom_id": f"op:no:{op.id}"},
            {"type": 2, "style": 5, "label": t.t("ops.btn_open"), "url": site_url()},
        ]}],
        "allowed_mentions": {"parse": []},
    }


async def _load(session: Any, op_id: uuid.UUID) -> tuple[ClanOperation | None, ClanSettings | None, str | None]:
    with bypass_clan_filter():
        op = (await session.execute(select(ClanOperation).where(ClanOperation.id == op_id))).scalar_one_or_none()
        if op is None:
            return None, None, None
        guild = (await session.execute(select(Clan.discord_guild_id).where(Clan.id == op.clan_id))).scalar_one_or_none()
    set_current_clan_id(op.clan_id)
    bind_session_to_clan(session, op.clan_id)
    cs = (await session.execute(select(ClanSettings))).scalar_one_or_none()
    return op, cs, guild


async def sync(op_id: uuid.UUID) -> None:
    """Создать или обновить пост операции, её ветку и событие сервера (фон)."""
    if not discord_bot.enabled():
        return
    try:
        async with AsyncSessionLocal() as session:
            op, cs, guild = await _load(session, op_id)
            if op is None or not cs or not cs.discord_webhook_url:
                return
            t = Translator(locale=cs.discord_locale or settings.DEFAULT_LOCALE, default_domain="reports")
            payload = await message(session, op, t)
            if op.discord_message_id and op.discord_channel_id:
                r = await discord_bot._bot("PATCH", f"/channels/{op.discord_channel_id}/messages/{op.discord_message_id}", json=payload)
                if r is not None and r.status_code == 404:
                    op.discord_message_id = None
            if not op.discord_message_id:
                channel = await discord_bot.webhook_channel(cs.discord_webhook_url)
                r = await discord_bot._bot("POST", f"/channels/{channel}/messages", json=payload) if channel else None
                if r is not None and r.status_code < 400:
                    op.discord_channel_id, op.discord_message_id = channel, str(r.json()["id"])
                    th = await discord_bot._bot("POST", f"/channels/{channel}/messages/{op.discord_message_id}/threads",
                                                json={"name": op.title[:100], "auto_archive_duration": 4320})
                    if th is not None and th.status_code < 400:
                        op.discord_thread_id = str(th.json()["id"])
            start = start_of(op)
            if guild and start > datetime.now(UTC):
                event = {"name": op.title[:100], "description": (op.note or "")[:1000], "privacy_level": 2,
                         "entity_type": 3, "entity_metadata": {"location": "Foxhole"},
                         "scheduled_start_time": start.isoformat(), "scheduled_end_time": (start + timedelta(hours=EVENT_HOURS)).isoformat()}
                if op.discord_event_id:
                    r = await discord_bot._bot("PATCH", f"/guilds/{guild}/scheduled-events/{op.discord_event_id}", json=event)
                    if r is not None and r.status_code == 404:
                        op.discord_event_id = None
                if not op.discord_event_id:
                    r = await discord_bot._bot("POST", f"/guilds/{guild}/scheduled-events", json=event)
                    if r is not None and r.status_code < 400:
                        op.discord_event_id = str(r.json()["id"])
            await session.commit()
    except Exception:  # noqa: BLE001
        log.warning("operation %s discord sync failed", op_id, exc_info=True)


async def remove(clan_id: str, ids: dict[str, str | None]) -> None:
    """Операцию удалили — убрать пост и событие сервера (ветка уйдёт вместе с постом в архив)."""
    if not discord_bot.enabled():
        return
    if ids.get("channel") and ids.get("message"):
        await discord_bot._bot("DELETE", f"/channels/{ids['channel']}/messages/{ids['message']}")
    if ids.get("event"):
        async with AsyncSessionLocal() as session:
            with bypass_clan_filter():
                guild = (await session.execute(select(Clan.discord_guild_id).where(Clan.id == clan_id))).scalar_one_or_none()
        if guild:
            await discord_bot._bot("DELETE", f"/guilds/{guild}/scheduled-events/{ids['event']}")


async def remind(now: datetime | None = None) -> int:
    """За час до начала — пинг записавшихся в ветке операции (или в канале), один раз."""
    if not discord_bot.enabled():
        return 0
    now = now or datetime.now(UTC)
    sent = 0
    async with AsyncSessionLocal() as session:
        with bypass_clan_filter():
            ops = (await session.execute(select(ClanOperation).where(
                ClanOperation.reminded.is_(False), ClanOperation.discord_message_id.is_not(None),
                ClanOperation.date >= (now - timedelta(days=1)).date(), ClanOperation.date <= (now + timedelta(days=1)).date(),
            ))).scalars().all()
        due = [op for op in ops if now < start_of(op) <= now + REMIND_BEFORE]
    for op in due:
        async with AsyncSessionLocal() as session:
            op2, cs, _ = await _load(session, op.id)
            if op2 is None or op2.reminded:
                continue
            t = Translator(locale=(cs.discord_locale if cs else None) or settings.DEFAULT_LOCALE, default_domain="reports")
            ids = [p["user_id"] for p in op2.participants or [] if p.get("user_id")][:90]
            stamp = int(start_of(op2).timestamp())
            text = (" ".join(f"<@{u}>" for u in ids) + "\n" if ids else "") + t.t("ops.reminder", title=op2.title, stamp=stamp)
            target = op2.discord_thread_id or op2.discord_channel_id
            r = await discord_bot._bot("POST", f"/channels/{target}/messages",
                                       json={"content": text[:2000], "allowed_mentions": {"users": ids}})
            op2.reminded = True
            await session.commit()
            sent += 1 if r is not None and r.status_code < 400 else 0
    return sent


async def post_brief(session: Any, op: ClanOperation) -> bool:
    """Брифинг (без скрытого) — в ветку операции, а нет ветки — в канал клана. False — Discord не настроен."""
    if not discord_bot.enabled():
        return False
    cs = (await session.execute(select(ClanSettings))).scalar_one_or_none()
    if not cs or not cs.discord_webhook_url:
        return False
    channel = op.discord_thread_id or await discord_bot.webhook_channel(cs.discord_webhook_url)
    if not channel:
        return False
    t = Translator(locale=cs.discord_locale or settings.DEFAULT_LOCALE, default_domain="reports")
    text = operation_plan.brief_text(op, t, await operation_plan.supply(session, op), {})
    for part in operation_plan.chunks(text):
        r = await discord_bot._bot("POST", f"/channels/{channel}/messages", json={"content": part, "allowed_mentions": {"parse": []}})
        if r is None or r.status_code >= 400:
            return False
    return True
