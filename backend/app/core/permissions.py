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
    STOCKPILES_CODES: Final = "stockpiles:codes"      # видеть пароли (коды доступа) складов
    # пирамида снабжения клана
    PYRAMID_READ: Final = "pyramid:read"              # смотреть пирамиды клана
    PYRAMID_CREATE: Final = "pyramid:create"          # добавить свою пирамиду клана
    PYRAMID_EDIT: Final = "pyramid:edit"              # изменить пирамиду клана
    PYRAMID_DELETE: Final = "pyramid:delete"          # удалить пирамиду клана
    # прежнее единое право на пирамиду — раскрывается в create/edit/delete (LEGACY_SCOPES)
    STOCKPILES_PYRAMID: Final = "stockpiles:pyramid"
    # рапорты и заказы
    REPORTS_READ: Final = "reports:read"              # текущие заказы клана
    REPORTS_CREATE: Final = "reports:create"          # отправить рапорт из конструктора
    REPORTS_STATUS: Final = "reports:status"          # в работу / выполнен / отменён
    REPORTS_EDIT: Final = "reports:edit"              # править рапорт
    REPORTS_DELETE: Final = "reports:delete"          # удалить рапорт
    REPORTS_DISCORD: Final = "reports:discord"        # отправить рапорт в канал Discord
    REPORTS_PROGRESS: Final = "reports:progress"      # сообщить о выполнении части заказа
    REPORTS_ASSIGN: Final = "reports:assign"          # исполнители, приоритет, срок, теги, операция
    REPORTS_TAKE: Final = "reports:take"              # «взять себе» (и кнопка в Discord)
    REPORTS_COMMENT: Final = "reports:comment"        # комментарии в ленте заказа
    # операции клана
    OPERATIONS_READ: Final = "operations:read"        # календарь операций
    OPERATIONS_CREATE: Final = "operations:create"    # создать операцию, отправить снимки из планировщика
    OPERATIONS_ATTEND: Final = "operations:attend"    # отмечаться в опросе явки
    OPERATIONS_MANAGE: Final = "operations:manage"    # править и удалять чужие операции
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
    CLAN_CONTENT: Final = "clan:content"              # общий контент сайта (видео, ссылки)
    CLAN_STATS: Final = "clan:stats"                  # статистика клана
    CLAN_TRAINING: Final = "clan:training"            # курсы клана в «Обучении»
    CLAN_EVERYONE: Final = "clan:everyone"            # упоминать @everyone (письмо всему клану)


# Каталог для вкладки «Управление»: группы и порядок действий.
PERMISSION_GROUPS: Final[tuple[tuple[str, tuple[str, ...]], ...]] = (
    ("stockpiles", (Scopes.STOCKPILES_READ, Scopes.STOCKPILES_CREATE, Scopes.STOCKPILES_EDIT,
                    Scopes.STOCKPILES_DELETE, Scopes.STOCKPILES_ITEMS, Scopes.STOCKPILES_CODES)),
    ("pyramid", (Scopes.PYRAMID_READ, Scopes.PYRAMID_CREATE, Scopes.PYRAMID_EDIT, Scopes.PYRAMID_DELETE)),
    ("reports", (Scopes.REPORTS_READ, Scopes.REPORTS_CREATE, Scopes.REPORTS_STATUS, Scopes.REPORTS_ASSIGN,
                 Scopes.REPORTS_TAKE, Scopes.REPORTS_COMMENT, Scopes.REPORTS_EDIT, Scopes.REPORTS_DELETE,
                 Scopes.REPORTS_DISCORD, Scopes.REPORTS_PROGRESS)),
    ("operations", (Scopes.OPERATIONS_READ, Scopes.OPERATIONS_CREATE, Scopes.OPERATIONS_ATTEND,
                    Scopes.OPERATIONS_MANAGE)),
    ("timers", (Scopes.TIMERS_READ, Scopes.TIMERS_CREATE, Scopes.TIMERS_UPDATE, Scopes.TIMERS_LOG,
                Scopes.TIMERS_DELETE)),
    ("catalog", (Scopes.CATALOG_READ,)),
    ("clan", (Scopes.CLAN_STATS, Scopes.CLAN_TRAINING, Scopes.CLAN_EVERYONE, Scopes.CLAN_WEBHOOK,
              Scopes.CLAN_TOKENS, Scopes.CLAN_CONTENT)),
)
# снятые с каталога права: старые роли и токены продолжают работать
LEGACY_SCOPES: Final[dict[str, tuple[str, ...]]] = {
    Scopes.STOCKPILES_PYRAMID: (Scopes.PYRAMID_CREATE, Scopes.PYRAMID_EDIT, Scopes.PYRAMID_DELETE),
}
ALL_PERMISSIONS: Final[frozenset[str]] = frozenset(p for _, group in PERMISSION_GROUPS for p in group)

