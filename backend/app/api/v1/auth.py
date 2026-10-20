from __future__ import annotations

import secrets
import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, Query, Response, status
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
from app.core.errors import AppError, PermissionDeniedError, UnauthorizedError
from app.core.i18n import Translator, normalize_locale
from app.core.permissions import Scopes
from app.core.security import Principal
from app.models.rbac import User
from app.schemas.auth import (
    ClanApiTokenCreate,
    ClanApiTokenCreated,
    DevTokenRequest,
    DiscordSetupRead,
    DiscordSetupSelect,
    LocaleUpdate,
    MeRead,
    TokenResponse,
)
from app.schemas.common import Page
from app.services.auth import AuthService
from app.services.discord_oauth import (
    avatar_url,
    build_authorize_url,
    error_redirect_url,
    exchange_code,
    fetch_user_guilds,
    owned_guilds,
    fetch_profile,
    make_state,
    safe_return_to,
    seal,
    setup_redirect_url,
    unseal,
    verify_state,
)

router = APIRouter(prefix="/auth", tags=["auth"])

AuthTranslator = Annotated[Translator, Depends(domain_translator("auth"))]


async def get_auth_service(session: DbDep, translator: AuthTranslator) -> AuthService:
    # bootstrap-сервису хватает «сырой» сессии — клан ещё не аутентифицирован
    return AuthService(session, translator)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


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


SETUP_COOKIE = "sindaris_discord_setup"


def _set_setup_cookie(response: Response, value: str) -> None:
    """Подписанный (HMAC) незавершённый вход: профиль + серверы-во-владении.
    Живёт DISCORD_SETUP_TTL_SEC и стирается при выборе сервера."""
    response.set_cookie(
        key=SETUP_COOKIE,
        value=value,
        max_age=settings.DISCORD_SETUP_TTL_SEC,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
    )


def _setup_state(raw: str | None) -> dict:
    body = unseal(raw)
    if not body or not isinstance(body.get("uid"), str) or not isinstance(body.get("guilds"), list):
        raise UnauthorizedError(message_key="setup.expired", domain="auth", code="setup_expired")
    return body


# ---------------- current principal ----------------------------------------- #
@router.get("/me", response_model=MeRead, summary="Кто я: user/clan/role/scopes/avatar")
async def read_me(principal: CurrentPrincipal, session: DbDep) -> MeRead:
    avatar: str | None = None
    locale: str | None = None
    if principal.subject_type == "user":
        # User глобальный (не clan-scoped) — аватар и язык в JWT не кладём, читаем из БД
        row = (
            await session.execute(
                select(User.avatar_url, User.preferred_locale).where(User.id == principal.user_id)
            )
        ).first()
        if row:
            avatar, locale = row
    return _me(principal, avatar, locale)


def _me(principal: Principal, avatar: str | None, locale: str | None) -> MeRead:
    return MeRead(
        subject_type=principal.subject_type,
        user_id=principal.user_id,
        clan_id=principal.clan_id,
        role=principal.role,
        scopes=sorted(principal.scopes),
        display_name=principal.display_name,
        avatar_url=avatar,
        locale=locale,
    )


