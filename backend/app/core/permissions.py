from __future__ import annotations

from collections.abc import Iterable
from enum import StrEnum
from typing import Final, FrozenSet


class ClanRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    OFFICER = "officer"
    MEMBER = "member"
    GUEST = "guest"


# --- справочник прав (единая точка правды) --------------------------------- #
class Scopes:
    """Каждое право — одно действие на сайте. Командир собирает из них кастомный
    доступ роли Discord; пресеты уровней ниже повторяют прежнее поведение ролей."""
    # склады
    STOCKPILES_READ: Final = "stockpiles:read"        # просмотр складов и содержимого
    STOCKPILES_CREATE: Final = "stockpiles:create"    # создать склад
    STOCKPILES_EDIT: Final = "stockpiles:edit"        # переименовать / сменить гекс
    STOCKPILES_DELETE: Final = "stockpiles:delete"    # удалить склад
    STOCKPILES_ITEMS: Final = "stockpiles:items"      # загрузить / изменить / очистить содержимое
    # рапорты и заказы
    REPORTS_READ: Final = "reports:read"              # текущие заказы клана
    REPORTS_CREATE: Final = "reports:create"          # отправить рапорт из конструктора
    REPORTS_STATUS: Final = "reports:status"          # в работу / выполнен / отменён
    REPORTS_EDIT: Final = "reports:edit"              # править рапорт
    REPORTS_DELETE: Final = "reports:delete"          # удалить рапорт
    REPORTS_DISCORD: Final = "reports:discord"        # отправить рапорт в канал Discord
    # таймеры
    TIMERS_READ: Final = "timers:read"                # матрица таймеров, бегущая строка
    TIMERS_CREATE: Final = "timers:create"            # поставить склад на мониторинг
    TIMERS_UPDATE: Final = "timers:update"            # сбросить на 48 ч / задать время / завершить
    TIMERS_LOG: Final = "timers:log"                  # заметки в журнал склада
    TIMERS_DELETE: Final = "timers:delete"            # снять с мониторинга
    # каталог и инструменты
    CATALOG_READ: Final = "catalog:read"              # база кодов, калькуляторы
    # клан
    CLAN_MEMBERS_READ: Final = "clan:members:read"    # (резерв) список участников
    CLAN_WEBHOOK: Final = "clan:webhook"              # канал Discord для рапортов
    CLAN_TOKENS: Final = "clan:tokens"                # API-токены для ботов
    CLAN_CONTENT: Final = "clan:content"              # общий контент сайта (видео, ссылки, обучение)


# Каталог для вкладки «Управление»: группы и порядок действий.
PERMISSION_GROUPS: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    ("stockpiles", (Scopes.STOCKPILES_READ, Scopes.STOCKPILES_CREATE, Scopes.STOCKPILES_EDIT,
                    Scopes.STOCKPILES_DELETE, Scopes.STOCKPILES_ITEMS)),
    ("reports", (Scopes.REPORTS_READ, Scopes.REPORTS_CREATE, Scopes.REPORTS_STATUS, Scopes.REPORTS_EDIT,
                 Scopes.REPORTS_DELETE, Scopes.REPORTS_DISCORD)),
    ("timers", (Scopes.TIMERS_READ, Scopes.TIMERS_CREATE, Scopes.TIMERS_UPDATE, Scopes.TIMERS_LOG,
                Scopes.TIMERS_DELETE)),
    ("catalog", (Scopes.CATALOG_READ,)),
    ("clan", (Scopes.CLAN_WEBHOOK, Scopes.CLAN_TOKENS, Scopes.CLAN_CONTENT)),
)
ALL_PERMISSIONS: Final[frozenset[str]] = frozenset(p for _, group in PERMISSION_GROUPS for p in group)

_GUEST: FrozenSet[str] = frozenset({
    Scopes.STOCKPILES_READ, Scopes.REPORTS_READ, Scopes.TIMERS_READ, Scopes.CATALOG_READ,
})

_MEMBER: FrozenSet[str] = _GUEST | frozenset({
    Scopes.STOCKPILES_CREATE, Scopes.STOCKPILES_EDIT, Scopes.STOCKPILES_DELETE, Scopes.STOCKPILES_ITEMS,
    Scopes.REPORTS_CREATE, Scopes.REPORTS_STATUS, Scopes.REPORTS_EDIT, Scopes.REPORTS_DISCORD,
})

_OFFICER: FrozenSet[str] = _MEMBER | frozenset({
    Scopes.REPORTS_DELETE, Scopes.TIMERS_CREATE, Scopes.TIMERS_UPDATE, Scopes.TIMERS_LOG,
    Scopes.TIMERS_DELETE, Scopes.CLAN_MEMBERS_READ,
})

ROLE_SCOPES: Final[dict[ClanRole, FrozenSet[str]]] = {
    ClanRole.GUEST: _GUEST,
    ClanRole.MEMBER: _MEMBER,
    ClanRole.OFFICER: _OFFICER,
    ClanRole.ADMIN: _OFFICER | frozenset({Scopes.CLAN_WEBHOOK, Scopes.CLAN_TOKENS, Scopes.CLAN_CONTENT}),
    ClanRole.OWNER: frozenset({"*"}),   # wildcard
}


def scopes_for(
    role: ClanRole,
    extra: Iterable[str] = (),
    revoked: Iterable[str] = (),
) -> FrozenSet[str]:
    """Роль + точечные гранты/отзывы (persisted в clan_memberships)."""
    return frozenset(ROLE_SCOPES.get(role, frozenset()) | set(extra)) - set(revoked)


def _matches(granted: str, required: str) -> bool:
    if granted == "*" or granted == required:
        return True
    if granted.endswith(":*"):                      # "orders:*"
        return required.startswith(granted[:-1])
    return False


def has_scope(granted: Iterable[str], required: str) -> bool:
    return any(_matches(g, required) for g in granted)


def missing_scopes(granted: Iterable[str], required: Iterable[str]) -> list[str]:
    granted = list(granted)
    return [r for r in required if not has_scope(granted, r)]
