"""Почта сайта → вне сайта: личные сообщения Discord (по согласию) и Web Push в браузер.

Минутный проход (timer_alerts.watch): новые письма без delivered_at рассылаются тем, кто
включил ЛС или подписал браузер, и помечаются разосланными. Тексты — на языке получателя.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.i18n import Translator, normalize_locale
from app.core.push_endpoint import is_allowed_push_endpoint
from app.core.tenancy import bypass_clan_filter
from app.models.mail import ClanMail
from app.models.push import PushSubscription
from app.models.rbac import User
from app.services import discord_bot

log = logging.getLogger(__name__)

MAX_AGE = timedelta(days=2)       # письма старше — уже не актуальны для уведомления
SECTION = {
    "operation_mention": "?tab=clan&view=operations", "operation_rsvp": "?tab=clan&view=operations", "task_assigned": "?tab=clan&view=reports", "task_due": "?tab=clan&view=reports",
    "order_delivered": "?tab=clan&view=reports", "order_comment": "?tab=clan&view=reports", "timer_warn": "?tab=clan&view=stockpiles",
    "timer_expired": "?tab=clan&view=stockpiles", "game_award": "?tab=clan&view=stats", "feedback_reply": "?tab=feedback",
}


def push_enabled() -> bool:
    return bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)


def render(mail: ClanMail, t: Translator) -> tuple[str, str]:
    """(текст, ссылка) уведомления о письме."""
    p = mail.payload or {}
    text = t.t(f"notify.{mail.kind}", domain="reports", sender=mail.sender_name, title=p.get("title") or "",
               operation=p.get("operation") or "", date=p.get("due_date") or p.get("date") or "")
    if text == f"notify.{mail.kind}":
        text = t.t("notify.generic", domain="reports")
    url = f"{settings.FRONTEND_URL.rstrip('/')}/{SECTION.get(mail.kind, '?tab=mail')}"
    return text, url


async def _dm(user_id: str, text: str, url: str) -> bool:
    r = await discord_bot._bot("POST", "/users/@me/channels", json={"recipient_id": user_id})
    if r is None or r.status_code >= 400:
        return False
    channel = r.json().get("id")
    m = await discord_bot._bot("POST", f"/channels/{channel}/messages", json={
        "content": f"{text}\n{url}"[:2000], "allowed_mentions": {"parse": []}})
    return m is not None and m.status_code < 400


def _push_one(sub: PushSubscription, payload: str) -> int | None:
    from pywebpush import WebPushException, webpush

    if not is_allowed_push_endpoint(sub.endpoint):
        return 410
    try:
        webpush(subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload, vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_SUBJECT}, ttl=3600, timeout=5)
        return 201
    except WebPushException as exc:
        return exc.response.status_code if exc.response is not None else None


async def dispatch(now: datetime | None = None) -> int:
    """Разослать новые письма. Возвращает число отправленных уведомлений (ЛС + push)."""
    now = now or datetime.now(UTC)
    sent = 0
    async with AsyncSessionLocal() as session:
        with bypass_clan_filter():
            ids = (await session.execute(
                select(ClanMail.id).where(ClanMail.delivered_at.is_(None))
                .order_by(ClanMail.created_at).limit(200)
            )).scalars().all()
            for mail_id in ids:
                mail = (await session.execute(
                    select(ClanMail).where(ClanMail.id == mail_id, ClanMail.delivered_at.is_(None))
                    .with_for_update(skip_locked=True)
                )).scalar_one_or_none()
                if mail is None:
                    continue
                created = mail.created_at if mail.created_at.tzinfo else mail.created_at.replace(tzinfo=UTC)
                user = await session.get(User, mail.recipient_id)
                if user is None or now - created > MAX_AGE:
                    mail.delivered_at = now
                    await session.commit()
                    continue

                t = Translator(locale=normalize_locale(user.preferred_locale) or settings.DEFAULT_LOCALE, default_domain="reports")
                text, url = render(mail, t)
                state = dict(mail.dispatch_state or {})
                dm_done = not (user.notify_dm and discord_bot.enabled()) or bool(state.get("dm"))
                if not dm_done and await _dm(user.id, text, url):
                    dm_done = True
                    sent += 1

                subscriptions: list[PushSubscription] = []
                if push_enabled():
                    subscriptions = list((await session.execute(
                        select(PushSubscription).where(PushSubscription.user_id == user.id)
                        .order_by(PushSubscription.created_at).limit(20)
                    )).scalars().all())
                push_done = {str(value) for value in state.get("push", []) if isinstance(value, str)}
                for sub in subscriptions:
                    subscription_id = str(sub.id)
                    if subscription_id in push_done:
                        continue
                    status = await asyncio.to_thread(
                        _push_one, sub, json.dumps({"title": "SINDARIS", "body": text, "url": url})
                    )
                    if status in (404, 410):
                        push_done.add(subscription_id)
                        await session.execute(delete(PushSubscription).where(PushSubscription.id == sub.id))
                    elif status is not None and status < 400:
                        push_done.add(subscription_id)
                        sent += 1

                mail.dispatch_state = {"dm": dm_done, "push": sorted(push_done)}
                push_done_all = not push_enabled() or all(str(sub.id) in push_done for sub in subscriptions)
                if dm_done and push_done_all:
                    mail.delivered_at = now
                await session.commit()
    return sent
