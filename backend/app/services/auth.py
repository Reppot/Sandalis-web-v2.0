from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Final

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, PermissionDeniedError
from app.core.i18n import Translator, normalize_locale
from app.core.permissions import ClanRole, scopes_for
from app.core.security import decode_access_token, hash_clan_token, issue_access_token  # noqa: F401
from app.core.tenancy import bypass_clan_filter
from app.models.code import ClanInviteCode
from app.models.rbac import Clan, ClanApiToken, ClanMembership, User
from app.schemas.auth import (
    ClanApiTokenCreate,
    ClanApiTokenCreated,
    DevTokenRequest,
    InvitePreview,
    MeRead,
    SetupGuildRead,
    SetupMembershipRead,
    TokenResponse,
)

DOMAIN = "auth"

ROLE_RANK: Final[dict[ClanRole, int]] = {
    ClanRole.GUEST: 0,
    ClanRole.MEMBER: 1,
    ClanRole.OFFICER: 2,
    ClanRole.ADMIN: 3,
    ClanRole.OWNER: 4,
}


class AuthService:
    """Bootstrap-аутентификация: работает ДО наличия кланового контекста,
    поэтому сессия сюда приходит «сырая» (DbDep), а все кросс-клановые
    поиски явно обёрнуты в bypass_clan_filter() — это core-слой, ему можно.
    """

    def __init__(self, session: AsyncSession, translator: Translator) -> None:
        self.session = session
        self.t = translator

    # ---------------- identity ------------------------------------------------ #
    async def _upsert_identity(
        self,
        *,
        clan_id: str,
        user_id: str,
        display_name: str,
        role: ClanRole,
        locale: str | None = None,
    ) -> tuple[ClanMembership, str]:
        """Идемпотентно создаёт Clan/User/ClanMembership; существующую роль
        membership НЕ понижает. Возвращает (membership, clan_name)."""
        with bypass_clan_filter():
            clan = (
                await self.session.execute(select(Clan).where(Clan.id == clan_id))
            ).scalar_one_or_none()
            if clan is None:
                clan = Clan(id=clan_id, name=clan_id)
                self.session.add(clan)

            user = (
                await self.session.execute(select(User).where(User.id == user_id))
            ).scalar_one_or_none()
            if user is None:
                user = User(
                    id=user_id,
                    display_name=display_name or user_id,
                    preferred_locale=locale,
                )
                self.session.add(user)
            else:
                user.display_name = display_name or user.display_name

            membership = (
                await self.session.execute(
                    select(ClanMembership).where(
                        ClanMembership.clan_id == clan_id,
                        ClanMembership.user_id == user_id,
                    )
                )
            ).scalar_one_or_none()
            if membership is None:
                membership = ClanMembership(
                    clan_id=clan_id,        # bypass-режим: проставляем явно
                    user_id=user_id,
                    role=role,
                    extra_scopes=[],
                    revoked_scopes=[],
                )
                self.session.add(membership)

            await self.session.flush()
            return membership, clan.name

    def issue_token(
        self, membership: ClanMembership, user_id: str, display_name: str | None
    ) -> TokenResponse:
        """Публичная обёртка над _issue: extra/revoked scopes читаются из
        membership, поэтому вызывающему знать про них не нужно."""
        return self._issue(membership, user_id, display_name)

    # ---------------- discord oauth helpers ------------------------------------ #
    async def commit(self) -> None:
        """Точка фиксации для роутов, которые собирают ответ из нескольких шагов."""
        await self.session.commit()

    async def upsert_discord_user(
        self,
        *,
        user_id: str,
        display_name: str,
        avatar_url: str | None = None,
        locale: str | None = None,
    ) -> None:
        """Апсерт глобальной личности из Discord-профиля (User не clan-scoped,
        поэтому отдельного bypass здесь не нужно)."""
        user = (
            await self.session.execute(select(User).where(User.id == user_id))
        ).scalar_one_or_none()
        if user is None:
            self.session.add(
                User(
                    id=user_id,
                    display_name=display_name or user_id,
                    # локаль Discord — только стартовое значение; дальше язык
                    # выбирает сам пользователь (PUT /auth/me/locale)
                    preferred_locale=normalize_locale(locale),
                    avatar_url=avatar_url,
                )
            )
            await self.session.flush()   # invite/выбор сервера ищут этого User дальше
            return
        user.display_name = display_name or user.display_name
        user.avatar_url = avatar_url
        if locale and not user.preferred_locale:
            user.preferred_locale = normalize_locale(locale)

    async def resolve_discord_membership(
        self, *, user_id: str, display_name: str, clan_id: str | None  # noqa: ARG002
    ) -> ClanMembership:
        """Резолв кланового контекста для discord-юзера ДО аутентификации:
          * clan_id из state -> строго требовать membership в нём;
          * без clan_id -> последнее активное по created_at;
          * нет ни одного -> 403 user.not_member (вступление — только по
            invite-ссылке, владелец сервера создаёт клан через выбор сервера).
        """
        found = await self._active_membership(user_id, clan_id)
        if found is not None:
            return found
        raise PermissionDeniedError(
            message_key="user.not_member" if clan_id else "user.no_clan",
            domain=DOMAIN,
            params={"user_id": user_id, "clan_id": clan_id or "-"},
        )

    async def _active_membership(self, user_id: str, clan_id: str | None) -> ClanMembership | None:
        stmt = select(ClanMembership).where(
            ClanMembership.user_id == user_id,
            ClanMembership.is_active.is_(True),
        )
        if clan_id:
            stmt = stmt.where(ClanMembership.clan_id == clan_id)
        stmt = stmt.order_by(ClanMembership.created_at.desc(), ClanMembership.id.desc())
        # bypass: клан ещё не известен — это и есть его поиск (core-слой).
        with bypass_clan_filter():
            return (await self.session.execute(stmt.limit(1))).scalars().first()

    # ---------------- выбор сервера клана (владелец Discord-сервера) ------------ #
    async def setup_options(
        self, *, user_id: str, guilds: list[dict]
    ) -> tuple[list[SetupGuildRead], list[SetupMembershipRead]]:
        """Серверы, которыми владеет пользователь (с пометкой «уже клан»),
        и кланы, где он уже состоит."""
        ids = [g["id"] for g in guilds]
        with bypass_clan_filter():
            linked: dict[str, Clan] = {}
            if ids:
                found = await self.session.execute(select(Clan).where(Clan.discord_guild_id.in_(ids)))
                linked = {c.discord_guild_id: c for c in found.scalars() if c.discord_guild_id}
            rows = (
                await self.session.execute(
                    select(ClanMembership, Clan.name)
                    .join(Clan, Clan.id == ClanMembership.clan_id)
                    .where(ClanMembership.user_id == user_id, ClanMembership.is_active.is_(True))
                    .order_by(ClanMembership.created_at.desc())
                )
            ).all()
        options = [
            SetupGuildRead(
                id=g["id"],
                name=g["name"],
                icon_url=g.get("icon_url"),
                clan_id=linked[g["id"]].id if g["id"] in linked else None,
                clan_name=linked[g["id"]].name if g["id"] in linked else None,
            )
            for g in guilds
        ]
        memberships = [
            SetupMembershipRead(clan_id=m.clan_id, clan_name=name, role=m.role) for m, name in rows
        ]
        return options, memberships

    async def claim_guild(
        self, *, user_id: str, display_name: str, guild: dict
    ) -> tuple[ClanMembership, str]:
        """Владелец сервера становится owner клана этого сервера.

        Клан ищется по discord_guild_id; если его нет — к серверу привязывается
        старый клан пользователя без сервера, где он уже owner (перенос данных
        клана, созданного до привязки), иначе создаётся новый клан id = guild id.
        """
        with bypass_clan_filter():
            clan = (
                await self.session.execute(select(Clan).where(Clan.discord_guild_id == guild["id"]))
            ).scalar_one_or_none()
            if clan is None:
                clan = (
                    await self.session.execute(
                        select(Clan)
                        .join(ClanMembership, ClanMembership.clan_id == Clan.id)
                        .where(
                            ClanMembership.user_id == user_id,
                            ClanMembership.role == ClanRole.OWNER,
                            Clan.discord_guild_id.is_(None),
                        )
                        .order_by(Clan.created_at)
                        .limit(1)
                    )
                ).scalars().first()
            if clan is None:
                clan = await self.session.get(Clan, guild["id"])
            if clan is None:
                clan = Clan(id=guild["id"], name=guild["name"] or guild["id"])
                self.session.add(clan)
            clan.discord_guild_id = guild["id"]
            clan.name = guild["name"] or clan.name
            clan.icon_url = guild.get("icon_url")
            clan.is_active = True
            await self.session.flush()

        membership, _ = await self._upsert_identity(
            clan_id=clan.id,
            user_id=user_id,
            display_name=display_name,
            role=ClanRole.OWNER,
            locale=self.t.locale,
        )
        with bypass_clan_filter():
            # Discord подтвердил владение сервером — роль всегда owner
            membership.role = ClanRole.OWNER
            membership.is_active = True
            await self.session.flush()
        return membership, clan.name

    # ---------------- invite-ссылка ---------------------------------------------- #
    async def _invite(self, code_value: str, *, check_usage: bool = True) -> ClanInviteCode:
        now = datetime.now(UTC)
        with bypass_clan_filter():
            code = (
                await self.session.execute(
                    select(ClanInviteCode).where(ClanInviteCode.code == code_value.strip().upper())
                )
            ).scalar_one_or_none()
        if code is None or code.revoked_at is not None:
            raise NotFoundError(message_key="code.invalid", domain=DOMAIN, code="invite_invalid")
        if not check_usage:
            return code
        if code.expires_at is not None and code.expires_at < now:
            raise ConflictError(message_key="code.expired", domain=DOMAIN, code="invite_expired")
        if code.used_count >= code.max_uses:
            raise ConflictError(message_key="code.exhausted", domain=DOMAIN, code="invite_exhausted")
        return code

    async def preview_invite(self, code_value: str) -> InvitePreview:
        code = await self._invite(code_value)
        with bypass_clan_filter():
            clan = await self.session.get(Clan, code.clan_id)
        return InvitePreview(
            code=code.code,
            clan_name=clan.name if clan else code.clan_id,
            clan_icon_url=clan.icon_url if clan else None,
            role=code.role,
        )

    async def redeem_invite(
        self, *, code_value: str, user_id: str, display_name: str
    ) -> tuple[ClanMembership, str]:
        """Discord-пользователь вступает в клан по invite-ссылке. Повторный
        переход уже состоящего участника не тратит использование и не меняет роль."""
        code = await self._invite(code_value, check_usage=False)
        existing = await self._active_membership(user_id, code.clan_id)
        if existing is None:
            await self._invite(code_value)       # срок и лимит — только для новых
        membership, clan_name = await self._upsert_identity(
            clan_id=code.clan_id,
            user_id=user_id,
            display_name=display_name,
            role=code.role,
            locale=self.t.locale,
        )
        if existing is None:
            with bypass_clan_filter():
                membership.is_active = True
                code.used_count += 1
                await self.session.flush()
        return membership, clan_name

    # ---------------- гостевой просмотр ------------------------------------------ #
    def issue_guest_token(self) -> TokenResponse:
        clan_id = settings.GUEST_CLAN_ID or settings.DEFAULT_CLAN_ID
        if not clan_id:
            raise PermissionDeniedError(message_key="guest.disabled", domain=DOMAIN, params={})
        guest_id = f"guest:{secrets.token_hex(6)}"
        token = issue_access_token(
            user_id=guest_id,
            clan_id=clan_id,
            role=ClanRole.GUEST,
            ttl_minutes=settings.GUEST_TOKEN_TTL_MIN,
            guest=True,
        )
        me = MeRead(
            subject_type="guest",
            user_id=guest_id,
            clan_id=clan_id,
            role=ClanRole.GUEST,
            scopes=sorted(scopes_for(ClanRole.GUEST)),
            display_name=None,
        )
        return TokenResponse(
            access_token=token,
            expires_in=settings.GUEST_TOKEN_TTL_MIN * 60,
            me=me,
            message=self.t.t("guest.signed_in", domain=DOMAIN),
        )

    def _issue(self, membership: ClanMembership, user_id: str, display_name: str | None) -> TokenResponse:
        token = issue_access_token(
            user_id=user_id,
            clan_id=membership.clan_id,
            role=membership.role,
            extra_scopes=list(membership.extra_scopes),
            revoked_scopes=list(membership.revoked_scopes),
            display_name=display_name,
        )
        me = MeRead(
            subject_type="user",
            user_id=user_id,
            clan_id=membership.clan_id,
            role=membership.role,
            scopes=sorted(scopes_for(membership.role, membership.extra_scopes, membership.revoked_scopes)),
            display_name=display_name,
        )
        return TokenResponse(
            access_token=token,
            expires_in=settings.ACCESS_TOKEN_TTL_MIN * 60,
            me=me,
            message="",  # заполняется вызывающим с локализованным текстом
        )

    # ---------------- dev-token ------------------------------------------------ #
    async def issue_dev_token(self, payload: DevTokenRequest, locale: str) -> TokenResponse:
        if not payload.upsert:
            with bypass_clan_filter():
                membership = (
                    await self.session.execute(
                        select(ClanMembership).where(
                            ClanMembership.clan_id == payload.clan_id,
                            ClanMembership.user_id == payload.user_id,
                        )
                    )
                ).scalar_one_or_none()
            if membership is None:
                raise NotFoundError(
                    message_key="user.not_member", domain=DOMAIN,
                    params={"user_id": payload.user_id, "clan_id": payload.clan_id},
                )
            response = self._issue(membership, payload.user_id, payload.display_name)
        else:
            membership, _ = await self._upsert_identity(
                clan_id=payload.clan_id,
                user_id=payload.user_id,
                display_name=payload.display_name or payload.user_id,
                role=payload.role,
                locale=locale,
            )
            response = self._issue(membership, payload.user_id, payload.display_name or payload.user_id)
        await self.session.commit()

        response.message = self.t.t("dev.issued", domain=DOMAIN, user_id=payload.user_id)
        return response

    # ---------------- clan api token (owner/admin) ------------------------------ #
    async def create_clan_api_token(
        self, principal, payload: ClanApiTokenCreate  # noqa: ANN001
    ) -> ClanApiTokenCreated:
        if principal.subject_type != "user":
            # защита от цепочек «токен выпускает токены»
            raise PermissionDeniedError(
                message_key="clan_token.users_only", domain=DOMAIN, params={}
            )
        if ROLE_RANK[payload.role] > ROLE_RANK[principal.role]:
            raise PermissionDeniedError(
                message_key="clan_token.role_too_high", domain=DOMAIN,
                params={"role": payload.role.value},
            )

        raw_token = f"sdt_{secrets.token_urlsafe(32)}"
        expires_at = (
            datetime.now(UTC) + timedelta(hours=payload.expires_in_hours)
            if payload.expires_in_hours
            else None
        )
        row = ClanApiToken(
            clan_id=principal.clan_id,
            label=payload.label,
            token_hash=hash_clan_token(raw_token),
            role=payload.role,
            extra_scopes=[],
            expires_at=expires_at,
        )
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)

        return ClanApiTokenCreated(
            id=str(row.id),
            label=row.label,
            role=row.role,
            expires_at=row.expires_at,
            raw_token=raw_token,
            message=self.t.t("clan_token.created", domain=DOMAIN, label=row.label),
        )
