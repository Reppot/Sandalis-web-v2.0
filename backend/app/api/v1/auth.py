from datetime import datetime, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    Principal,
    get_current_principal,
    get_db,
    get_optional_principal,
)
from app.core.config import settings
from app.core.security import generate_oauth_state
from app.schemas.auth import (
    AuthSessionResponse,
    ClanTokenLoginRequest,
    DiscordProfileResponse,
)
from app.services.auth import AuthenticatedSession, auth_service
from app.services.errors import AuthenticationServiceError


router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


def _build_auth_response(
    authenticated: AuthenticatedSession,
) -> AuthSessionResponse:
    user = authenticated.user
    session = authenticated.session

    discord_profile = None

    if user.discord_id:
        discord_profile = DiscordProfileResponse(
            id=user.discord_id,
            username=user.username,
            discriminator="0",
            avatar_url=user.avatar_url,
        )

    return AuthSessionResponse(
        token=session.session_token,
        discord_id=user.discord_id,
        discord_profile=discord_profile,
        created_at=session.created_at,
        expires_at=session.expires_at,
        role=user.role,
    )


def _set_session_cookie(
    response: Response,
    authenticated: AuthenticatedSession,
) -> None:
    expires_at = authenticated.session.expires_at
    now = datetime.now(timezone.utc)

    max_age = max(
        1,
        int((expires_at - now).total_seconds()),
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=authenticated.session.session_token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )


@router.post(
    "/token",
    response_model=AuthSessionResponse,
)
async def login_with_token(
    payload: ClanTokenLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthSessionResponse:
    try:
        authenticated = await auth_service.login_with_clan_token(
            db=db,
            presented_token=payload.token,
        )
    except AuthenticationServiceError as exc:
        raise HTTPException(
            status_code=401,
            detail=str(exc),
        ) from exc

    _set_session_cookie(response, authenticated)
    return _build_auth_response(authenticated)


@router.post(
    "/login",
    response_model=AuthSessionResponse,
)
async def login_alias(
    payload: ClanTokenLoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> AuthSessionResponse:
    return await login_with_token(
        payload=payload,
        response=response,
        db=db,
    )


@router.get("/discord/login")
async def discord_login() -> RedirectResponse:
    if not settings.discord_client_id:
        raise HTTPException(
            status_code=503,
            detail="Discord OAuth is not configured",
        )

    state = generate_oauth_state()

    query = urlencode(
        {
            "client_id": settings.discord_client_id,
            "redirect_uri": settings.discord_redirect_uri,
            "response_type": "code",
            "scope": "identify",
            "state": state,
        }
    )

    redirect = RedirectResponse(
        url=(
            "https://discord.com/oauth2/authorize?"
            f"{query}"
        ),
        status_code=307,
    )

    redirect.set_cookie(
        key=settings.oauth_state_cookie_name,
        value=state,
        max_age=settings.oauth_state_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/",
    )

    return redirect


@router.get("/discord/callback")
async def discord_callback(
    code: str = Query(min_length=1),
    state: str = Query(min_length=1),
    oauth_state: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    if not oauth_state or oauth_state != state:
        raise HTTPException(
            status_code=400,
            detail="Invalid Discord OAuth state",
        )

    try:
        authenticated = await auth_service.login_with_discord_code(
            db=db,
            code=code,
        )
    except AuthenticationServiceError as exc:
        raise HTTPException(
            status_code=401,
            detail=str(exc),
        ) from exc

    redirect = RedirectResponse(
        url=f"{settings.frontend_url}/?auth=success",
        status_code=303,
    )

    redirect.delete_cookie(
        key=settings.oauth_state_cookie_name,
        path="/",
    )
    _set_session_cookie(redirect, authenticated)

    return redirect


@router.get(
    "/me",
    response_model=AuthSessionResponse,
)
async def get_me(
    principal: Principal = Depends(get_current_principal),
) -> AuthSessionResponse:
    return _build_auth_response(
        AuthenticatedSession(
            session=principal.session,
            user=principal.user,
        )
    )


@router.post(
    "/logout",
    status_code=204,
)
async def logout(
    response: Response,
    principal: Principal | None = Depends(get_optional_principal),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if principal is not None:
        await db.delete(principal.session)
        await db.flush()

    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
    )

    return response