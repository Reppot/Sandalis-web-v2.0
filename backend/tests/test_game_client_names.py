"""Unit: названия предметов из выгрузок сканера русского клиента Foxhole резолвятся в каталог.

Список — реальные строки сканера (без координат и названий складов). Если игра
переименует предмет, тест покажет, какой алиас добавить в seed/data/catalog.json.
"""
from __future__ import annotations

from app.domain.catalog.resolve import CatalogIndex
from app.seed import load

GAME_CLIENT_NAMES = [
    "7.92-мм",
    "Осколочная граната A3 Harpa",
    "Clancy Cinder M3",
    "7.62-мм",
    "Дробь",
    "Пистолет-пулемет No.1 “The Liar”",
    "Пистолет-пулемет Fiddler Model 868",
    "Противотанковое ружье Neville",
    "14.5mm",
    "Дымовая граната PT-815",
    "Газовая граната",
    "Malone Ratcatcher MK.1",
    "12.7-мм",
    "Осветительный Минометный Снаряд",
    "Осколочный минометный снаряд",
    "Минометный Снаряд",
    "B2 Varsi Anti-Tank Grenade",
    "Mammon 91-b",
    "РПГ",
    "950-70b Зенитный снаряд",
    "20мм",
    "Огнемётное топливо",
    "3C-Фугасная ракета",
    "Зенитный снаряд “Absol”",
    "120-мм",
    "Naval Buoy",
    "68мм",
    "Колючая проволока",
    "Buckhorn CCQ-18",
    "Бинокль",
    "Хавок Заряд",
    "Набор для прослушивания",
    "Металлическая балка",
    "Мешок с песком",
    "Кувалда",
    "Гаечный ключ",
    "Вода",
    "Противогаз",
    "Фильтр для противогаза",
    "Подствольный гранатомёт",
    "Рация",
    "Реанимационный набор",
    "Солдатское снаряжение",
    "Дизель",
    "Тяжелое топливо",
    "Бензин",
    "Базовые материалы",
    "Порох",
    "Гравий",
    "Припасы Обслуживания",
    "Шинель специалиста",
    "Стальная кираса",
    "Сапёрное снаряжение",
    "Куртка врача",
    "Gentleman’s Peacoat",
    "Дозорная мантия",
    "Парка Caoivish",
    "Стеганный Комбинезон",
    "Dunne Dousing Engine 3r",
    "O’Brien v.200 Squire",
    "O’Brien V.190 Knave",
    "O’Brien V.113 Gravekeeper",
    "Dunne Caravaner 2f",
    "Duncan’s Coin 14.5mm",
    "Balfour Rampart 68-мм",
    "Collins орудие 68-мм",
    "Бортовой грузовик BMS - Packmule",
    "BMS - Ironship",
    "Das Krokodil by VAC",
    "Mulloy LPC",
    "68A-4 Ronan Fathomer",
    "Devitt Ironhide Mk. IV",
    "Rinnspeir Ornitier-Class Gunship",
    "Bellweather by VAC",
    "Kivela Power Wheel 80-1",
    "Drummond Loscann 55c",
    "Drummond 100a",
    "Rooster - Junkwagon",
    "Dunne Leatherback 2a",
    "Dunne Fuelrunner 2d",
    "Самосвал Dunne Loadlugger 3c",
    "Dunne Transport",
    "Sharkey-Devitt Birdeater Mk. I",
    "Leary Snare Trap 20",
    "Huber Lariat 120мм",
    "Жидкостный контейнер",
    "Поддон для материалов",
    "Контейнер для ресурсов",
    "Грузовой контейнер",
    "Штурмовая винтовка Booker Model 838",
    "Штурмовая винтовка Aalto 24",
    "Malone MK.2",
    "Cometa T2-9",
    "Автоматическая винтовка Sampo 77",
    "No.2B Hawthorne",
    "No.2 Loughcaster",
    "9-мм",
    "Booker Greyhound Model 910",
    "РПГ \"Carnyx\"",
    "Бронебойный/РПГ",
    "Bonesaw MK.3",
    "Бронебойный навесной/РПГ",
    "Willow’s Bane Model 845",
    "30мм",
    "Миномёт Cremari",
    "Противотанковая липкая бомба",
    "Cutler Foebreaker",
    "Cutler Launcher 4",
    "150-мм",
    "Торпеда \"Quillback\"",
    "250mm “Purity” Shell",
    "E681-B Hullbreaker Mine",
    "40-мм",
    "Рюкзак Десантника",
    "Радиорюкзак",
    "Лопата",
    "Тренога",
    "Ведро для воды",
    "Маска пилота",
    "Бинты",
    "Набор Первой Помощи",
    "Алюминиевый сплав",
    "Тяжёлый порох",
    "Рафинированные материалы",
    "Dunne Responder 3e",
    "O’Brien V.101 Freeman",
    "O’Brien V.130 Wild Jack",
    "O’Brien V.121 Highlander",
    "O’Brien V.110",
    "Swallowtail 988/127-2",
    "Balfour Falconer 250-мм",
    "81f-f Ronan Blackguard",
    "74b-1 Ronan Gunship",
    "Полугусеничный Бронетранспортер Niska Mk. I",
    "BMS - Scrap Hauler",
    "Rycker 4/3-F Wasp Nest",
    "King Gallant Mk. II",
    "Dunne Landrunner 12c",
    "BMS - Universal Assembly Rig",
    "Мобильный автокран БМС 2 класса",
    "Noble Widow MK. XIV",
    "Devitt Mk. III",
    "Gallagher Brigand Mk. I",
    "Silverhand - Mk. IV",
    "Rooster - Tumblebox",
    "Строительное оборудование",
    "Leary AA-70 Bolas",
    "Leary Shellbore 68-мм",
    "Корабельная обшивка корпуса",
    "Cascadier 873",
    "8-мм",
    "Хангман 757",
    ".44 Магнум",
    "Blakerow 871",
    "No.4 The Pillory Scattergun",
    "228 Satterley Heavy Storm Rifle",
    "Станковый Bonesaw MK.3",
    "Станковый Fissura gd.I",
    "Зажигательный минометный снаряд",
    "Граната BF5 White Ash Flask",
    "Сирена воздушной тревоги",
    "Топливо для Willow's Bane",
    "Crow’s Foot Mine",
    "Falias Raiding Club",
    "Детонатор Хавок Заряда",
    "Alligator Charge",
    "Eleos Infantry Dagger",
    "Ветроуказатель",
    "Плазма",
    "Реактивный миномет T13 “Deioneus”",
    "DAE 3b-2 “Hades’ Net”",
    "Разрушающая ракета",
    "BMS - Aquatipper",
    "Cnute Cliffwrest",
    "Граната Bomastone",
    "Автоматическая винтовка Catena rt.IV",
    "Винтовка Argenti r.II",
    "Fuscina pi.I",
    "“The Pitch Gun” mc.V",
    "“Lionclaw” mc.VIII",
    "“Typhon” ra.XII",
    "Lamentum mm.IV",
    "Daucus isg.III",
    "Ignifist 30",
    "Топливо “Molten Wind” v.II",
]


