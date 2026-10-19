from __future__ import annotations

from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field


class CatalogItemRead(BaseModel):
    """
    Плоская форма совместима со старым ItemResponse фронта
    (id/name/english_name/icon_url/production_time); id == code.
    clan_id в модели нет — в схеме не появится.
    """
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    english_name: str
    category: str
    icon_url: str | None
    crate_size: int
    production_time: int
    is_active: bool
    faction: str = "neutral"
    origin: str | None = None
    aliases: list[str] = []
    needs_review: bool = False

    @classmethod
    def from_item(cls, item) -> Self:  # noqa: ANN001
        return cls(
            id=item.code,
            code=item.code,
            name=item.name,
            english_name=item.english_name,
            category=item.category,
            icon_url=item.icon_url,
            crate_size=item.crate_size,
            production_time=item.production_time,
            is_active=item.is_active,
            faction=item.faction,
            origin=item.origin,
            aliases=list(item.aliases or []),
            needs_review=item.needs_review,
        )


class ParseRequest(BaseModel):
    """Текст отчёта сканера / сообщения Discord / CSV из XLSX — разбирает сервер."""
    model_config = ConfigDict(extra="forbid")

    text: Annotated[str, Field(min_length=1, max_length=500_000)]


class ResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    names: Annotated[list[Annotated[str, Field(max_length=200)]], Field(max_length=2000)]


class ResolvedName(BaseModel):
    name: str
    item: CatalogItemRead | None


class ParsedLineRead(BaseModel):
    """Строка отчёта: исходное название, количество, единица и найденный предмет каталога."""
    name: str
    count: int
    unit: Literal["crate", "unit"]
    item: CatalogItemRead | None


class ParseResult(BaseModel):
    lines: list[ParsedLineRead]
    matched: int
    unknown: list[str]


class ScanResult(ParseResult):
    file_name: str
    file_size: int
    strict: bool
