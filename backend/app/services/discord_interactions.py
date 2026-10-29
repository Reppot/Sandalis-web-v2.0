"""Нажатия кнопок на постах заказов и слэш-команды бота (Discord Interactions).

Кто нажал — участник Discord; на сайте это тот же пользователь (ID Discord), а права —
из его членства в клане заказа, как при входе на сайт. Кто ещё не входил на сайт,
получает ссылку на вход. Ответы — только нажавшему (ephemeral).

custom_id:
    order:take:<report>             — «Взять себе» (повторно — отказаться)
    order:deliver:<report>          — «Привёз»: выбор строки, если их несколько
    order:line:<report>             — выбранная строка → форма количества
    order:qty:<report>:<line>       — форма: количество и склад
    timer:reset:<timer>             — «Обновил резерв» под напоминанием о складе
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import AppError
from app.core.i18n import Translator, normalize_locale
from app.core.permissions import ClanRole, Scopes, scopes_for
from app.core.security import Principal
from app.core.tenancy import bind_session_to_clan, bypass_clan_filter, set_current_clan_id
from app.models.operation import ClanOperation
from app.models.rbac import Clan, ClanMembership
from app.models.report import OrderReport, ReportStatus
from app.models.timer import Timer
from app.schemas.report import ContributionCreate, ContributionLineIn
from app.domain.timers.calculations import DEFAULT_DURATION_SECONDS
from app.schemas.timer import TimerKind, TimerUpdate
from app.services import blacklist, discord_bot, report_tasks, timer_alerts
from app.services.report_progress import ReportProgressService
from app.services.timers import TimerService

PING, COMMAND, COMPONENT, MODAL_SUBMIT = 1, 2, 3, 5
EPHEMERAL = 64
MAX_TASKS = 15


def reply(text: str) -> dict[str, Any]:
    return {"type": 4, "data": {"content": text[:2000], "flags": EPHEMERAL, "allowed_mentions": {"parse": []}}}


def _who(it: dict[str, Any]) -> tuple[str, str]:
    member = it.get("member") or {}
    user = member.get("user") or it.get("user") or {}
    return str(user.get("id", "")), member.get("nick") or user.get("global_name") or user.get("username") or str(user.get("id", ""))


def _bind(session: AsyncSession, clan_id: str) -> None:
    set_current_clan_id(clan_id)
    bind_session_to_clan(session, clan_id)


async def _principal(session: AsyncSession, clan_id: str, user_id: str, name: str) -> Principal | None:
    m = (await session.execute(
        select(ClanMembership).where(ClanMembership.user_id == user_id, ClanMembership.is_active.is_(True))
    )).scalar_one_or_none()
    if m is None or (m.role != ClanRole.OWNER and user_id in await blacklist.blocked_users(session, clan_id)):
        return None
    return Principal(user_id=user_id, clan_id=clan_id, role=m.role, display_name=name,
                     scopes=scopes_for(m.role, m.extra_scopes, m.revoked_scopes))


async def handle(session: AsyncSession, it: dict[str, Any], background: BackgroundTasks) -> dict[str, Any]:
    kind = it.get("type")
    if kind == PING:
        return {"type": 1}
    t = Translator(locale=normalize_locale(it.get("locale")) or settings.DEFAULT_LOCALE, default_domain="reports")
    user_id, name = _who(it)
    data = it.get("data") or {}
    try:
        if kind == COMMAND and data.get("name") == "my-tasks":
            return await my_tasks(session, it.get("guild_id"), user_id, t)
        if kind == COMMAND and data.get("name") in ("profile", "top"):
            return await game_command(session, data["name"], it.get("guild_id"), user_id, t)
        if kind == COMPONENT and str(data.get("custom_id", "")).startswith("timer:"):
            return await timer_action(session, data, user_id, name, it.get("locale"))
        if kind == COMPONENT and str(data.get("custom_id", "")).startswith("op:"):
            return await operation_action(session, data, user_id, name, t, background)
        if kind in (COMPONENT, MODAL_SUBMIT):
            return await order_action(session, data, user_id, name, t, background)
    except AppError as err:
        return reply(t.t(err.message_key, domain=err.domain, **err.params))
    return reply(t.t("report.discord.unknown"))


# ───────────────────────── кнопки заказа ─────────────────────────

async def order_action(session: AsyncSession, data: dict[str, Any], user_id: str, name: str, t: Translator,
                       background: BackgroundTasks) -> dict[str, Any]:
    parts = str(data.get("custom_id", "")).split(":")
    if len(parts) < 3 or parts[0] != "order":
        return reply(t.t("report.discord.unknown"))
    action = parts[1]
    try:
        report_id = uuid.UUID(parts[2])
    except ValueError:
        return reply(t.t("report.discord.unknown"))
    # клан — по заказу: пост бота однозначно указывает на него
    with bypass_clan_filter():
        report = (await session.execute(select(OrderReport).where(OrderReport.id == report_id))).scalar_one_or_none()
    if report is None:
        return reply(t.t("report.not_found"))
    _bind(session, report.clan_id)
    principal = await _principal(session, report.clan_id, user_id, name)
    if principal is None:
        return reply(t.t("report.discord.not_member", url=discord_bot.site_url(report.id)))

    if action == "take":
        if not principal.can(Scopes.REPORTS_TAKE):
            return reply(t.t("report.discord.forbidden"))
        if report.status in discord_bot.CLOSED:
            return reply(t.t("report.discord.closed"))
        mine = any(a.get("user_id") == user_id for a in report.assignees or [])
        report_tasks.take(session, report, user_id, name, take=not mine)
        await session.commit()
        background.add_task(discord_bot.refresh_post, report.id)
        return reply(t.t("report.discord.dropped" if mine else "report.discord.taken", title=report.title))

    if not principal.can(Scopes.REPORTS_PROGRESS):
        return reply(t.t("report.discord.forbidden"))
    if report.status == ReportStatus.CANCELLED.value:
        return reply(t.t("report.progress_cancelled"))
    delivered = await discord_bot.delivered_by_line(session, report.id)
    names = await discord_bot.catalog_names(session, report)
    label = lambda line: discord_bot.local_name(line, names, t.locale)  # noqa: E731

    if action == "deliver":
        if len(report.lines) == 1:
            return _qty_modal(report, report.lines[0], label(report.lines[0]), delivered, t)
        return {"type": 4, "data": {"flags": EPHEMERAL, "content": t.t("report.discord.pick_line", title=report.title)[:2000],
                "components": [{"type": 1, "components": [{
                    "type": 3, "custom_id": f"order:line:{report.id}", "placeholder": t.t("report.discord.pick_placeholder")[:150],
                    "options": [{"label": label(line)[:100], "value": str(line.id),
                                 "description": f"{min(delivered.get(line.id, 0), line.quantity)}/{line.quantity} {_unit(t, line.unit)}"[:100]}
                                for line in report.lines[:25]],
                }]}]}}

    if action == "line":
        values = data.get("values") or []
        line = next((x for x in report.lines if values and str(x.id) == values[0]), None)
        if line is None:
            return reply(t.t("report.progress_bad_line"))
        return _qty_modal(report, line, label(line), delivered, t)

    if action == "qty" and len(parts) == 4:
        fields = {c["custom_id"]: (c.get("value") or "").strip()
                  for row in data.get("components") or [] for c in row.get("components") or []}
        try:
            qty = int(fields.get("qty", ""))
        except ValueError:
            qty = 0
        if not 0 < qty <= 100_000:
            return reply(t.t("report.discord.bad_qty"))
        payload = ContributionCreate(lines=[ContributionLineIn(line_id=uuid.UUID(parts[3]), quantity=qty)],
                                     stockpile_label=fields.get("place")[:160] if fields.get("place") else None)
        service = ReportProgressService(session, principal, t)
        result = await service.contribute(report.id, payload)
        await report_tasks.after_contribution(session, report.id, payload, result, report.clan_id, user_id, name)
        background.add_task(discord_bot.refresh_post, report.id)
        return reply(f"✅ {result.message or ''} — {report.title}")

    return reply(t.t("report.discord.unknown"))


def _unit(t: Translator, unit: str) -> str:
    return t.t(f"report.unit.{unit}")


def _qty_modal(report: OrderReport, line: Any, name: str, delivered: dict[uuid.UUID, int], t: Translator) -> dict[str, Any]:
    left = max(line.quantity - delivered.get(line.id, 0), 0)
    return {"type": 9, "data": {
        "custom_id": f"order:qty:{report.id}:{line.id}",
        "title": t.t("report.discord.modal_title")[:45],
        "components": [
            {"type": 1, "components": [{
                "type": 4, "custom_id": "qty", "style": 1, "required": True, "min_length": 1, "max_length": 6,
                "label": f"{name} ({_unit(t, line.unit)})"[:45],
                "placeholder": t.t("report.discord.left", n=left)[:100],
                **({"value": str(left)} if left else {}),
            }]},
            {"type": 1, "components": [{
                "type": 4, "custom_id": "place", "style": 1, "required": False, "max_length": 160,
                "label": t.t("report.discord.place")[:45],
                **({"value": str(report.meta.get("stockpile"))[:160]} if report.meta.get("stockpile") else {}),
            }]},
        ],
    }}


# ───────────────────────── явка на операцию ─────────────────────────

async def operation_action(session: AsyncSession, data: dict[str, Any], user_id: str, name: str, t: Translator,
                           background: BackgroundTasks) -> dict[str, Any]:
    from app.models.operation import ClanOperation
    from app.services import discord_ops

    parts = str(data.get("custom_id", "")).split(":")
    try:
        op_id = uuid.UUID(parts[2]) if len(parts) == 3 and parts[1] in ("go", "no") else None
    except ValueError:
        op_id = None
    if op_id is None:
        return reply(t.t("report.discord.unknown"))
    with bypass_clan_filter():
        op = (await session.execute(select(ClanOperation).where(ClanOperation.id == op_id))).scalar_one_or_none()
    if op is None:
        return reply(t.t("report.discord.unknown"))
    _bind(session, op.clan_id)
    principal = await _principal(session, op.clan_id, user_id, name)
    if principal is None:
        return reply(t.t("report.discord.not_member", url=discord_ops.site_url()))
    if not principal.can(Scopes.OPERATIONS_ATTEND):
        return reply(t.t("report.discord.forbidden"))
    going = parts[1] == "go"
    people = [p for p in (op.participants or []) if p.get("user_id") != user_id]
    if going:
        people.append({"user_id": user_id, "name": name[:120], "at": datetime.now(UTC).isoformat()})
    op.participants = people
    await session.commit()
    background.add_task(discord_ops.sync, op.id)
    return reply(t.t("ops.joined" if going else "ops.left", title=op.title))


# ───────────────────────── «Обновил резерв» ─────────────────────────

async def timer_action(session: AsyncSession, data: dict[str, Any], user_id: str, name: str, locale: str | None) -> dict[str, Any]:
    t = Translator(locale=normalize_locale(locale) or settings.DEFAULT_LOCALE, default_domain="timers")
    parts = str(data.get("custom_id", "")).split(":")
    try:
        timer_id = uuid.UUID(parts[2]) if len(parts) == 3 and parts[1] == "reset" else None
    except ValueError:
        timer_id = None
    if timer_id is None:
        return reply(t.t("report.discord.unknown", domain="reports"))
    with bypass_clan_filter():
        timer = (await session.execute(select(Timer).where(Timer.id == timer_id))).scalar_one_or_none()
    if timer is None:
        return reply(t.t("timer.not_found"))
    _bind(session, timer.clan_id)
    principal = await _principal(session, timer.clan_id, user_id, name)
    if principal is None:
        return reply(t.t("report.discord.not_member", domain="reports", url=timer_alerts.stockpiles_url()))
    if not principal.can(Scopes.TIMERS_UPDATE):
        return reply(t.t("report.discord.forbidden", domain="reports"))
    # резерв в игре обновляется на 48 ч — как «Сбросить на 48 ч» на сайте; прочие таймеры — на свою длительность
    duration = DEFAULT_DURATION_SECONDS if timer.kind == TimerKind.STOCKPILE_DECAY.value else None
    timer, _ = await TimerService(session, principal, t).update_timer(timer.id, TimerUpdate(restart=True, duration_seconds=duration))
    # кнопка — на самом напоминании: заменяем его отметкой «обновлено» (без пинга и кнопок)
    channel_t = Translator(locale=t.locale, default_domain="timers")
    return {"type": 7, "data": timer_alerts.reset_message(timer, name, channel_t)}


# ───────────────────────── /profile и /top ─────────────────────────

async def game_command(session: AsyncSession, name: str, guild_id: str | None, user_id: str, t: Translator) -> dict[str, Any]:
    from app.services import gamification as game
    from app.services.game_notify import ROMAN, ach_name, season_start

    clan = (await session.execute(select(Clan).where(Clan.discord_guild_id == guild_id))).scalar_one_or_none() if guild_id else None
    if clan is None:
        return reply(t.t("report.discord.no_clan"))
    _bind(session, clan.id)
    items, names = await game.credits(session, clan.id)
    try:
        # ответ Discord ждёт 3 с: холодный War API не должен его сорвать — без сезона, если долго
        since = await asyncio.wait_for(season_start(), 1.5)
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001
        since = None
    badges = game.badges(items, since)
    url = f"{settings.FRONTEND_URL.rstrip('/')}/?tab=clan&view=stats"

    def league(uid: str) -> str:
        b = badges.get(uid)
        if not b:
            return t.t("game.tier.iron") + " IV"
        tier = t.t(f"game.tier.{b['tier']}") + (f" {ROMAN[b['division']]}" if b.get("division") else "")
        title = b.get("title")
        return f"{t.t('game.title.' + title)} · {tier}" if title else tier

    if name == "top":
        agg = game.totals(items, datetime.now(UTC) - timedelta(days=7))
        ranked = sorted(((u, a["points"]) for u, a in agg.items() if a["points"] > 0), key=lambda x: -x[1])[:10]
        lines = [f"**{i + 1}.** {names.get(u, u)} — {round(p)} · {league(u)}" for i, (u, p) in enumerate(ranked)]
        embed = {"title": t.t("game.top_title", clan=clan.name)[:256], "url": url, "color": 0xA3E635,
                 "description": "\n".join(lines) or t.t("game.digest_quiet")}
        # рейтинг — для всех в канале (не ephemeral)
        return {"type": 4, "data": {"embeds": [embed], "allowed_mentions": {"parse": []}}}

    life = game.totals(items, None).get(user_id, {})
    lg = game.league(life.get("points", 0))
    st = game.streak(items, user_id)
    earned = [a for a in game.achievements(items, user_id) if a["level"]]
    fields = [
        {"name": t.t("game.f_league"), "value": league(user_id), "inline": True},
        {"name": t.t("game.f_points"), "value": str(lg["points"]) + (f" (→ {lg['next_at']})" if lg["next_at"] else ""), "inline": True},
        {"name": t.t("game.f_streak"), "value": t.t("game.streak_days", n=st["current"], best=st["best"]), "inline": True},
    ]
    if earned:
        fields.append({"name": t.t("game.f_achievements", n=len(earned)), "inline": False,
                       "value": ", ".join(ach_name(a["key"], a["level"], t) for a in earned)[:1024]})
    embed = {"title": names.get(user_id, user_id)[:256], "url": url, "color": 0xA3E635, "fields": fields}
    return {"type": 4, "data": {"embeds": [embed], "flags": EPHEMERAL, "allowed_mentions": {"parse": []}}}


# ───────────────────────── /мои-задачи ─────────────────────────

async def my_tasks(session: AsyncSession, guild_id: str | None, user_id: str, t: Translator) -> dict[str, Any]:
    clan = (await session.execute(select(Clan).where(Clan.discord_guild_id == guild_id))).scalar_one_or_none() if guild_id else None
    if clan is None:
        return reply(t.t("report.discord.no_clan"))
    _bind(session, clan.id)
    rows = (await session.execute(
        select(OrderReport)
        .where(OrderReport.status.in_([ReportStatus.OPEN.value, ReportStatus.IN_PROGRESS.value]),
               OrderReport.assignees.contains([{"user_id": user_id}]))
        .order_by(OrderReport.due_date.asc().nulls_last(), OrderReport.created_at.desc())
    )).scalars().all()
    if not rows:
        return reply(t.t("report.discord.my_tasks_empty"))
    delivered, _ = await report_tasks.progress_for(session, rows)
    ops = {o.id: o for o in (await session.execute(select(ClanOperation))).scalars().all()}
    today = date.today()
    lines = []
    for r in rows[:MAX_TASKS]:
        total = sum(line.quantity for line in r.lines)
        pct = round(min(delivered.get(r.id, 0), total) * 100 / total) if total else 0
        bits = [f"{'🔥 ' if r.priority == 'high' else ''}[{r.title}]({discord_bot.site_url(r.id)}) — **{pct}%**"]
        if r.due_date:
            late = "⚠️ " if r.due_date < today else ""
            bits.append(f"{late}{t.t('report.embed.due')}: {r.due_date.strftime('%d.%m')}")
        if r.operation_id and r.operation_id in ops:
            bits.append(f"⚑ {ops[r.operation_id].title}")
        lines.append(" · ".join(bits))
    if len(rows) > MAX_TASKS:
        lines.append(f"… +{len(rows) - MAX_TASKS}")
    embed = {"title": t.t("report.discord.my_tasks_title", clan=clan.name)[:256], "description": "\n".join(lines)[:4096], "color": 0xA3E635}
    return {"type": 4, "data": {"flags": EPHEMERAL, "embeds": [embed], "allowed_mentions": {"parse": []}}}
