from __future__ import annotations

import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    DbDep,
    PermissionChecker,
    domain_translator,
)
from app.core.config import settings
from app.core.errors import PermissionDeniedError
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.core.security import Principal
from app.schemas.auth import (
    ClanApiTokenCreate,
    ClanApiTokenCreated,
    DevTokenRequest,
    MeRead,
    RedeemCodeRequest,
    TokenResponse,
)
from app.schemas.code import InviteCodeCreate, InviteCodeCreated, InviteCodeRead
from app.schemas.common import Page
from app.services.auth import AuthService
from app.services.invites import InviteService

router = APIRouter(prefix="/auth", tags=["auth"])

AuthTranslator = Annotated[Translator, Depends(domain_translator("auth"))]


async def get_auth_service(session: DbDep, translator: AuthTranslator) -> AuthService:
    # bootstrap-сервису хватает «сырой» сессии — клан ещё не аутентифицирован
    return AuthService(session, translator)


async def get_invite_service(
    session: ClanSession, principal: CurrentPrincipal, translator: AuthTranslator
) -> InviteService:
    return InviteService(session, principal, translator)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]
InviteServiceDep = Annotated[InviteService, Depends(get_invite_service)]


# ---------------- current principal ----------------------------------------- #
@router.get("/me", response_model=MeRead, summary="Кто я: user/clan/role/scopes")
async def read_me(principal: CurrentPrincipal) -> MeRead:
    return MeRead(
        subject_type=principal.subject_type,
        user_id=principal.user_id,
        clan_id=principal.clan_id,
        role=principal.role,
        scopes=sorted(principal.scopes),
        display_name=principal.display_name,
    )


# ---------------- token issuance -------------------------------------------- #
@router.post(
    "/dev-token",
    response_model=TokenResponse,
    summary="DEV/ADMIN-выдача JWT (ENV!=prod или X-Dev-Auth-Key == DEV_AUTH_SECRET)",
)
async def issue_dev_token(
    payload: DevTokenRequest,
    service: AuthServiceDep,
    translator: AuthTranslator,
    dev_auth_key: Annotated[str | None, Header(alias=settings.DEV_AUTH_HEADER)] = None,
) -> TokenResponse:
    if settings.DEV_AUTH_SECRET:
        if not secrets.compare_digest(dev_auth_key or "", settings.DEV_AUTH_SECRET):
            raise PermissionDeniedError(message_key="dev.forbidden", domain="auth", params={})
    elif settings.ENV == "prod":
        raise PermissionDeniedError(message_key="dev.disabled", domain="auth", params={})
    return await service.issue_dev_token(payload, translator.locale)


@router.post(
    "/redeem-code",
    response_model=TokenResponse,
    summary="Вступление в клан по пригласительному коду (публичный, код = секрет)",
)
async def redeem_code(
    payload: RedeemCodeRequest,
    service: AuthServiceDep,
    translator: AuthTranslator,
) -> TokenResponse:
    return await service.redeem_code(payload, translator.locale)


@router.post(
    "/clan-token",
    response_model=ClanApiTokenCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Выпуск кланового API-токена (X-Clan-Token) для ботов",
)
async def create_clan_token(
    payload: ClanApiTokenCreate,
    service: AuthServiceDep,
    principal: Annotated[Principal, Depends(PermissionChecker([Scopes.CLAN_SETTINGS_WRITE]))],
) -> ClanApiTokenCreated:
    return await service.create_clan_api_token(principal, payload)


# ---------------- invite codes (management) ---------------------------------- #
@router.get(
    "/invites",
    response_model=Page[InviteCodeRead],
    summary="Пригласительные коды клана",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_MEMBERS_READ]))],  # officer+
)
async def list_invites(
    service: InviteServiceDep,
    include_revoked: Annotated[bool, Query()] = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[InviteCodeRead]:
    rows, total = await service.list_invites(
        include_revoked=include_revoked, limit=limit, offset=offset
    )
    return Page[InviteCodeRead](
        items=[InviteCodeRead.model_validate(r) for r in rows],
        total=total, limit=limit, offset=offset,
    )


@router.post(
    "/invites",
    response_model=InviteCodeCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Создать пригласительный код",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_MEMBERS_WRITE]))],  # admin+
)
async def create_invite(payload: InviteCodeCreate, service: InviteServiceDep) -> InviteCodeCreated:
    invite, message = await service.create_invite(payload)
    return InviteCodeCreated(invite=InviteCodeRead.model_validate(invite), message=message)


@router.delete(
    "/invites/{invite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Отозвать пригласительный код",
    dependencies=[Depends(PermissionChecker([Scopes.CLAN_MEMBERS_WRITE]))],  # admin+
)
async def revoke_invite(invite_id: uuid.UUID, service: InviteServiceDep) -> Response:
    await service.revoke_invite(invite_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
