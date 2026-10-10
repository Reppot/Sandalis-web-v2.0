"""
Тест изоляции арендаторов — security-инвариант. Если он падает,
релиз запрещён: один клан мог бы увидеть/изменить данные другого.

NOTE: `clan_scope()` / `bypass_clan_filter()` — синхронные contextmanager'ы,
их нельзя перечислять через запятую в `async with` (там нужен __aenter__).
Вкладываем отдельным блоком `with` внутрь.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select, update

from app.core.db import AsyncSessionLocal
from app.core.errors import ClanContextMissingError, ClanScopeViolationError
from app.core.tenancy import bypass_clan_filter, clan_scope
from app.models.order import Order
from tests.conftest import run, seed_catalog_item, seed_clan


def test_clan_a_cannot_see_modify_or_hijack_clan_b(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", "Bravo")
        await seed_catalog_item()

        # запись в CLAN_A: clan_id проставляется автоматически контекстом
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_A"):
                order = Order(title="A-order", item_code="rifle", quantity=1, created_by="u1")
                s.add(order)
                await s.commit()
                oid = order.id
                assert order.clan_id == "CLAN_A"          # before_flush автозаполнил

        # чтение из CLAN_B: глобальный with_loader_criteria -> пусто
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_B"):
                rows = (await s.execute(select(Order))).scalars().all()
                assert rows == []

        # ORM UPDATE из CLAN_B по чужому PK: фильтр превращает его в no-op
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_B"):
                result = await s.execute(
                    update(Order).where(Order.id == oid).values(title="hijacked")
                )
                await s.commit()
                assert result.rowcount == 0

        # в CLAN_A данные не пострадали
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_A"):
                row = (await s.execute(select(Order))).scalar_one()
                assert row.title == "A-order"

        # прямой «угон»: вставка строки с clan_id другого клана -> инцидент
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_B"):
                with pytest.raises(ClanScopeViolationError):
                    s.add(Order(clan_id="CLAN_A", title="hijack",
                                item_code="rifle", quantity=1, created_by="u2"))
                    await s.flush()

        # без контекста клана — fail-closed, а не утечка
        async with AsyncSessionLocal() as s:
            with pytest.raises(ClanContextMissingError):
                await s.execute(select(Order))

        # bypass для core-сценариев видит всё (и только он)
        async with AsyncSessionLocal() as s:
            with bypass_clan_filter():
                assert len((await s.execute(select(Order))).scalars().all()) == 1

    run(main())


def test_clan_b_never_sees_a_in_listings(db):
    async def main() -> None:
        await seed_clan("CLAN_A")
        await seed_clan("CLAN_B", "Bravo")
        await seed_catalog_item()
        for clan in ("CLAN_A", "CLAN_A", "CLAN_B"):
            async with AsyncSessionLocal() as s:
                with clan_scope(clan):
                    s.add(Order(title=f"o-{clan}", item_code="rifle",
                                quantity=1, created_by="u"))
                    await s.commit()

        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_A"):
                assert len((await s.execute(select(Order))).scalars().all()) == 2
        async with AsyncSessionLocal() as s:
            with clan_scope("CLAN_B"):
                assert len((await s.execute(select(Order))).scalars().all()) == 1

    run(main())
