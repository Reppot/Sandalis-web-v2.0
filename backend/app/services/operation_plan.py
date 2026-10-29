"""Детальный план операции: ответы на опрос (иду / возможно / не иду) с ролью и отрядом,
слоты ролей, снабжение по заказам и текст брифинга для Discord.

Брифинг собирается из того, что командир не скрыл: скрытые разделы (plan.hidden) и этапы /
точки с brief=false в него не попадают.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select

from app.core.errors import AppError
from app.core.i18n import Translator
from app.models.operation import ClanOperation
from app.schemas.operation import Plan

POINT_ICON = {"target": "🎯", "rally": "🚩", "supply": "📦", "retreat": "↩️", "other": "📍"}
OUTCOME_ICON = {"success": "✅", "partial": "➖", "fail": "❌"}


def plan_of(op: ClanOperation) -> Plan:
    try:
        return Plan.model_validate(op.plan or {})
    except ValueError:
        return Plan()


POINT_KINDS = frozenset(POINT_ICON)


def sync_points(op: ClanOperation, brief: dict[str, bool] | None = None) -> None:
    """Точки плана — из меток «Точка» на снимках карты. Флажок «в брифинге» сохраняется
    (или берётся из brief — правка командира); точки, которых на снимках нет, уходят."""
    plan = op.plan or {}
    keep = {p.get("id"): bool(p.get("brief", True)) for p in plan.get("points") or [] if isinstance(p, dict)}
    keep.update(brief or {})
    points: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, snap in enumerate(op.snapshots or []):
        for shape in snap.get("shapes") or []:
            if not isinstance(shape, dict) or shape.get("kind") != "point":
                continue
            pid = str(shape.get("id") or "")[:24]
            if not pid or pid in seen or len(points) >= 30:
                continue
            seen.add(pid)
            kind = shape.get("point") if shape.get("point") in POINT_KINDS else "other"
            points.append({"id": pid, "kind": kind, "label": str(shape.get("label") or "")[:80],
                           "note": str(shape.get("note") or "")[:300], "brief": keep.get(pid, True), "snapshot": i})
    op.plan = {**plan, "points": points}


def people(op: ClanOperation) -> list[dict[str, Any]]:
    """Участники с полями по умолчанию (старые записи — «иду»)."""
    return [{"status": "go", "role": None, "squad": None, "attended": None, **p} for p in op.participants or []]


def going(op: ClanOperation) -> list[dict[str, Any]]:
    return [p for p in people(op) if p["status"] == "go"]


def clean_refs(op: ClanOperation, plan: Plan) -> None:
    """После правки плана: роли и отряды, которых больше нет, снимаются с участников."""
    roles, squads = {r.id for r in plan.roles}, {s.id for s in plan.squads}
    op.participants = [{**p, "role": p["role"] if p["role"] in roles else None,
                        "squad": p["squad"] if p["squad"] in squads else None} for p in people(op)]


def _check_role(op: ClanOperation, plan: Plan, user_id: str, role: str | None) -> None:
    if role is None:
        return
    spec = next((r for r in plan.roles if r.id == role), None)
    if spec is None:
        raise AppError(message_key="errors.operation_role_unknown", code="validation_error", status_code=422, params={})
    taken = sum(1 for p in going(op) if p["role"] == role and p["user_id"] != user_id)
    if spec.slots and taken >= spec.slots:
        raise AppError(message_key="errors.operation_role_full", code="validation_error", status_code=422,
                       params={"role": spec.name})


def answer(op: ClanOperation, user_id: str, name: str, status: str | None, role: str | None = None,
           keep_role: bool = False) -> None:
    """Ответ участника на опрос; status None — снять ответ. keep_role — не трогать выбранную роль (кнопки Discord)."""
    plan = plan_of(op)
    current = next((p for p in people(op) if p["user_id"] == user_id), None)
    if keep_role and current:
        role = current["role"]
    if status == "go":
        _check_role(op, plan, user_id, role)
    rest = [p for p in people(op) if p["user_id"] != user_id]
    if status is not None:
        rest.append({
            "user_id": user_id, "name": name[:120],
            "at": current["at"] if current and current["status"] == status else datetime.now(UTC).isoformat(),
            "status": status, "role": role if status != "no" else None,
            "squad": current["squad"] if current else None, "attended": current["attended"] if current else None,
        })
    op.participants = rest


def assign(op: ClanOperation, user_id: str, fields: dict[str, Any]) -> bool:
    """Командир меняет роль / отряд / явку участника. False — такого участника нет."""
    plan = plan_of(op)
    if "role" in fields:
        _check_role(op, plan, user_id, fields["role"])
    if "squad" in fields and fields["squad"] is not None and fields["squad"] not in {s.id for s in plan.squads}:
        raise AppError(message_key="errors.operation_squad_unknown", code="validation_error", status_code=422, params={})
    found = False
    out = []
    for p in people(op):
        if p["user_id"] == user_id:
            found = True
            p = {**p, **{k: v for k, v in fields.items() if k in ("role", "squad", "attended")}}
        out.append(p)
    op.participants = out
    return found


async def supply(session: Any, op: ClanOperation) -> list[dict[str, Any]]:
    """Заказы к операции (метки на снимках и заказы с выбранной операцией): привезено / заказано ящиков."""
    from app.models.report import OrderReport
    from app.services.report_tasks import progress_for

    ids = set(op.report_ids or [])
    reports = [r for r in (await session.execute(select(OrderReport))).scalars().all()
               if str(r.id) in ids or r.operation_id == op.id]
    if not reports:
        return []
    from app.services.discord_bot import delivered_by_line

    delivered, _ = await progress_for(session, reports)
    out = []
    for r in reports:
        ordered = sum(line.quantity for line in r.lines)
        per_line = await delivered_by_line(session, r.id)
        lines = [{"name": ln.name, "item_code": ln.item_code, "unit": ln.unit, "quantity": ln.quantity,
                  "delivered": min(per_line.get(ln.id, 0), ln.quantity)} for ln in sorted(r.lines, key=lambda x: x.position)]
        out.append({"report_id": str(r.id), "title": r.title, "status": r.status,
                    "delivered": min(delivered.get(r.id, 0), ordered), "ordered": ordered, "lines": lines})
    return out


def brief_text(op: ClanOperation, t: Translator, rows: list[dict[str, Any]], names: dict[str, str]) -> str:
    """Брифинг операции для ветки Discord (markdown), без скрытых разделов, этапов и точек."""
    plan = plan_of(op)
    hidden = set(plan.hidden)
    who = {p["user_id"]: p for p in people(op)}

    def name(uid: str | None) -> str:
        return (who.get(uid or "", {}).get("name") or names.get(uid or "") or "") if uid else ""

    stamp = int((op.starts_at or datetime.combine(op.date, datetime.min.time(), tzinfo=UTC)).timestamp())
    lines = [f"## 📋 {t.t('ops.brief.title', title=op.title)}",
             f"**{t.t('ops.when')}:** <t:{stamp}:F>" if op.starts_at else f"**{t.t('ops.when')}:** {op.date.isoformat()}"]
    if "note" not in hidden and op.note:
        lines += ["", op.note[:800]]
    stages = [s for s in plan.stages if s.brief]
    if "stages" not in hidden and stages:
        lines += ["", f"### {t.t('ops.brief.stages')}"]
        for s in stages:
            owner = name(s.owner_id)
            row = f"- {'~~' if s.done else ''}{('`' + s.time + '` ') if s.time else ''}{s.title}{'~~' if s.done else ''}"
            if owner:
                row += f" — {owner}"
            if s.note:
                row += f"\n  {s.note}"
            lines.append(row)
    points = [p for p in plan.points if p.brief]
    if "points" not in hidden and points:
        lines += ["", f"### {t.t('ops.brief.points')}"]
        lines += [f"- {POINT_ICON.get(p.kind, '📍')} **{t.t('ops.point.' + p.kind)}**" + (f": {p.label}" if p.label else "")
                  + (f" — {p.note}" if p.note else "") for p in points]
    go = going(op)
    if "roles" not in hidden and plan.roles:
        lines += ["", f"### {t.t('ops.brief.roles')}"]
        for r in plan.roles:
            members = [p["name"] for p in go if p["role"] == r.id]
            fill = f"{len(members)}/{r.slots}" if r.slots else str(len(members))
            lines.append(f"- **{r.name}** ({fill}): {', '.join(members) or '—'}")
    if "squads" not in hidden and plan.squads:
        lines += ["", f"### {t.t('ops.brief.squads')}"]
        for sq in plan.squads:
            members = [p["name"] for p in go if p["squad"] == sq.id]
            leader = name(sq.leader_id)
            lines.append(f"- **{sq.name}**" + (f" ({t.t('ops.brief.leader', name=leader)})" if leader else "")
                         + f": {', '.join(members) or '—'}")
    if "people" not in hidden:
        maybe = [p["name"] for p in people(op) if p["status"] == "maybe"]
        lines += ["", f"**{t.t('ops.going', n=len(go))}:** {', '.join(p['name'] for p in go) or '—'}"]
        if maybe:
            lines.append(f"**{t.t('ops.maybe_n', n=len(maybe))}:** {', '.join(maybe)}")
    if "supply" not in hidden and rows:
        done, total = sum(r["delivered"] for r in rows), sum(r["ordered"] for r in rows)
        lines += ["", f"### {t.t('ops.brief.supply', pct=round(100 * done / total) if total else 0)}"]
        lines += [f"- {r['title']}: {r['delivered']}/{r['ordered']}" for r in rows[:15]]
    if plan.debrief.outcome or plan.debrief.text:
        lines += ["", f"### {t.t('ops.brief.debrief')}"]
        if plan.debrief.outcome:
            lines.append(f"{OUTCOME_ICON[plan.debrief.outcome]} {t.t('ops.outcome.' + plan.debrief.outcome)}")
        if plan.debrief.text:
            lines.append(plan.debrief.text[:800])
    return "\n".join(lines)


def chunks(text: str, size: int = 1900) -> list[str]:
    """Discord: до 2000 символов в сообщении — режем по строкам."""
    out: list[str] = []
    cur = ""
    for line in text.split("\n"):
        if len(cur) + len(line) + 1 > size and cur:
            out.append(cur)
            cur = ""
        cur = f"{cur}\n{line}" if cur else line[:size]
    if cur:
        out.append(cur)
    return out[:5]
