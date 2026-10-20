from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import Cookie, Depends, Header, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, SecurityScopes
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import AsyncSessionLocal
from app.core.errors import PermissionDeniedError, UnauthorizedError
from app.core.i18n import Translator, normalize_locale, parse_accept_language
from app.core.permissions import scopes_for
from app.core.security import Principal, decode_access_token, hash_clan_token
from app.core.tenancy import bind_session_to_clan, bypass_clan_filter, set_current_clan_id
from app.models.rbac import ClanApiToken

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="ClanJWT")


# --------------------------------------------------------------------------- #
# i18n
# --------------------------------------------------------------------------- #
async def get_translator(
    request: Request,
    accept_language: Annotated[str | None, Header(alias="Accept-Language")] = None,
    x_locale: Annotated[str | None, Header(alias="X-Locale")] = None,
) -> Translator:
    """X-Locale (явный выбор в UI) приоритетнее, чем Accept-Language браузера."""
    locale = normalize_locale(x_locale) or parse_accept_language(accept_language)
    translator = Translator(locale=locale)
    request.state.translator = translator   # нужен exception handler'ам
    request.state.locale = locale
    return translator


TranslatorDep = Annotated[Translator, Depends(get_translator)]


def domain_translator(domain: str):
    """Фабрика: `tr: Annotated[Translator, Depends(domain_translator("production"))]`."""

    async def _dep(translator: TranslatorDep) -> Translator:
        return Translator(locale=translator.locale, default_domain=domain)

    return _dep


# --------------------------------------------------------------------------- #
# Сырые сессии БД
# --------------------------------------------------------------------------- #
async def get_db() -> AsyncIterator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


DbDep = Annotated[AsyncSession, Depends(get_db)]


# --------------------------------------------------------------------------- #
# Аутентификация: Bearer JWT | кука сессии | X-Clan-Token
# --------------------------------------------------------------------------- #
async def _principal_from_clan_token(session: AsyncSession, raw_token: str) -> Principal:
    stmt = select(ClanApiToken).where(ClanApiToken.token_hash == hash_clan_token(raw_token))
    with bypass_clan_filter():       # клан ещё не известен — это и есть его поиск
        row = (await session.execute(stmt)).scalar_one_or_none()

    now = datetime.now(UTC)
    if row is None or row.revoked_at is not None or (row.expires_at and row.expires_at < now):
        raise UnauthorizedError(code="invalid_clan_token")

    return Principal(
        subject_type="clan_token",
        user_id=f"token:{row.id}",
        clan_id=row.clan_id,
        role=row.role,
        scopes=scopes_for(row.role, row.extra_scopes),
        display_name=row.label,
        session_id=str(row.id),
    )


async def get_principal(
    request: Request,
    session: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    clan_token: Annotated[str | None, Header(alias=settings.CLAN_TOKEN_HEADER)] = None,
    session_cookie: Annotated[str | None, Cookie(alias=settings.SESSION_COOKIE_NAME)] = None,
) -> Principal:
    """
    Единая точка извлечения clan_id. ВАЖНО: dependency асинхронная —
    значит ContextVar, установленный здесь, виден в эндпоинте и сервисах.
    """
    if credentials is not None and credentials.scheme.lower() == "bearer":
        principal = decode_access_token(credentials.credentials)
    elif session_cookie:
        principal = decode_access_token(session_cookie)
    elif clan_token:
        principal = await _principal_from_clan_token(session, clan_token)
    else:
        raise UnauthorizedError()

    # Два независимых канала привязки: ContextVar (для фона/логов) и session.info
    # (для ORM-событий — не зависит от контекста исполнения).
    set_current_clan_id(principal.clan_id)
    bind_session_to_clan(session, principal.clan_id)
    request.state.principal = principal
    request.state.clan_id = principal.clan_id
    return principal


CurrentPrincipal = Annotated[Principal, Depends(get_principal)]


async def get_clan_session(session: DbDep, principal: CurrentPrincipal) -> AsyncSession:
    """
    Сессия, гарантированно привязанная к клану.
    Все репозитории/сервисы принимают ТОЛЬКО её.
    """
    return session


ClanSession = Annotated[AsyncSession, Depends(get_clan_session)]


# --------------------------------------------------------------------------- #
# RBAC
# --------------------------------------------------------------------------- #
class PermissionChecker:
    """
    Декларативная проверка прав на уровне роутера:

        @router.post(
            "",
            dependencies=[Depends(PermissionChecker(["reports:create", "stockpiles:read"]))],
        )

    или как значение (тогда вернёт Principal):

        principal: Annotated[Principal, Depends(PermissionChecker(["reports:create"]))]
    """

    __slots__ = ("scopes", "mode")

    def __init__(self, scopes: Sequence[str], *, mode: Literal["all", "any"] = "all") -> None:
        self.scopes = tuple(scopes)
        self.mode = mode

    async def __call__(
        self,
        principal: CurrentPrincipal,
        translator: TranslatorDep,
    ) -> Principal:
        if self.mode == "any":
            ok = any(principal.can(scope) for scope in self.scopes)
            missing = [] if ok else list(self.scopes)
        else:
            missing = principal.missing(list(self.scopes))

        if missing:
            raise PermissionDeniedError(params={"scopes": ", ".join(missing)})
        return principal

    def __repr__(self) -> str:  # для /docs и логов
        return f"PermissionChecker({self.mode}={list(self.scopes)})"


async def get_principal_with_scopes(
    security_scopes: SecurityScopes,
    principal: CurrentPrincipal,
) -> Principal:
    """Альтернатива для OpenAPI-нативного стиля: `Security(get_principal_with_scopes, scopes=[...])`."""
    missing = principal.missing(list(security_scopes.scopes))
    if missing:
        raise PermissionDeniedError(params={"scopes": ", ".join(missing)})
    return principal
