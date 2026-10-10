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
    ORDERS_READ: Final = "orders:read"
    ORDERS_WRITE: Final = "orders:write"
    ORDERS_DELETE: Final = "orders:delete"
    STOCKPILES_READ: Final = "stockpiles:read"
    STOCKPILES_WRITE: Final = "stockpiles:write"
    TIMERS_READ: Final = "timers:read"
    TIMERS_WRITE: Final = "timers:write"
    CATALOG_READ: Final = "catalog:read"
    CLAN_MEMBERS_READ: Final = "clan:members:read"
    CLAN_MEMBERS_WRITE: Final = "clan:members:write"
    CLAN_SETTINGS_WRITE: Final = "clan:settings:write"


_MEMBER: FrozenSet[str] = frozenset({
    Scopes.ORDERS_READ, Scopes.ORDERS_WRITE,
    Scopes.STOCKPILES_READ, Scopes.STOCKPILES_WRITE,
    Scopes.TIMERS_READ, Scopes.CATALOG_READ,
})

_OFFICER: FrozenSet[str] = _MEMBER | frozenset({
    Scopes.ORDERS_DELETE, Scopes.TIMERS_WRITE, Scopes.CLAN_MEMBERS_READ,
})

ROLE_SCOPES: Final[dict[ClanRole, FrozenSet[str]]] = {
    ClanRole.GUEST: frozenset({
        Scopes.ORDERS_READ, Scopes.STOCKPILES_READ,
        Scopes.TIMERS_READ, Scopes.CATALOG_READ,
    }),
    ClanRole.MEMBER: _MEMBER,
    ClanRole.OFFICER: _OFFICER,
    ClanRole.ADMIN: _OFFICER | frozenset({
        Scopes.CLAN_MEMBERS_WRITE, Scopes.CLAN_SETTINGS_WRITE,
    }),
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
