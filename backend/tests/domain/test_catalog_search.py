from app.domain.catalog.search import search_catalog
from app.domain.catalog.types import DomainItem

sample_items = [
    DomainItem(id="soldier_supplies", code="SS", name="Солдатские припасы", english_name="Soldier Supplies", category="resources"),
    DomainItem(id="rifle", code="Rifle", name="Винтовка Лоуглен", english_name="Loughcaster", category="small_arms"),
    DomainItem(id="bmat", code="Bmats", name="Базовые материалы", english_name="Basic Materials", category="resources"),
    DomainItem(id="bandage", code="Bandage", name="Бинт", english_name="Bandage", category="medical"),
]


def test_search_by_exact_code():
    res = search_catalog(sample_items, query="SS")
    assert len(res) >= 1
    assert res[0].id == "soldier_supplies"


def test_search_by_russian_name():
    res = search_catalog(sample_items, query="Винтовка")
    assert len(res) == 1
    assert res[0].id == "rifle"


def test_search_by_category():
    res = search_catalog(sample_items, category="resources")
    assert len(res) == 2
    assert {i.id for i in res} == {"soldier_supplies", "bmat"}


def test_search_empty_query_returns_all():
    res = search_catalog(sample_items, query="")
    assert len(res) == len(sample_items)