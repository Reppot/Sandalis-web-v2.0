"""Бот SINDARIS в Discord: пост заказа с кнопками, обновление поста, слэш-команды.

Постоянного подключения к шлюзу Discord нет: бот пишет через REST (токен бота), а нажатия
кнопок и команды Discord присылает на /api/v1/discord/interactions с подписью Ed25519.
Вебхук клана при этом остаётся настройкой «куда постить»: бот берёт из него канал.
Сообщения вручную созданного вебхука не могут нести рабочих кнопок — поэтому пост от бота.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import UTC, datetime, time
from typing import Any

import httpx
from nacl.exceptions import BadSignatureError
from nacl.signing import VerifyKey
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.i18n import Translator
from app.core.tenancy import bind_session_to_clan, bypass_clan_filter, set_current_clan_id
from app.models.report import OrderReport, ReportContribution, ReportContributionLine, ReportStatus
from app.services import discord_oauth
from app.services.discord_webhook import truncate_lines

log = logging.getLogger(__name__)

CLOSED = {ReportStatus.DONE.value, ReportStatus.CANCELLED.value}


def enabled() -> bool:
    return bool(settings.DISCORD_BOT_TOKEN)


def verify(signature: str | None, timestamp: str | None, body: bytes) -> bool:
    """Подпись запроса Discord Interactions (Ed25519 над timestamp + тело)."""
    key = settings.DISCORD_PUBLIC_KEY
    if not (key and signature and timestamp):
        return False
    try:
        VerifyKey(bytes.fromhex(key)).verify(timestamp.encode() + body, bytes.fromhex(signature))
    except (BadSignatureError, ValueError):
        return False
    return True


async def _bot(method: str, path: str, **kwargs: Any) -> httpx.Response | None:
    if not enabled():
        return None
    url = f"{settings.DISCORD_API_BASE_URL.rstrip('/')}{path}"
    try:
        async with discord_oauth.get_http_client() as client:
            return await client.request(method, url, headers={"Authorization": f"Bot {settings.DISCORD_BOT_TOKEN}"}, **kwargs)
    except httpx.HTTPError:
        log.warning("discord bot %s %s failed", method, path, exc_info=True)
        return None


def site_url(report_id: uuid.UUID | str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/?tab=clan&view=reports&order={report_id}"


async def delivered_by_line(session: AsyncSession, report_id: uuid.UUID) -> dict[uuid.UUID, int]:
    rows = await session.execute(
        select(ReportContributionLine.line_id, func.sum(ReportContributionLine.quantity))
        .join(ReportContribution, ReportContribution.id == ReportContributionLine.contribution_id)
        .where(ReportContribution.report_id == report_id)
        .group_by(ReportContributionLine.line_id)
    )
    return {line_id: int(qty or 0) for line_id, qty in rows.all()}


def order_embed(report: OrderReport, t: Translator, delivered: dict[uuid.UUID, int]) -> dict[str, Any]:
    """Эмбед заказа: строки с выполнением, статус, исполнители, срок, склад, примечание."""
    from app.services.reports import STATUS_COLORS

    tr = lambda key, **kw: t.t(key, domain="reports", **kw)  # noqa: E731
    units = {"crate": tr("report.unit.crate"), "unit": tr("report.unit.unit")}
    lines = []
    for line in report.lines:
        got = min(delivered.get(line.id, 0), line.quantity)
        amount = f"{got}/{line.quantity}" if got else str(line.quantity)
        lines.append(f"{'✅' if got >= line.quantity else '•'} {line.name} — **{amount}** {units[line.unit]}")
    ordered = sum(line.quantity for line in report.lines)
    done = sum(min(delivered.get(line.id, 0), line.quantity) for line in report.lines)
    status = ReportStatus(report.status)
    fields = [
        {"name": tr("report.embed.status"), "value": tr(f"report.status.{status.value}"), "inline": True},
        {"name": tr("report.embed.progress"), "value": f"{round(done * 100 / ordered) if ordered else 0}% ({done}/{ordered})", "inline": True},
        {"name": tr("report.embed.author"), "value": report.created_by_name or report.created_by, "inline": True},
        {"name": tr("report.embed.assignees"),
         "value": ", ".join(f"<@{a['user_id']}>" for a in report.assignees or []) or tr("report.embed.nobody"), "inline": False},
    ]
    if report.due_date:
        stamp = int(datetime.combine(report.due_date, time(), tzinfo=UTC).timestamp())
        fields.append({"name": tr("report.embed.due"), "value": f"<t:{stamp}:D> (<t:{stamp}:R>)", "inline": True})
    meta = [report.meta.get(k) for k in ("region", "type", "stockpile") if report.meta.get(k)]
    if meta:
        fields.append({"name": tr("report.embed.place"), "value": " • ".join(meta), "inline": False})
    if report.note:
        fields.append({"name": tr("report.embed.note"), "value": report.note[:1024], "inline": False})
    return {
        "title": f"📋 {report.title}"[:256],
        "url": site_url(report.id),
        "description": truncate_lines(lines),
        "color": STATUS_COLORS[status],
        "fields": fields,
        "timestamp": report.created_at.isoformat(),
        "footer": {"text": "SINDARIS LOGISTICS OVERWATCH"},
    }


def order_components(report: OrderReport, t: Translator) -> list[dict[str, Any]]:
    closed = report.status in CLOSED
    tr = lambda key: t.t(key, domain="reports")  # noqa: E731
    return [{"type": 1, "components": [
        {"type": 2, "style": 1, "label": tr("report.discord.take"), "emoji": {"name": "🙋"},
         "custom_id": f"order:take:{report.id}", "disabled": closed},
        {"type": 2, "style": 3, "label": tr("report.discord.deliver"), "emoji": {"name": "🚚"},
         "custom_id": f"order:deliver:{report.id}", "disabled": closed},
        {"type": 2, "style": 5, "label": tr("report.discord.open"), "url": site_url(report.id)},
    ]}]


async def order_message(session: AsyncSession, report: OrderReport, t: Translator) -> dict[str, Any]:
    return {
        "embeds": [order_embed(report, t, await delivered_by_line(session, report.id))],
        "components": order_components(report, t),
        # исполнители в эмбеде — упоминания без пинга
        "allowed_mentions": {"parse": []},
    }


async def webhook_channel(webhook_url: str) -> str | None:
    """Канал, в который смотрит вебхук клана (GET вебхука по токену — без авторизации)."""
    try:
        async with discord_oauth.get_http_client() as client:
            r = await client.get(webhook_url)
    except httpx.HTTPError:
        return None
    if r.status_code != 200:
        return None
    channel = r.json().get("channel_id")
    return str(channel) if channel else None


async def post_order(session: AsyncSession, report: OrderReport, t: Translator, webhook_url: str,
                     image: tuple[str, bytes] | None = None) -> bool:
    """Пост заказа ботом в канал вебхука. False — бот не настроен или нет доступа к каналу
    (тогда вызывающий шлёт старым способом, через вебхук)."""
    if not enabled():
        return False
    channel = await webhook_channel(webhook_url)
    if not channel:
        return False
    payload = await order_message(session, report, t)
    if image:
        # картинка — отдельным вложением, не в эмбеде: правки эмбеда её не трогают
        filename, data = image
        r = await _bot("POST", f"/channels/{channel}/messages",
                       data={"payload_json": json.dumps(payload, ensure_ascii=False)},
                       files={"files[0]": (filename, data, "image/png")})
    else:
        r = await _bot("POST", f"/channels/{channel}/messages", json=payload)
    if r is None or r.status_code >= 400:
        log.warning("discord bot could not post to channel %s: %s", channel, r.status_code if r else "error")
        return False
    report.discord_channel_id = channel
    report.discord_message_id = str(r.json()["id"])
    report.discord_locale = t.locale
    return True


async def refresh_post(report_id: uuid.UUID) -> None:
    """Обновить пост заказа в Discord (прогресс, исполнители, статус). Своя сессия —
    вызывается фоном после ответа; сбои Discord не мешают сайту."""
    if not enabled():
        return
    from app.core.db import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            with bypass_clan_filter():
                report = (await session.execute(select(OrderReport).where(OrderReport.id == report_id))).scalar_one_or_none()
            if report is None or not report.discord_message_id:
                return
            set_current_clan_id(report.clan_id)
            bind_session_to_clan(session, report.clan_id)
            t = Translator(locale=report.discord_locale or settings.DEFAULT_LOCALE, default_domain="reports")
            payload = await order_message(session, report, t)
            r = await _bot("PATCH", f"/channels/{report.discord_channel_id}/messages/{report.discord_message_id}", json=payload)
            if r is not None and r.status_code == 404:
                # пост удалили в Discord — больше не обновляем
                report.discord_message_id = None
                await session.commit()
    except Exception:  # noqa: BLE001 — фоновая задача: только в лог
        log.warning("discord post refresh failed for %s", report_id, exc_info=True)


# ───────────────────────── слэш-команды ─────────────────────────

COMMANDS: list[dict[str, Any]] = [{
    "name": "my-tasks",
    "type": 1,
    "description": "Your active clan orders",
    "name_localizations": {
        "ru": "мои-задачи", "uk": "мої-завдання", "de": "meine-aufgaben", "pl": "moje-zadania", "fr": "mes-tâches",
        "es-ES": "mis-tareas", "pt-BR": "minhas-tarefas", "cs": "moje-úkoly", "zh-CN": "我的任务",
    },
    "description_localizations": {
        "ru": "Ваши активные заказы клана", "uk": "Ваші активні замовлення клану", "de": "Deine aktiven Clan-Aufträge",
        "pl": "Twoje aktywne zamówienia klanu", "fr": "Vos commandes actives du clan", "es-ES": "Tus pedidos activos del clan",
        "pt-BR": "Seus pedidos ativos do clã", "cs": "Vaše aktivní objednávky klanu", "zh-CN": "你在战团中的进行中订单",
    },
    "contexts": [0],
    "integration_types": [0],
}]


async def register_commands() -> None:
    """Глобальные слэш-команды приложения (PUT заменяет набор целиком — идемпотентно)."""
    if not (enabled() and settings.DISCORD_CLIENT_ID):
        return
    r = await _bot("PUT", f"/applications/{settings.DISCORD_CLIENT_ID}/commands", json=COMMANDS)
    if r is None or r.status_code >= 400:
        log.warning("discord command registration failed: %s", r.text if r is not None else "error")
