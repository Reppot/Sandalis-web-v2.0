from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import select

from app.api.deps import DbDep, PermissionChecker
from app.core.config import settings
from app.core.errors import PermissionDeniedError
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.content import AppContent
from app.schemas.content import ContentKind, ContentRead, ContentUpsert

router = APIRouter(prefix="/content", tags=["content"])

LAZY_KINDS = ("guide_chapter",)


@router.get(
    "",
    response_model=list[ContentRead],
    summary="Реестр контента интерфейса (публичный: нужен экрану входа до авторизации)",
    description=(
        "kind: media, external_tool, training_module, ticker_phrase, region, material, "
        "catalog_category, factory_category, refinery_group, guide_chapter. Без kind — всё, "
        "кроме guide_chapter (руководство запрашивается отдельно)."
    ),
)
async def list_content(
    session: DbDep,
    kind: Annotated[list[ContentKind] | None, Query()] = None,
) -> list[ContentRead]:
    stmt = select(AppContent).where(AppContent.is_active.is_(True))
    if kind:
        stmt = stmt.where(AppContent.kind.in_(kind))
    else:
        # руководство (скриншоты, метки, тексты ×3 языка) грузит только вкладка «Навигация»
        stmt = stmt.where(AppContent.kind.notin_(LAZY_KINDS))
    stmt = stmt.order_by(AppContent.kind, AppContent.sort, AppContent.key)
    return [ContentRead.model_validate(r) for r in (await session.execute(stmt)).scalars()]


@router.put(
    "/{kind}/{key}",
    response_model=ContentRead,
    summary="Создать/изменить запись контента (admin клана-владельца контента)",
    description=(
        "Контент глобальный, поэтому править его может только admin+ клана "
        "CONTENT_ADMIN_CLAN_ID (по умолчанию DEFAULT_CLAN_ID)."
    ),
)
async def upsert_content(
    session: DbDep,
    payload: ContentUpsert,
    principal: Annotated[Principal, Depends(PermissionChecker([Scopes.CLAN_SETTINGS_WRITE]))],
    kind: Annotated[str, Path(pattern=r"^[a-z_]{1,32}$")],
    key: Annotated[str, Path(min_length=1, max_length=64)],
) -> ContentRead:
    owner = settings.CONTENT_ADMIN_CLAN_ID or settings.DEFAULT_CLAN_ID
    if not owner or principal.clan_id != owner:
        raise PermissionDeniedError(params={"scopes": "content:write"})

    row = (
        await session.execute(
            select(AppContent).where(AppContent.kind == kind, AppContent.key == key)
        )
    ).scalar_one_or_none()
    if row is None:
        row = AppContent(kind=kind, key=key, payload=payload.payload, sort=payload.sort or 0)
        session.add(row)
    else:
        row.payload = payload.payload
        if payload.sort is not None:
            row.sort = payload.sort
    if payload.is_active is not None:
        row.is_active = payload.is_active
    await session.commit()
    await session.refresh(row)
    return ContentRead.model_validate(row)