class _Item:
    def __init__(self, row: dict) -> None:
        self.code = row["code"]
        self.name = row["name"]
        self.english_name = row["english_name"]
        self.aliases = row["aliases"] or []


def test_scanner_names_resolve_to_catalog():
    index = CatalogIndex.build(_Item(r) for r in load("catalog.json") if r.get("is_active", True))
    missing = [name for name in GAME_CLIENT_NAMES if index.resolve(name) is None]
    assert missing == []


def test_field_guns_are_not_shells():
    index = CatalogIndex.build(_Item(r) for r in load("catalog.json"))
    assert index.resolve("Balfour Rampart 68-мм") == "FieldATDamageW"
    assert index.resolve("Collins орудие 68-мм") == "FieldATW"
    assert index.resolve("68мм") == "ATAmmo"
    assert index.resolve("Бортовой грузовик BMS - Packmule") == "FlatbedTruck"


def test_havoc_alligator_fissura_are_not_swapped():
    index = CatalogIndex.build(_Item(r) for r in load("catalog.json"))
    assert index.resolve("Хавок Заряд") == "ExplosiveTripod"
    assert index.resolve("Детонатор Хавок Заряда") == "SatchelChargeT"
    assert index.resolve("Alligator Charge") == "SatchelChargeW"
    assert index.resolve("Станковый Fissura gd.I") == "GrenadeLauncherTC"
    assert index.resolve("Bonesaw MK.3") == "ATRPGW"
    assert index.resolve("Станковый Bonesaw MK.3") == "ATRPGTW"


def test_type_prefix_rule_without_aliases():
    """«Граната X» / «Винтовка X» находят предмет по началу английского названия;
    неоднозначное и «Станковый …» — нет (станковая версия — другой предмет)."""
    rows = [{**r, "aliases": []} for r in load("catalog.json")]
    index = CatalogIndex.build(_Item(r) for r in rows)
    assert index.resolve("Граната Bomastone") == "GrenadeC"
    assert index.resolve("Автоматическая винтовка Catena rt.IV") == "RifleAutomaticC"
    assert index.resolve("Винтовка Argenti r.II") == "RifleC"
    assert index.resolve("Топливо “Molten Wind” v.II") is None
    assert index.resolve("Станковый Bonesaw MK.3") is None