_GUEST: FrozenSet[str] = frozenset({
    Scopes.STOCKPILES_READ, Scopes.REPORTS_READ, Scopes.TIMERS_READ, Scopes.CATALOG_READ,
    Scopes.PYRAMID_READ, Scopes.REPORTS_TAKE, Scopes.OPERATIONS_READ, Scopes.OPERATIONS_ATTEND,
    Scopes.CLAN_STATS,
})

_MEMBER: FrozenSet[str] = _GUEST | frozenset({
    Scopes.STOCKPILES_CREATE, Scopes.STOCKPILES_EDIT, Scopes.STOCKPILES_DELETE, Scopes.STOCKPILES_ITEMS,
    Scopes.STOCKPILES_CODES, Scopes.REPORTS_CREATE, Scopes.REPORTS_STATUS, Scopes.REPORTS_ASSIGN,
    Scopes.REPORTS_COMMENT, Scopes.REPORTS_EDIT, Scopes.REPORTS_DISCORD, Scopes.REPORTS_PROGRESS,
    Scopes.OPERATIONS_CREATE,
})

_OFFICER: FrozenSet[str] = _MEMBER | frozenset({
    Scopes.REPORTS_DELETE, Scopes.TIMERS_CREATE, Scopes.TIMERS_UPDATE, Scopes.TIMERS_LOG,
    Scopes.TIMERS_DELETE, Scopes.CLAN_MEMBERS_READ, Scopes.PYRAMID_CREATE, Scopes.PYRAMID_EDIT,
    Scopes.PYRAMID_DELETE, Scopes.CLAN_EVERYONE,
})

# Уровень «Базовый» роли Discord (по умолчанию для всех ролей сервера): роль терминала —
# участник, но права — только этот набор (остальное из пресета участника снимается).
BASIC_PRESET: Final[FrozenSet[str]] = frozenset({
    Scopes.STOCKPILES_READ, Scopes.PYRAMID_READ, Scopes.OPERATIONS_ATTEND,
    Scopes.CATALOG_READ, Scopes.CLAN_STATS, Scopes.CLAN_TRAINING,
})

ROLE_SCOPES: Final[dict[ClanRole, FrozenSet[str]]] = {
    ClanRole.GUEST: _GUEST,
    ClanRole.MEMBER: _MEMBER,
    ClanRole.OFFICER: _OFFICER,
    ClanRole.ADMIN: _OFFICER | frozenset({Scopes.CLAN_WEBHOOK, Scopes.CLAN_TOKENS, Scopes.CLAN_CONTENT,
                                          Scopes.CLAN_TRAINING, Scopes.OPERATIONS_MANAGE}),
    ClanRole.OWNER: frozenset({"*"}),   # wildcard
}


def scopes_for(
    role: ClanRole,
    extra: Iterable[str] = (),
    revoked: Iterable[str] = (),
) -> FrozenSet[str]:
    """Роль + точечные гранты/отзывы (persisted в clan_memberships)."""
    return frozenset(ROLE_SCOPES.get(role, frozenset()) | expand_legacy(extra)) - expand_legacy(revoked)


def expand_legacy(scopes: Iterable[str]) -> set[str]:
    """Снятые права (LEGACY_SCOPES) → их замена в нынешнем каталоге."""
    out: set[str] = set()
    for s in scopes:
        out.update(LEGACY_SCOPES.get(s, (s,)))
    return out


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
