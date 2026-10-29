"""Почта сайта → вне сайта: личные сообщения Discord (по согласию) и Web Push в браузер.

Минутный проход (timer_alerts.watch): новые письма без delivered_at рассылаются тем, кто
включил ЛС или подписал браузер, и помечаются разосланными. Тексты — на языке получателя.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.i18n import Translator, normalize_locale
from app.core.tenancy import bypass_clan_filter
from app.models.mail import ClanMail
from app.models.push import PushSubscription
from app.models.rbac import User
from app.services import discord_bot

log = logging.getLogger(__name__)

MAX_AGE = timedelta(days=2)       # письма старше — уже не актуальны для уведомления
SECTION = {
    "operation_mention": "?tab=clan&view=operations", "task_assigned": "?tab=clan&view=reports", "task_due": "?tab=clan&view=reports",
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

    try:
        webpush(subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload, vapid_private_key=settings.VAPID_PRIVATE_KEY, vapid_claims={"sub": settings.VAPID_SUBJECT}, ttl=3600)
        return 201
    except WebPushException as exc:
        return exc.response.status_code if exc.response is not None else None


async def dispatch(now: datetime | None = None) -> int:
    """Разослать новые письма. Возвращает число отправленных уведомлений (ЛС + push)."""
    now = now or datetime.now(UTC)
    sent = 0
    async with AsyncSessionLocal() as session:
        with bypass_clan_filter():
            mails = (await session.execute(
                select(ClanMail).where(ClanMail.delivered_at.is_(None)).order_by(ClanMail.created_at).limit(200)
            )).scalars().all()
            if not mails:
                return 0
            ids = {m.recipient_id for m in mails}
            users = {u.id: u for u in (await session.execute(select(User).where(User.id.in_(ids)))).scalars().all()}
            subs: dict[str, list[PushSubscription]] = defaultdict(list)
            if push_enabled():
                for sub in (await session.execute(select(PushSubscription).where(PushSubscription.user_id.in_(ids)))).scalars().all():
                    subs[sub.user_id].append(sub)
            gone: list[str] = []
            for mail in mails:
                mail.delivered_at = now
                created = mail.created_at if mail.created_at.tzinfo else mail.created_at.replace(tzinfo=UTC)
                user = users.get(mail.recipient_id)
                if user is None or now - created > MAX_AGE:
                    continue
                t = Translator(locale=normalize_locale(user.preferred_locale) or settings.DEFAULT_LOCALE, default_domain="reports")
                text, url = render(mail, t)
                if user.notify_dm and discord_bot.enabled() and await _dm(user.id, text, url):
                    sent += 1
                for sub in subs.get(user.id, []):
                    status = await asyncio.to_thread(_push_one, sub, json.dumps({"title": "SINDARIS", "body": text, "url": url}))
                    if status in (404, 410):
                        gone.append(sub.endpoint)      # подписка браузера больше не действует
                    elif status and status < 400:
                        sent += 1
            if gone:
                await session.execute(delete(PushSubscription).where(PushSubscription.endpoint.in_(gone)))
            await session.commit()
    return sent
