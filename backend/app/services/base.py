from __future__ import annotations

from typing import Any, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ClanContextMissingError, NotFoundError
from app.core.i18n import Translator
from app.core.security import Principal
from app.core.tenancy import bind_session_to_clan
from app.models.base import Base, ClanScopedMixin

ModelT = TypeVar("ModelT", bound=Base)


class ClanScopedService:
    """
    База для всех доменных сервисов.

    Три уровня защиты:
      1) глобальный `with_loader_criteria` (app/core/tenancy.py);
      2) явный `.where(Model.clan_id == ...)` в `_scoped()` — защита от
         «сырых» Core-запросов, где ORM-событие не сработает;
      3) `before_flush`-гвард на запись.
    """

    def __init__(self, session: AsyncSession, principal: Principal, translator: Translator) -> None:
        if not principal.clan_id:
            raise ClanContextMissingError()
        self.session = session
        self.principal = principal
        self.clan_id = principal.clan_id
        self.t = translator
        bind_session_to_clan(session, self.clan_id)

    # --- helpers ---------------------------------------------------------- #
    def _scoped(self, stmt: Select[Any], model: type[ClanScopedMixin]) -> Select[Any]:
        return stmt.where(model.clan_id == self.clan_id)

    async def _get_scoped(
        self,
        model: type[ModelT],
        pk: Any,
        *,
        not_found_key: str,
        domain: str,
        params: dict[str, Any] | None = None,
        for_update: bool = False,
    ) -> ModelT:
        """
        Вместо session.get(): identity map может вернуть объект чужого клана
        без SELECT, поэтому всегда идём через select() с явным clan_id.
        """
        stmt = select(model).where(model.id == pk, model.clan_id == self.clan_id)  # type: ignore[attr-defined]
        if for_update:
            stmt = stmt.with_for_update()
        obj = (await self.session.execute(stmt)).scalar_one_or_none()
        if obj is None:
            raise NotFoundError(message_key=not_found_key, domain=domain, params=params or {})
        return obj

    async def _count(self, stmt: Select[Any]) -> int:
        subq = stmt.order_by(None).options().subquery()
        return int(
            (await self.session.execute(select(func.count()).select_from(subq))).scalar_one()
        )
