from __future__ import annotations

import contextlib
from collections.abc import Iterator
from contextvars import ContextVar, Token
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.core.errors import ClanContextMissingError, ClanScopeViolationError
from app.models.base import ClanScopedMixin

SKIP_CLAN_FILTER = "skip_clan_filter"

_clan_id_ctx: ContextVar[str | None] = ContextVar("sandalis_clan_id", default=None)
_bypass_ctx: ContextVar[bool] = ContextVar("sandalis_clan_bypass", default=False)


# --------------------------------------------------------------------------- #
# Публичное API контекста
# --------------------------------------------------------------------------- #
def get_current_clan_id() -> str | None:
    return _clan_id_ctx.get()


def set_current_clan_id(clan_id: str | None) -> Token[str | None]:
    return _clan_id_ctx.set(clan_id)


def reset_current_clan_id(token: Token[str | None]) -> None:
    _clan_id_ctx.reset(token)


@contextlib.contextmanager
def clan_scope(clan_id: str) -> Iterator[None]:
    """Для фоновых задач / APScheduler / CLI: `with clan_scope("ABC"): ...`"""
    token = _clan_id_ctx.set(clan_id)
    try:
        yield
    finally:
        _clan_id_ctx.reset(token)


@contextlib.contextmanager
def bypass_clan_filter() -> Iterator[None]:
    """
    Аварийный люк: миграции данных, аутентификация по clan-token, cross-clan
    аналитика суперадмина. Использовать ТОЛЬКО в core/ и admin-сервисах.
    """
    token = _bypass_ctx.set(True)
    try:
        yield
    finally:
        _bypass_ctx.reset(token)


def bind_session_to_clan(session: Session | Any, clan_id: str) -> None:
    """
    Жёсткая привязка сессии к клану. Надёжнее ContextVar (не зависит от того,
    в каком контексте/threadpool выполняется код) — используется в Depends.
    """
    sync_session = getattr(session, "sync_session", session)
    sync_session.info["clan_id"] = clan_id


# --------------------------------------------------------------------------- #
# Внутреннее
# --------------------------------------------------------------------------- #
def _session_clan_id(session: Session) -> str | None:
    return session.info.get("clan_id") or _clan_id_ctx.get()


def _is_bypassed(session: Session, execution_options: dict[str, Any] | None = None) -> bool:
    if _bypass_ctx.get():
        return True
    if session.info.get(SKIP_CLAN_FILTER):
        return True
    return bool((execution_options or {}).get(SKIP_CLAN_FILTER))


def _touches_clan_scoped(state: ORMExecuteState) -> bool:
    return any(issubclass(m.class_, ClanScopedMixin) for m in state.all_mappers)


# --------------------------------------------------------------------------- #
# 1) ЧТЕНИЕ / ORM UPDATE / ORM DELETE: инъекция WHERE clan_id = :clan_id
# --------------------------------------------------------------------------- #
@event.listens_for(Session, "do_orm_execute")
def _apply_clan_criteria(state: ORMExecuteState) -> None:
    # refresh()/подгрузка deferred-колонок уже работает по PK загруженного
    # объекта — фильтр там только сломает expire_on_commit.
    if state.is_column_load:
        return
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if not _touches_clan_scoped(state):
        return
    if _is_bypassed(state.session, dict(state.execution_options)):
        return

    clan_id = _session_clan_id(state.session)
    if clan_id is None:
        # Fail-closed: лучше 500 в логах, чем утечка данных чужого клана.
        raise ClanContextMissingError()

    state.statement = state.statement.options(
        with_loader_criteria(
            ClanScopedMixin,
            # closure-переменная clan_id автоматически становится bound-param,
            # поэтому кэш скомпилированных запросов SQLAlchemy не ломается.
            lambda cls: cls.clan_id == clan_id,
            include_aliases=True,      # покрывает aliased() и self-joins
            propagate_to_loaders=True, # покрывает lazy/selectin подгрузки
        )
    )


# --------------------------------------------------------------------------- #
# 2) ЗАПИСЬ: автоподстановка clan_id + запрет кросс-клановых мутаций
# --------------------------------------------------------------------------- #
@event.listens_for(Session, "before_flush")
def _enforce_clan_on_flush(session: Session, flush_context: Any, instances: Any) -> None:
    if _is_bypassed(session):
        return

    clan_id = _session_clan_id(session)

    for obj in session.new:
        if not isinstance(obj, ClanScopedMixin):
            continue
        current = getattr(obj, "clan_id", None)
        if current is None:
            if clan_id is None:
                raise ClanContextMissingError()
            obj.clan_id = clan_id          # ← сервисам не нужно помнить про clan_id
        elif clan_id is not None and current != clan_id:
            raise ClanScopeViolationError(params={"entity": type(obj).__name__})

    for obj in session.dirty:
        if not isinstance(obj, ClanScopedMixin):
            continue
        if not session.is_modified(obj, include_collections=False):
            continue
        history = inspect(obj).attrs.clan_id.history
        if history.has_changes():          # «угон» строки в другой клан
            raise ClanScopeViolationError(params={"entity": type(obj).__name__})
        if clan_id is not None and obj.clan_id != clan_id:
            raise ClanScopeViolationError(params={"entity": type(obj).__name__})

    for obj in session.deleted:
        if isinstance(obj, ClanScopedMixin) and clan_id is not None and obj.clan_id != clan_id:
            raise ClanScopeViolationError(params={"entity": type(obj).__name__})
