from __future__ import annotations

import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select

from app.api.deps import (
    ClanSession,
    CurrentPrincipal,
    DbDep,
    PermissionChecker,
    domain_translator,
)
from app.core.config import settings
from app.core.errors import AppError, PermissionDeniedError
from app.core.i18n import Translator
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.rbac import User
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
from app.services.discord_oauth import (
    avatar_url,
    build_authorize_url,
    error_redirect_url,
    exchange_code,
    fetch_profile,
    make_state,
    safe_return_to,
    verify_state,
)
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


# ---------------- session cookie ------------------------------------------- #
def _set_session_cookie(response: Response, token: str) -> None:
    """Stateless JWT в HttpOnly-куке: /me и все доменные ручки читают её сами
    (get_principal проверяет Bearer -> session cookie -> X-Clan-Token)."""
    ttl_sec = settings.SESSION_TTL_MINUTES * 60
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        max_age=ttl_sec,
        expires=ttl_sec,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )


# ---------------- current principal ----------------------------------------- #
@router.get("/me", response_model=MeRead, summary="Кто я: user/clan/role/scopes/avatar")
async def read_me(principal: CurrentPrincipal, session: DbDep) -> MeRead:
    avatar: str | None = None
    if principal.subject_type == "user":
        # User глобальный (не clan-scoped) — аватар в JWT не кладём, читаем из БД
        avatar = await session.scalar(select(User.avatar_url).where(User.id == principal.user_id))
    return MeRead(
        subject_type=principal.subject_type,
        user_id=principal.user_id,
        clan_id=principal.clan_id,
        role=principal.role,
        scopes=sorted(principal.scopes),
        display_name=principal.display_name,
        avatar_url=avatar,
    )


# ---------------- token issuance -------------------------------------------- #
@router.post(
    "/dev-token",
    response_model=TokenResponse,
    summary="DEV/ADMIN-выдача JWT (ENV!=prod или X-Dev-Auth-Key == DEV_AUTH_SECRET)",
)
async def issue_dev_token(
    payload: DevTokenRequest,
    response: Response,
    service: AuthServiceDep,
    translator: AuthTranslator,
    dev_auth_key: Annotated[str | None, Header(alias=settings.DEV_AUTH_HEADER)] = None,
) -> TokenResponse:
    if settings.DEV_AUTH_SECRET:
        if not secrets.compare_digest(dev_auth_key or "", settings.DEV_AUTH_SECRET):
            raise PermissionDeniedError(message_key="dev.forbidden", domain="auth", params={})
    elif settings.ENV == "prod":
        raise PermissionDeniedError(message_key="dev.disabled", domain="auth", params={})
    token = await service.issue_dev_token(payload, translator.locale)
    _set_session_cookie(response, token.access_token)
    return token


@router.post(
    "/redeem-code",
    response_model=TokenResponse,
    summary="Вступление в клан по пригласительному коду (публичный, код = секрет)",
)
async def redeem_code(
    payload: RedeemCodeRequest,
    response: Response,
    service: AuthServiceDep,
    translator: AuthTranslator,
) -> TokenResponse:
    token = await service.redeem_code(payload, translator.locale)
    # веб-клиент живёт на куке (same-origin через прокси фронта); Bearer в теле — для ботов/CLI
    _set_session_cookie(response, token.access_token)
    return token


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


# ---------------- Discord OAuth (stateless JWT) ------------------------------- #
@router.get(
    "/discord/login",
    summary="Начать Discord OAuth2: 302 на Discord c подписанным state",
    description="Без DISCORD_CLIENT_ID/DISCORD_CLIENT_SECRET отвечает 503 discord.disabled.",
    responses={
        302: {"description": "Redirect to Discord authorize URL"},
        503: {"description": "Discord OAuth is not configured"},
    },
)
async def discord_login(
    clan_id: Annotated[str | None, Query(max_length=64)] = None,
    return_to: Annotated[str | None, Query(max_length=512)] = None,
) -> Response:
    if not settings.DISCORD_CLIENT_ID or not settings.DISCORD_CLIENT_SECRET:
        raise AppError(
            message_key="discord.disabled",
            domain="auth",
            code="disabled",
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            params={},
        )
    state = make_state(clan_id=clan_id, return_to=return_to)
    return RedirectResponse(build_authorize_url(state), status_code=status.HTTP_302_FOUND)


@router.get(
    "/discord/callback",
    summary="OAuth2 callback: state -> token -> profile -> JWT (cookie или Bearer)",
    description=(
        "По умолчанию ставит session-cookie и делает 302 на FRONTEND_URL "
        "(или безопасный return_to из state). `?response=json` возвращает TokenResponse."
    ),
    responses={
        200: {"model": TokenResponse, "description": "response=json"},
        302: {"description": "Cookie + redirect to FRONTEND_URL"},
    },
)
async def discord_callback(
    service: AuthServiceDep,
    translator: AuthTranslator,
    code: Annotated[str | None, Query(max_length=512)] = None,
    state: Annotated[str | None, Query(max_length=4096)] = None,
    response_mode: Annotated[str | None, Query(alias="response", max_length=16)] = None,
    discord_error: Annotated[str | None, Query(alias="error", max_length=128)] = None,
) -> Response:
    json_mode = response_mode == "json"

    try:
        # Discord редиректит с ?error=... при отказе пользователя — это тот же
        # «обмен не состоялся», а не 500.
        if discord_error or not code:
            raise AppError(
                message_key="discord.exchange_failed",
                domain="auth",
                code="exchange_failed",
                status_code=502,
                params={},
            )

        oauth_state = verify_state(state)
        token = await exchange_code(code)
        profile = await fetch_profile(token.access_token)

        membership = await service.resolve_discord_membership(
            user_id=profile.id,
            display_name=profile.display_name,
            clan_id=oauth_state.clan_id,
        )
        await service.upsert_discord_user(
            user_id=profile.id,
            display_name=profile.display_name,
            avatar_url=avatar_url(profile),
            locale=profile.locale,
        )

        token_response = service.issue_token(membership, profile.id, profile.display_name)
        token_response.message = translator.t(
            "discord.signed_in", domain="auth", name=profile.display_name
        )
        await service.commit()
    except AppError as exc:
        if json_mode:
            raise                      # стандартный JSON-envelope проекта
        return RedirectResponse(error_redirect_url(exc.code), status_code=status.HTTP_302_FOUND)

    if json_mode:
        body = JSONResponse(token_response.model_dump(mode="json"), status_code=status.HTTP_200_OK)
        _set_session_cookie(body, token_response.access_token)
        return body

    redirect = RedirectResponse(
        safe_return_to(oauth_state.return_to), status_code=status.HTTP_302_FOUND
    )
    _set_session_cookie(redirect, token_response.access_token)
    return redirect


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Выйти: удалить session-cookie (stateless JWT просто перестаёт передаваться)",
    responses={204: {"description": "Cookie removed"}},
)
async def logout() -> Response:
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
    return response
