#!/usr/bin/env node
/**
 * Одноразовый перенос номенклатуры и контента из старого сайта (Reppot/Sandalis-Web)
 * в JSON-сиды бэкенда: backend/app/seed/data/*.json.
 *
 * Старый проект держал данные в TypeScript-модулях фронтенда (ADR-0003). Здесь они
 * транспилируются компилятором TypeScript из frontend/node_modules и выгружаются
 * как есть — без ручного копирования, чтобы не потерять ни одного кода/рецепта.
 *
 * Запуск (из корня репозитория):
 *   node backend/scripts/convert_legacy_seed.mjs <путь-к-клону-Sandalis-Web>
 * После — `python -m app.seed` (из backend/) заливает сиды в БД идемпотентно.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const legacyRoot = path.resolve(process.argv[2] ?? "");
if (!process.argv[2] || !fs.existsSync(path.join(legacyRoot, "src", "lib", "itemCodes.ts"))) {
  console.error("usage: node backend/scripts/convert_legacy_seed.mjs <path-to-Sandalis-Web>");
  process.exit(1);
}

const require = createRequire(path.join(repoRoot, "frontend", "package.json"));
const ts = require("typescript");

// ---------------------------------------------------------------- transpile
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sandalis-legacy-"));
const SOURCES = {
  "lib/itemCodes.ts": "itemCodes",
  "lib/item-catalog.ts": "itemCatalog",
  "lib/item-icon-overrides.ts": "iconOverrides",
  "lib/foxhole-data.ts": "foxholeData",
  "lib/factory-data.ts": "factoryData",
  "lib/constants.ts": "constants",
  "components/tools/refinery-data.ts": "refinery",
};
for (const rel of Object.keys(SOURCES)) {
  const src = fs.readFileSync(path.join(legacyRoot, "src", rel), "utf8");
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const target = path.join(outDir, rel.replace(/\.ts$/, ".js"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, outputText);
}
const load = (rel) => require(path.join(outDir, rel.replace(/\.ts$/, ".js")));
const { ITEM_CODES } = load("lib/itemCodes.ts");
const { ITEM_CATALOG } = load("lib/item-catalog.ts");
const { ITEM_ICON_OVERRIDES } = load("lib/item-icon-overrides.ts");
const { FACTORY_ITEMS } = load("lib/factory-data.ts");
const constants = load("lib/constants.ts");
const refinery = load("components/tools/refinery-data.ts");

const ASSETS = "/api/v1/assets";
const itemIcon = (file) => (file ? `${ASSETS}/items/${encodeURIComponent(file)}` : null);
const wikiToAsset = (url) => (url ? url.replace(/^\/FoxholeWikiPhotos\//, `${ASSETS}/items/`) : null);
const iconDir = path.join(legacyRoot, "public", "FoxholeWikiPhotos");
const iconExists = (file) => Boolean(file) && fs.existsSync(path.join(iconDir, file));

// ---------------------------------------------------------------- catalog
// Категории и фракции — те же эвристики, что в старом src/lib/code-base.ts.
const AMMO_RE = /ammo|shell|rocket|grenade|torpedo|round|flare|снаряд|гранат|патрон|боеприпас|ракета|торпед|мина/i;
const MATERIAL_RE = /material|resource|fuel|coal|oil|metal|iron|copper|aluminum|component|suppl|water|wood|salvage|powder|порох|материал|топлив|металл|медь|алюмин|компонент|припас|вода|уголь|сера|сталь|бревно/i;
const MEDICAL_RE = /bandage|blood|medic|trauma|first ?aid|soldier ?supplies|бинт|кровь|медиц|аптеч/i;
const WEAPON_RE = /rifle|pistol|shotgun|mortar|launcher|rpg|mine|sword|flame|mg|gun|cannon|bomb|explosive|винтов|ружь|пистолет|мином|рпг|оруди|пулем|оруж/i;
const UNIFORM_RE = /uniform|форма/i;
const KIT_RE = /backpack|binocular|radio|mask|shovel|hammer|wrench|tripod|kit|bucket|flag|banner|siren|gear|рюкзак|бинокл|раци|противогаз|лопат|молот|ключ|набор|флаг|сирен|снаряж/i;

function categoryOf(code, item) {
  const value = `${code} ${item.name_en ?? ""} ${item.name_ru}`;
  if (item.origin === "vehicle") return "vehicles";
  if (item.origin === "structure") return "structures";
  if (UNIFORM_RE.test(value)) return "uniforms";
  if (MEDICAL_RE.test(value)) return "medical";
  if (AMMO_RE.test(value)) return "ammo";
  if (MATERIAL_RE.test(value)) return "materials";
  if (WEAPON_RE.test(value)) return "weapons";
  if (KIT_RE.test(value)) return "equipment";
  return "other";
}

function factionOf(code, item) {
  const names = `${item.name_en ?? ""} ${item.name_ru}`;
  if (/W(?:Icon)?$/.test(code) || /warden|варден/i.test(names)) return "warden";
  if (/C(?:Icon)?$/.test(code) || /colonial|колонист/i.test(names)) return "colonial";
  return "neutral";
}

// Ключ сравнения как lookupKey() старого itemCodes.ts: без регистра, ё→е, только буквы/цифры.
const lookupKey = (value) =>
  String(value ?? "")
    .replace(/\s*\((?:ящик|ящ|штука|шт|crate|crates?)\)\s*$/iu, "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^a-z0-9а-я]+/giu, "");
const crateByName = new Map(FACTORY_ITEMS.map((f) => [lookupKey(f.itemName), Number(f.numberProduced) || 1]));

// Русские варианты названий из item-catalog.ts — нужны резолверу строк сканера.
const aliasesByCode = new Map();
for (const entry of ITEM_CATALOG) {
  if (!entry.code) continue;
  const list = aliasesByCode.get(entry.code) ?? new Set();
  for (const value of [entry.name, entry.en]) if (value) list.add(value);
  aliasesByCode.set(entry.code, list);
}

const catalog = Object.entries(ITEM_CODES)
  .map(([code, item]) => {
    const iconFile = ITEM_ICON_OVERRIDES[code] ?? item.icon;
    const aliases = [...(aliasesByCode.get(code) ?? [])].filter((a) => a !== item.name_ru && a !== item.name_en);
    return {
      code,
      name: item.name_ru,
      english_name: item.name_en ?? item.name_ru,
      category: categoryOf(code, item),
      faction: factionOf(code, item),
      origin: item.origin,
      icon_url: iconExists(iconFile) ? itemIcon(iconFile) : null,
      crate_size: crateByName.get(lookupKey(item.name_en)) ?? 1,
      aliases,
      needs_review: !iconExists(iconFile) || !item.name_en || !item.origin,
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

// ---------------------------------------------------------------- recipes
const slug = (value) =>
  value
    .toLowerCase()
    .replace(/["“”«»']/g, "")
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

// Связь рецепт → предмет каталога: точное совпадение по коду/названиям/алиасам; для иконки
// дополнительно мягкое совпадение (как resolveItem() старого itemCodes.ts), но item_code — только точный.
const byLookup = new Map();
for (const c of catalog) for (const v of [c.code, c.name, c.english_name, ...c.aliases]) if (v) byLookup.set(lookupKey(v), c);
const exactItem = (name) => byLookup.get(lookupKey(name)) ?? null;
const fuzzyItem = (name) => {
  const key = lookupKey(name);
  for (const [k, c] of byLookup) if (k.length >= 4 && key.length >= 4 && (k.includes(key) || key.includes(k)) && c.icon_url) return c;
  return null;
};
const usedIds = new Set();
const recipes = [];
FACTORY_ITEMS.forEach((item, index) => {
  let id = `factory-${slug(item.itemName)}`;
  while (usedIds.has(id)) id += "-x";
  usedIds.add(id);
  const linked = exactItem(item.itemName);
  const iconSource = linked?.icon_url ? linked : fuzzyItem(item.itemName);
  const cost = Object.fromEntries(Object.entries(item.cost ?? {}).map(([k, v]) => [k, Number(v) || 0]));
  recipes.push({
    id,
    kind: "factory",
    name: item.itemName,
    name_en: item.itemName,
    item_code: linked?.code ?? null,
    category: item.itemCategory,
    item_class: item.itemClass ?? null,
    description: item.itemDesc ?? null,
    factions: item.faction,
    facilities: item.craftLocation,
    icon_url: iconSource?.icon_url ?? null,
    output_quantity: Number(item.numberProduced) || 1,
    cost,
    data: {
      number_produced_bonus: item.numberProducedBonus ?? null,
      is_teched: item.isTeched ?? false,
      is_mpf_craftable: item.isMpfCraftable ?? item.craftLocation.includes("mpf"),
    },
    sort: index,
  });
});
refinery.REFINERY_RECIPES.forEach((recipe, index) => {
  recipes.push({
    id: `refinery-${recipe.id}`,
    kind: "refinery",
    name: recipe.name,
    name_en: recipe.nameEn,
    item_code: null,
    category: recipe.group,
    item_class: recipe.short,
    description: recipe.hint ?? null,
    factions: ["neutral"],
    facilities: ["refinery"],
    icon_url: wikiToAsset(recipe.icon),
    output_quantity: 1,
    cost: { [recipe.input]: recipe.inputPerUnit },
    data: {
      input: recipe.input,
      input_per_unit: recipe.inputPerUnit,
      seconds_per_unit: recipe.secondsPerUnit,
      crate_size: recipe.crateSize,
      unit_label: recipe.unitLabel,
      personal_limit: recipe.personalLimit,
    },
    sort: index,
  });
});

// ---------------------------------------------------------------- content
const content = [];
const add = (kind, key, payload, sort = content.filter((c) => c.kind === kind).length) =>
  content.push({ kind, key, sort, payload });

// media: фоны разделов, текстуры, логотип, видео экрана входа (Supabase Storage — видео в git не кладём)
const bgFiles = new Set(fs.readdirSync(path.join(legacyRoot, "public", "bg")));
const bg = (file) => `${ASSETS}/bg/${encodeURIComponent(file)}`;
const SECTION_BG = {
  home: "page_bg_raw.jpg",
  orders: "war-plan-foxhole-fan-art-warden-version-v0-v8c2b4w3a42c1.webp",
  reports: "606565_smittymann_warden-field-artillery.png",
  storage: "war-plan-foxhole-fan-art-warden-version-v0-l7l7cn6u942c1.webp",
  timers: "war-plan-foxhole-fan-art-warden-version-v0-qzo9oqg4a42c1.webp",
  training: "wp13765010-foxhole-wallpapers.jpg",
  codes: "c516.jpg",
  tools: "wp13764968-foxhole-wallpapers.jpg",
  cabinet: "foxhole_banner_commission_for_the_27th_by_tomi_sa_deqkutr-pre.jpg",
  card: "card-bg.jpg.jpg",
  report_texture: "gray-background.jpg",
};
for (const [key, file] of Object.entries(SECTION_BG)) {
  if (!bgFiles.has(file)) throw new Error(`missing background ${file}`);
  add("media", `bg_${key}`, { type: "image", url: bg(file) });
}
add("media", "clan_logo", { type: "image", url: `${ASSETS}/brand/clan-logo.png` });
add("media", "login_video", {
  type: "video",
  url: "https://imoeicmsrtvsigjglqqy.supabase.co/storage/v1/object/public/media/video.mp4",
  poster: bg("page_bg_raw.jpg"),
});

// внешние инструменты: ANV ToolHub в старом ToolsWorkspace заменялся на FoxWar.net
for (const tool of constants.EXTERNAL_TOOLS) {
  const replaced = tool.name === "ANV Foxhole ToolHub";
  add("external_tool", slug(replaced ? "FoxWar.net" : tool.name), replaced
    ? {
        name: "FoxWar.net",
        url: "https://foxwar.net/",
        tag: "Карта и планирование",
        icon: tool.icon,
        description: "Интерактивная карта для планирования и арты с функцией команд для одновременного отображения у участников команды.",
      }
    : { name: tool.name, url: tool.url, tag: tool.tag, icon: tool.icon, description: tool.description });
}
add("external_tool", "sravdar-map", {
  name: "Sravdar Foxhole Map",
  url: "https://sravdar.github.io/",
  tag: "Карта",
  icon: "⌖",
  description: "Интерактивная карта Foxhole с живыми тайлами — раньше была встроена во вкладку «Карта».",
});

constants.TACTICAL_CUSTOM_PHRASES.forEach((text, i) => add("ticker_phrase", `phrase-${i + 1}`, { text }));
constants.FOXHOLE_REGIONS.forEach((name) => add("region", slug(name), { name }));

const uiIcon = (name) => `${ASSETS}/ui/${name}.png`;
const MATERIALS = {
  bmat: ["БМАТ", "Basic Materials", "BasicMaterials.webp"],
  rmat: ["РМАТ", "Refined Materials", "RefinedMaterials.webp"],
  emat: ["ЭМАТ", "Explosive Powder", "ExplosiveMaterial.webp"],
  hemat: ["ТЯЖ. ЭМАТ", "Heavy Explosive Powder", "HeavyExplosiveMaterials.webp"],
};
for (const [key, [label, en, file]] of Object.entries(MATERIALS)) {
  add("material", key, { label, name_en: en, icon: itemIcon(file) });
}
for (const key of refinery.REFINERY_RESOURCE_ORDER) {
  const r = refinery.REFINERY_RESOURCES[key];
  add("material", key, { label: r.name, name_en: r.nameEn, icon: wikiToAsset(r.icon) });
}

const CATEGORY_LABELS = {
  catalog_category: {
    weapons: "Оружие", ammo: "Боеприпасы", materials: "Материалы", medical: "Медицина",
    equipment: "Снаряжение", uniforms: "Форма", vehicles: "Техника", structures: "Сооружения", other: "Прочее",
  },
  factory_category: {
    small_arms: "Малое оружие", heavy_arms: "Тяжёлое оружие", heavy_ammunition: "Тяжёлые боеприпасы",
    utilities: "Снаряжение", resource: "Ресурсы", medical: "Медицина", uniforms: "Форма",
    vehicles: "Техника", shipables: "Сооружения", supplies: "Припасы",
  },
  refinery_group: { materials: "Материалы", fuel: "Топливо", construction: "Стройматериалы", alloys: "Сплавы" },
};
for (const [kind, labels] of Object.entries(CATEGORY_LABELS)) {
  for (const [key, label] of Object.entries(labels)) add(kind, key, { label });
}

// обучение: модули из старого TrainingWorkspace.tsx, тексты под v2 (Discord-вход, рапорты, бэкенд)
const TRAINING = [
  ["terminal", "Работа с терминалом SINDARIS", "ready", "browsing", "Склад, конструктор заказа, рапорты и экспорт.", [
    "1. «Заказы» → левая панель: выберите закреплённый склад и загрузите отчёт сканера (JSON/TXT, XLSX, буфер обмена) или просканируйте MapData.sav.",
    "2. Правая панель: выберите предмет из матрицы (поиск по названию, английскому имени или коду), задайте количество и единицу (ЯЩ/ШТ), нажмите «Добавить в заказ».",
    "3. Кнопка «РЕЖИМ» переключает нижние клавиши между экспортом (TXT/XLSX/PNG/буфер) и импортом.",
    "4. «Отправить рапорт в штаб» сохраняет заказ на сервере — он появляется во вкладке «Текущие заказы клана», откуда его можно выгрузить или отправить в Discord.",
  ]],
  ["formats", "Форматы отчётов сканера", "ready", "json", "Какие строки понимает парсер терминала.", [
    "• «Название предмета, 50» — классический формат сканера.",
    "• «Название предмета -> 50 шт.» — формат экспорта терминала.",
    "• «Название предмета: 12 ящ» — формат сообщений Discord.",
    "• Маркеры •, *, «шт», «ящ», «ящиков» очищаются автоматически.",
    "• JSON: массив объектов {name, count} или словарь {\"Название\": 50}.",
    "• MapData.sav: сервер ищет коды предметов каталога и читает их количество.",
  ]],
  ["timers", "Таймеры деспавна складов", "ready", "24-hour-clock", "Правило 48 часов и протокол обновления.", [
    "• Публичные и приватные склады Foxhole исчезают через 48 часов без обновления.",
    "• Красный статус — менее 1 часа: срочно отправьте бойца обновить склад.",
    "• Оранжевый — менее 24 часов: планируйте обновление в ближайшую смену.",
    "• После обновления в игре нажмите «Сбросить на 48 часов» или задайте точное время.",
    "• Все действия фиксируются в журнале таймера с меткой времени и автором.",
  ]],
  ["logistics", "Основы логистики Foxhole", "wip", "pallets", "Цепочки снабжения, MPF, фасилити.", []],
  ["protocol", "Протокол рапорта снабжения", "wip", "parchment", "Стандарт оформления заявок для штаба клана.", []],
  ["front", "Передовая логистика", "wip", "deadline", "Доставка под огнём, приоритеты, маршруты.", []],
];
for (const [key, title, status, icon, summary, body] of TRAINING) {
  add("training_module", key, { title, status, icon: uiIcon(icon), summary, body });
}

// ---------------------------------------------------------------- write
const dataDir = path.join(repoRoot, "backend", "app", "seed", "data");
fs.mkdirSync(dataDir, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(value, null, 1) + "\n");
write("catalog.json", catalog);
write("recipes.json", recipes);
write("content.json", content);
fs.rmSync(outDir, { recursive: true, force: true });

console.log(`catalog: ${catalog.length} items (${catalog.filter((c) => c.icon_url).length} with icons)`);
console.log(`recipes: ${recipes.filter((r) => r.kind === "factory").length} factory/mpf, ${recipes.filter((r) => r.kind === "refinery").length} refinery`);
console.log(`content: ${content.length} entries`);