@router.put("/me/locale", response_model=MeRead, summary="Сменить язык интерфейса (ru/en/cs)")
async def update_locale(
    payload: LocaleUpdate, principal: CurrentPrincipal, session: DbDep
) -> MeRead:
    locale = normalize_locale(payload.locale)
    if locale is None:
        raise AppError(
            message_key="errors.validation", code="unsupported_locale",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, params={},
        )
    avatar: str | None = None
    if principal.subject_type == "user":
        user = await session.get(User, principal.user_id)
        if user is not None:
            user.preferred_locale = locale
            avatar = user.avatar_url
            await session.commit()
    # clan_token (бот) профиля не имеет — язык живёт только на клиенте
    return _me(principal, avatar, locale)


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
    "/guest",
    response_model=TokenResponse,
    summary="Гостевой доступ: инструменты и каталог, без данных какого-либо клана",
)
async def guest_login(response: Response, service: AuthServiceDep) -> TokenResponse:
    token = service.issue_guest_token()
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
    principal: Annotated[Principal, Depends(PermissionChecker([Scopes.CLAN_TOKENS]))],
) -> ClanApiTokenCreated:
    return await service.create_clan_api_token(principal, payload)


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
        await service.upsert_discord_user(
            user_id=profile.id,
            display_name=profile.display_name,
            avatar_url=avatar_url(profile),
            locale=profile.locale,
        )

        # серверы пользователя: свои (создать клан), кланы с ботом (вступить),
        # и пересчёт уровня доступа там, где он уже состоит
        guilds = await fetch_user_guilds(token.access_token)
        await service.sync_discord_roles(
            user_id=profile.id, access_token=token.access_token, guild_ids=[g.id for g in guilds],
        )

        owned = [] if oauth_state.clan_id else owned_guilds(guilds)
        joins = [] if oauth_state.clan_id else await service.joinable_clans(
            user_id=profile.id, access_token=token.access_token, guilds=guilds,
        )
        if owned or joins:
            # владелец серверов: выбор сервера клана (или уже существующего клана)
            await service.commit()
            setup = seal(
                {
                    "uid": profile.id,
                    "name": profile.display_name,
                    "avatar": avatar_url(profile),
                    "guilds": [
                        {"id": g.id, "name": g.name, "icon_url": g.icon_url} for g in owned
                    ],
                    "joins": joins,
                },
                settings.DISCORD_SETUP_TTL_SEC,
            )
            if json_mode:
                body = JSONResponse(
                    {"setup_required": True}, status_code=status.HTTP_202_ACCEPTED
                )
            else:
                body = RedirectResponse(setup_redirect_url(), status_code=status.HTTP_302_FOUND)
            _set_setup_cookie(body, setup)
            return body
        membership = await service.resolve_discord_membership(
            user_id=profile.id,
            display_name=profile.display_name,
            clan_id=oauth_state.clan_id,
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


@router.get(
    "/discord/setup",
    response_model=DiscordSetupRead,
    summary="Незавершённый Discord-вход: серверы во владении и кланы пользователя",
)
async def discord_setup(
    service: AuthServiceDep,
    setup_cookie: Annotated[str | None, Cookie(alias=SETUP_COOKIE)] = None,
) -> DiscordSetupRead:
    body = _setup_state(setup_cookie)
    guilds, memberships = await service.setup_options(user_id=body["uid"], guilds=body["guilds"])
    return DiscordSetupRead(
        display_name=body.get("name") or body["uid"],
        avatar_url=body.get("avatar"),
        guilds=guilds,
        joins=body.get("joins") or [],
        memberships=memberships,
    )


@router.post(
    "/discord/setup",
    response_model=TokenResponse,
    summary="Выбрать сервер клана (станете owner) или существующий клан",
)
async def discord_setup_select(
    payload: DiscordSetupSelect,
    response: Response,
    service: AuthServiceDep,
    translator: AuthTranslator,
    setup_cookie: Annotated[str | None, Cookie(alias=SETUP_COOKIE)] = None,
) -> TokenResponse:
    body = _setup_state(setup_cookie)
    user_id, name = body["uid"], body.get("name") or body["uid"]
    if payload.guild_id:
        guild = next((g for g in body["guilds"] if g.get("id") == payload.guild_id), None)
        if guild is None:
            raise PermissionDeniedError(message_key="setup.guild_not_owned", domain="auth", params={})
        membership, clan_name = await service.claim_guild(user_id=user_id, display_name=name, guild=guild)
        message = translator.t("setup.clan_created", domain="auth", clan=clan_name)
    elif payload.join_clan_id:
        join = next((j for j in body.get("joins") or [] if j.get("clan_id") == payload.join_clan_id), None)
        if join is None:
            raise PermissionDeniedError(message_key="setup.clan_not_member", domain="auth", params={})
        membership, clan_name = await service.join_clan(user_id=user_id, display_name=name, join=join)
        message = translator.t("setup.joined", domain="auth", clan=clan_name)
    elif payload.clan_id:
        try:
            membership = await service.resolve_discord_membership(
                user_id=user_id, display_name=name, clan_id=payload.clan_id
            )
        except PermissionDeniedError:
            raise PermissionDeniedError(
                message_key="setup.clan_not_member", domain="auth", params={}
            ) from None
        message = translator.t("setup.signed_in", domain="auth", name=name)
    else:
        raise AppError(
            message_key="setup.nothing_selected", domain="auth", code="validation_error",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, params={},
        )

    token = service.issue_token(membership, user_id, name)
    token.message = message
    await service.commit()
    _set_session_cookie(response, token.access_token)
    response.delete_cookie(key=SETUP_COOKIE, path="/")
    return token


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
