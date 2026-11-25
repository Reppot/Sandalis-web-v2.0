// Генератор руководства «Навигация»: демо-клан -> чистые скриншоты на ru/en ->
// пояснения к разделам -> backend/static/guide/<locale>/*.webp + seed/data/guide.json.
// Запуск и подготовка окружения — README.md рядом.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { CHAPTERS } from "./chapters.mjs";
import { COMMANDER, seedDemo } from "./demo.mjs";

const FRONTEND = process.env.GUIDE_FRONTEND ?? "http://127.0.0.1:3300";
const BACKEND = process.env.GUIDE_BACKEND ?? "http://127.0.0.1:8020";
const BROWSER = process.env.GUIDE_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const LOCALES = ["ru", "en"];
const VIEWPORT = { width: 1440, height: 960 };
const STATIC = new URL("../../backend/static/guide/", import.meta.url);
const SEED = new URL("../../backend/app/seed/data/guide.json", import.meta.url);
const LINKED_GUILD = "900000000000000001";

// --- незавершённый вход через Discord: состояние хранит сервер (POST /auth/discord/dev-setup) ---
const SETUP_STATE = {
  uid: COMMANDER.user_id,
  name: COMMANDER.display_name,
  avatar: null,
  guilds: [
    { id: LINKED_GUILD, name: "SINDARIS", icon_url: null },
    { id: "900000000000000002", name: "Foxhole Logistics Hub", icon_url: null },
  ],
  joins: [
    {
      clan_id: "ALLIED",
      name: "11th Logistics Regiment",
      icon_url: null,
      level: "medium",
      roles: [
        { name: "Officer", color: 15158332, level: "medium" },
        { name: "Logistics", color: 3447003, level: "basic" },
      ],
    },
  ],
};

// --- действия перед снимком ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PREPARE = {
  async pickMatrixItem(page) {
    await page.waitForSelector(".matrix-item", { timeout: 30000 });
    await page.click(".matrix-item");
    await page.type('[data-guide="builder-qty"]', "5");
    await page.click('[data-guide="builder-add"]');
    await page.waitForSelector('[data-guide="builder-order"]', { timeout: 30000 });
  },
  async expandReport(page) {
    await page.waitForSelector('[data-guide="report-card"] button', { timeout: 30000 });
    await page.click('[data-guide="report-card"] button');
    await page.waitForSelector(".hq-drawer", { timeout: 30000 });
  },
  async openTimer(page) {
    await page.waitForSelector('[data-guide="timer-manage"]', { timeout: 30000 });
    await page.click('[data-guide="timer-manage"]');
    await page.waitForSelector('.modal-panel [data-guide="tmodal-left"]');
    await sleep(900); // журнал подгружается отдельно
  },
  async openMpf(page) {
    await page.waitForSelector('[data-guide="tools-tabs"] [role=tab]', { timeout: 30000 });
    await page.$eval('[data-guide="tools-tabs"] [role=tab][aria-selected="true"]', (el) => el.scrollIntoView({ block: "nearest", inline: "center" }));
    await page.waitForSelector(".factory-item-card");
  },
  async filterFacility(page) {
    const search = '[data-guide="facility-search"]';
    await page.waitForSelector(search, { timeout: 30000 });
    await page.click(search);
    await page.type(search, "materials");
    await page.waitForSelector(".factory-item-card", { timeout: 30000 });
  },
  async addFactoryItem(page) {
    await page.waitForSelector(".factory-item-card", { timeout: 30000 });
    await page.click(".factory-item-card");
    await page.waitForSelector(".factory-plan-row", { timeout: 30000 });
  },
  async selectFacilityChain(page) {
    await PREPARE.filterFacility(page);
    await page.click(".factory-item-card");
    await page.waitForSelector('[data-guide="facility-buildings"]', { timeout: 30000 });
    await page.$eval('[data-guide="facility-buildings"]', (el) => el.scrollIntoView({ block: "center" }));
  },
  async openPlanning(page) {
    await page.waitForSelector('[data-guide="planning-regions"]', { timeout: 30000 });
    const toggle = await page.$('[data-guide="planning-regions"]');
    if (await toggle.evaluate((el) => el.getAttribute("aria-pressed") !== "true")) await toggle.click();
    await page.waitForSelector(".planning-hex-select-label", { timeout: 30000 });
    const label = await page.$eval(".planning-hex-select-label", (el) => ({ width: el.getBoundingClientRect().width, hexWidth: el.parentElement.getBoundingClientRect().width }));
    if (label.width > label.hexWidth + 2) throw new Error(`Selection label overflows its hex: ${JSON.stringify(label)}`);
  },
  async checkPlanningOverview(page) {
    await page.waitForSelector(".planning-region", { timeout: 30000 });
    const state = await page.evaluate(() => ({
      regions: document.querySelectorAll("[data-region]").length,
      selected: document.querySelectorAll(".planning-hex.is-region-selected").length,
      markers: document.querySelectorAll(".planning-marker").length,
      labelWidth: document.querySelector(".planning-region")?.getBoundingClientRect().width ?? 0,
      hexWidth: document.querySelector("[data-region]")?.getBoundingClientRect().width ?? 0,
      mapRequests: performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname).filter((path) => path.includes("/api/v1/world/map/")),
    }));
    if (state.regions < 40 || state.selected !== 0 || state.markers !== 0 || state.labelWidth > 260) throw new Error(`Invalid empty planning overview: ${JSON.stringify(state)}`);
    if (state.labelWidth > state.hexWidth + 2) throw new Error(`Overview region labels overlap neighboring hexes: ${JSON.stringify(state)}`);
    if (state.mapRequests.some((path) => !path.endsWith("/overview"))) throw new Error(`Empty planning overview requested details: ${state.mapRequests.join(", ")}`);
  },
  async showPlanningFrontline(page) {
    const toggle = '[data-guide="planning-frontline-toggle"]';
    await page.waitForSelector(toggle, { timeout: 30000 });
    await page.click(toggle);
    await page.waitForSelector(".planning-frontline polyline", { timeout: 30000 });
    const state = await page.evaluate(() => ({
      pressed: document.querySelector('[data-guide="planning-frontline-toggle"]').getAttribute("aria-pressed"),
      svg: (() => { const { width, height } = document.querySelector(".planning-frontline")?.getBoundingClientRect() ?? {}; return { width, height }; })(),
      line: (() => { const { left, top, right, bottom } = document.querySelector(".planning-frontline polyline")?.getBoundingClientRect() ?? {}; return { left, top, right, bottom }; })(),
      canvas: (() => { const { left, top, right, bottom } = document.querySelector(".planning-canvas").getBoundingClientRect(); return { left, top, right, bottom }; })(),
      points: document.querySelector(".planning-frontline polyline")?.getAttribute("points")?.trim().split(/\s+/).length ?? 0,
      markers: document.querySelectorAll(".planning-marker").length,
      selected: document.querySelectorAll(".planning-hex.is-region-selected").length,
      detailRequests: performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname).filter((path) => path.includes("/api/v1/world/map/regions")),
    }));
    if (state.pressed !== "true" || state.points < 2 || state.markers !== 0 || state.selected !== 0 || state.detailRequests.length) throw new Error(`Frontline is not isolated from selected map details: ${JSON.stringify(state)}`);
    if (state.svg.width < 1 || state.svg.height < 1 || state.line.right <= state.canvas.left || state.line.left >= state.canvas.right || state.line.bottom <= state.canvas.top || state.line.top >= state.canvas.bottom) throw new Error(`Frontline geometry is outside the visible map: ${JSON.stringify(state)}`);
  },
  async openTraining(page) {
    await page.waitForSelector(".training-switch-btn", { timeout: 30000 });
    const active = await page.$eval(".training-switch-btn", (el) => el.getAttribute("aria-selected"));
    if (active !== "true") await page.click(".training-switch-btn");
    await page.waitForSelector(".training-grid .training-card", { timeout: 30000 });
  },
  async selectPlanningHex(page) {
    await page.waitForSelector('[data-guide="planning-regions"]', { timeout: 30000 });
    await page.click('[data-guide="planning-regions"]');
    await page.waitForSelector('[data-region="DeadLandsHex"]', { timeout: 30000 });
    await page.click('[data-region="DeadLandsHex"]');
    const secondKey = await page.$$eval("[data-region]", (regions) => {
      const target = regions.find((region) => region.dataset.region === "DeadLandsHex");
      const x = Number.parseFloat(target?.style.left ?? "0");
      const y = Number.parseFloat(target?.style.top ?? "0");
      return regions.filter((region) => region !== target).sort((a, b) => {
        const distance = (region) => Math.hypot(Number.parseFloat(region.style.left) - x, Number.parseFloat(region.style.top) - y);
        return distance(a) - distance(b);
      })[0]?.dataset.region;
    });
    if (!secondKey) throw new Error("The map overview has no second region to select");
    await page.click(`[data-region="${secondKey}"]`);
    await page.waitForSelector(".planning-marker", { timeout: 30000 });
    await page.click('[data-guide="planning-regions"]');
    await page.waitForFunction(() => document.querySelectorAll("[data-region]").length === 2, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector(".planning-filters-head")?.getAttribute("aria-expanded") === "false", { timeout: 3000 });
    const bounds = await page.evaluate(() => {
      const canvas = document.querySelector(".planning-canvas").getBoundingClientRect();
      const filters = document.querySelector(".planning-filters").getBoundingClientRect();
      const filtersExpanded = document.querySelector(".planning-filters-head").getAttribute("aria-expanded");
      const hexes = [...document.querySelectorAll("[data-region]")].map((region) => region.getBoundingClientRect());
      const hex = { left: Math.min(...hexes.map((r) => r.left)), top: Math.min(...hexes.map((r) => r.top)), right: Math.max(...hexes.map((r) => r.right)), bottom: Math.max(...hexes.map((r) => r.bottom)) };
      const marker = document.querySelector(".planning-marker");
      const tooltip = getComputedStyle(marker, "::after");
      const transform = new DOMMatrixReadOnly(tooltip.transform);
      const requests = performance.getEntriesByType("resource").map((entry) => new URL(entry.name)).filter((url) => url.pathname.includes("/api/v1/world/map/regions"));
      const detailKeys = requests.map((url) => [...url.searchParams.entries()].filter(([key]) => key.startsWith("regions")).flatMap(([, value]) => value.split(",")).sort().join(","));
      return { canvas: [canvas.left, canvas.top, canvas.right, canvas.bottom], filters: [filters.left, filters.top, filters.right, filters.bottom], filtersExpanded, hex: [hex.left, hex.top, hex.right, hex.bottom], regions: document.querySelectorAll("[data-region]").length, selected: document.querySelectorAll(".planning-hex.is-region-selected").length, markers: document.querySelectorAll(".planning-marker").length, markerRegions: [...document.querySelectorAll(".planning-marker")].map((el) => el.closest("[data-region]")?.dataset.region), tooltipScale: [transform.a, transform.d], tooltipWidth: parseFloat(tooltip.width), detailKeys };
    });
    if (bounds.regions !== 2 || bounds.selected !== 2) throw new Error(`Non-selected hexes remained on the plan: ${JSON.stringify(bounds)}`);
    if (!bounds.markers || bounds.markerRegions.some((key) => !["DeadLandsHex", secondKey].includes(key))) throw new Error(`Building markers escaped the selected hexes: ${JSON.stringify(bounds)}`);
    const expectedKeys = ["DeadLandsHex", secondKey].sort().join(",");
    if (!bounds.detailKeys.some((keys) => keys?.split(",").sort().join(",") === expectedKeys)) throw new Error(`Region details were not requested only for the selected hexes: ${JSON.stringify(bounds)}`);
    if (bounds.hex[0] < bounds.canvas[0] - 2 || bounds.hex[1] < bounds.canvas[1] - 2 || bounds.hex[2] > bounds.canvas[2] + 2 || bounds.hex[3] > bounds.canvas[3] + 2) throw new Error(`Selected hex is not fitted to the map viewport: ${JSON.stringify(bounds)}`);
    if (bounds.filtersExpanded !== "false" || bounds.hex[0] < bounds.filters[2] - 2) throw new Error(`The building filter panel obscures the selected map: ${JSON.stringify(bounds)}`);
    if (Math.abs(bounds.tooltipScale[0] - 1) > 0.02 || Math.abs(bounds.tooltipScale[1] - 1) > 0.02 || bounds.tooltipWidth > 320) throw new Error(`Building tooltip is scaled incorrectly: ${JSON.stringify(bounds)}`);
    const hoverPoint = await page.evaluate(() => {
      for (const marker of document.querySelectorAll(".planning-marker")) {
        const rect = marker.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (hit === marker || marker.contains(hit)) return { x, y };
      }
      return null;
    });
    if (!hoverPoint) throw new Error("Selected hexes have no visible building marker to hover");
    await page.mouse.move(hoverPoint.x, hoverPoint.y);
    await page.waitForFunction(() => [...document.querySelectorAll(".planning-marker")].some((marker) => getComputedStyle(marker, "::after").opacity === "1"), { timeout: 3000 });

    const frontlineToggle = '[data-guide="planning-frontline-toggle"]';
    await page.click(frontlineToggle);
    await page.waitForSelector(".planning-frontline polyline", { timeout: 30000 });
    const selectedFrontline = await page.evaluate(() => {
      const svg = document.querySelector(".planning-frontline").getBoundingClientRect();
      const line = document.querySelector(".planning-frontline polyline").getBoundingClientRect();
      const canvas = document.querySelector(".planning-canvas").getBoundingClientRect();
      return {
        regions: document.querySelectorAll("[data-region]").length,
        selected: document.querySelectorAll(".planning-hex.is-region-selected").length,
        svg: { width: svg.width, height: svg.height },
        visible: line.right > canvas.left && line.left < canvas.right && line.bottom > canvas.top && line.top < canvas.bottom,
      };
    });
    if (selectedFrontline.regions !== 2 || selectedFrontline.selected !== 2 || selectedFrontline.svg.width < 1 || selectedFrontline.svg.height < 1 || !selectedFrontline.visible) throw new Error(`Frontline is misaligned after selecting hexes: ${JSON.stringify(selectedFrontline)}`);
    await page.click(frontlineToggle);
    await page.waitForFunction(() => !document.querySelector(".planning-frontline"), { timeout: 3000 });
  },
  async openPlanningTools(page) {
    const toggle = await page.$('[data-guide="planning-tools-toggle"]');
    if (await toggle.evaluate((el) => el.getAttribute("aria-expanded") !== "true")) await toggle.click();
    await page.waitForSelector('[data-guide="planning-tool-tabs"]', { timeout: 30000 });
    const draw = await page.$('[data-guide="planning-tool-tabs"] [role="tab"]');
    await draw.click();
    await page.click('[data-guide="planning-tool-route"]');
  },
  async expandMember(page) {
    await page.waitForSelector('[data-guide="mgmt-members"] li button', { timeout: 30000 });
    await page.click('[data-guide="mgmt-members"] li button');
  },
  async openRolesTab(page) {
    await page.waitForSelector('main [role="radiogroup"] [role="radio"]', { timeout: 30000 });
    const tabs = await page.$$('main [role="radiogroup"] [role="radio"]');
    await tabs[1].click();
    await page.waitForSelector('[data-guide="mgmt-roles"]', { timeout: 30000 });
  },
  async openIntegrationsTab(page) {
    await page.waitForSelector('main [role="radiogroup"] [role="radio"]', { timeout: 30000 });
    const tabs = await page.$$('main [role="radiogroup"] [role="radio"]');
    await tabs[3].click();
    await page.waitForSelector('[data-guide="cab-token"]', { timeout: 30000 });
  },
  async openSettingsLanguage(page) {
    await page.waitForSelector('[data-guide="settings-sections"] [role="radio"]', { timeout: 30000 });
    const sections = await page.$$('[data-guide="settings-sections"] [role="radio"]');
    await sections[1].click();
    await page.waitForSelector('[data-guide="cab-lang"]', { timeout: 30000 });
  },
  async openSettingsAppearance(page) {
    await page.waitForSelector('[data-guide="settings-sections"] [role="radio"]', { timeout: 30000 });
    const sections = await page.$$('[data-guide="settings-sections"] [role="radio"]');
    await sections[2].click();
    await page.waitForSelector('[data-guide="settings-appearance"]', { timeout: 30000 });
  },
  async openMobileMenu(page) {
    await page.setViewport({ width: 390, height: 844 });
    await page.waitForSelector('[data-guide="shell-menu-trigger"]', { timeout: 30000 });
    await page.click('[data-guide="shell-menu-trigger"]');
    await page.waitForSelector('[data-guide="shell-menu"]', { timeout: 30000 });
  },
  async openRoleModal(page) {
    await PREPARE.openRolesTab(page);
    await page.waitForSelector('[data-guide="mgmt-gear"]', { timeout: 30000 });
    await page.click('[data-guide="mgmt-gear"]');
    await page.waitForSelector(".modal-panel [data-guide=mgmt-perm-group]", { timeout: 30000 });
  },
  async fillMpf(page) {
    await PREPARE.openMpf(page);
    let cards = await page.$$(".factory-item-card");
    await cards[0].click();
    const categories = await page.$$('[data-guide="tool-cats"] button');
    if (categories.length > 2) await categories[2].click();
    await page.waitForSelector(".factory-item-card");
    cards = await page.$$(".factory-item-card");
    await cards[0].click();
    await page.waitForSelector(".factory-plan-row");
    await page.evaluate(() => window.scrollTo(0, 0));
  },
};

// --- геометрия ---
async function rectOf(page, sel) {
  return page.evaluate((selector) => {
    const [base, nth] = selector.split(" >>");
    const el = nth === undefined ? document.querySelector(base) : document.querySelectorAll(base)[Number(nth)];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
  }, sel);
}

async function shoot(page, locale, shot) {
  await page.setViewport(shot.viewport ?? VIEWPORT);
  await page.goto(`${FRONTEND}${shot.path}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  await page.evaluate(() => window.scrollTo(0, 0));
  const ready = shot.mode === "viewport" || shot.prepare ? shot.notes[0]?.sel ?? "main" : shot.mode.clip;
  if (shot.prepare) await page.waitForSelector("main, .auth-panel", { timeout: 30000 });
  else await page.waitForSelector(ready.split(" >>")[0], { timeout: 30000 });
  if (shot.prepare) await PREPARE[shot.prepare](page);
  await sleep(700);

  const missingTargets = await page.evaluate((notes) => notes.flatMap(({ sel }) => {
    const [base, nth] = sel.split(" >>");
    const elements = nth === undefined ? document.querySelectorAll(base) : [document.querySelectorAll(base)[Number(nth)]].filter(Boolean);
    return elements.length ? [] : [sel];
  }), shot.notes);
  if (missingTargets.length) throw new Error(`[${locale}] ${shot.id}: missing screen targets: ${missingTargets.join(", ")}`);

  let clip;
  if (shot.mode === "viewport") {
    const scrollY = await page.evaluate(() => window.scrollY);
    const viewport = shot.viewport ?? VIEWPORT;
    clip = { x: 0, y: scrollY, width: viewport.width, height: viewport.height };
  } else {
    const r = await rectOf(page, shot.mode.clip);
    if (!r) throw new Error(`[${locale}] ${shot.id}: clip ${shot.mode.clip} not found`);
    clip = { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.w), height: Math.ceil(r.h) };
  }

  for (const note of shot.notes) {
    const r = await rectOf(page, note.sel);
    if (!r) throw new Error(`[${locale}] ${shot.id}: screen target ${note.sel} not found`);
    const intersects = r.x < clip.x + clip.width && r.x + r.w > clip.x && r.y < clip.y + clip.height && r.y + r.h > clip.y;
    if (!intersects) throw new Error(`[${locale}] ${shot.id}: screen target ${note.sel} is outside the screenshot`);
  }

  mkdirSync(new URL(`${locale}/`, STATIC), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(`${locale}/${shot.id}.webp`, STATIC)), type: "webp", quality: 82, clip, captureBeyondViewport: true });
  return { size: { w: clip.width, h: clip.height } };
}

async function main() {
  console.log("demo clan…");
  const demo = await seedDemo(BACKEND);
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });
  const results = {}; // shotId -> locale -> {size}

  for (const locale of LOCALES) {
    console.log(`locale ${locale}`);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto(FRONTEND, { waitUntil: "networkidle0" });
    await page.evaluate((loc) => {
      localStorage.setItem("sindaris-locale", loc);
      localStorage.setItem("sindaris-theme", "dark");
    }, locale);

    let loggedIn = false;
    for (const chapter of CHAPTERS) {
      for (const shot of chapter.shots) {
        if (shot.loggedOut && loggedIn) throw new Error("logged-out shots must come first");
        if (!shot.loggedOut && !loggedIn) {
          await page.evaluate(async (c) => {
            await fetch("/api/v1/auth/dev-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...c, upsert: true }) });
          }, COMMANDER);
          await page.evaluate((d) => {
            localStorage.setItem("sindaris-pinned-stockpile", JSON.stringify(d.pinnedId));
            localStorage.setItem("sindaris-order-draft", JSON.stringify(d.draft));
          }, demo);
          loggedIn = true;
        }
        if (shot.setupCookie) {
          await page.evaluate(async (state) => {
            const r = await fetch("/api/v1/auth/discord/dev-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) });
            if (!r.ok) throw new Error(`dev-setup ${r.status}`);
          }, SETUP_STATE);
        }
        try {
          (results[shot.id] ??= {})[locale] = await shoot(page, locale, shot);
        } catch (err) {
          await page.screenshot({ path: fileURLToPath(new URL(`debug-${locale}-${shot.id}.png`, import.meta.url)) });
          console.error("page text:", (await page.evaluate(() => document.body.innerText)).slice(0, 600));
          throw err;
        }
        console.log(`  ${shot.id}: ${shot.notes.length} screen notes`);
      }
    }
    await context.close();
  }
  await browser.close();

  const previous = JSON.parse(readFileSync(fileURLToPath(SEED), "utf8"));
  const oldChapters = new Map(previous.map((row) => [row.key, row.payload]));
  const mergeLocales = (oldValue, newValue) => ({ ...(oldValue ?? {}), ru: newValue.ru, en: newValue.en });
  const rows = CHAPTERS.map((chapter, sort) => {
    const oldChapter = oldChapters.get(chapter.key) ?? {};
    const oldShots = new Map((oldChapter.shots ?? []).map((shot) => [shot.id, shot]));
    return {
    kind: "guide_chapter",
    key: chapter.key,
    sort,
    payload: {
      icon: chapter.icon,
      title: mergeLocales(oldChapter.title, chapter.title),
      summary: mergeLocales(oldChapter.summary, chapter.summary),
      shots: chapter.shots.map((shot) => {
        const old = oldShots.get(shot.id) ?? {};
        return {
        id: shot.id,
        caption: mergeLocales(old.caption, shot.caption),
        images: { ...(old.images ?? {}), ...Object.fromEntries(LOCALES.map((l) => [l, `/api/v1/assets/guide/${l}/${shot.id}.webp`])) },
        size: { ...(old.size ?? {}), ...Object.fromEntries(LOCALES.map((l) => [l, results[shot.id][l].size])) },
        notes: { ...(old.notes ?? {}), ...Object.fromEntries(LOCALES.map((l) => [l, shot.notes.map((note) => note.note[l])])) },
      }; }),
    },
  }; });
  writeFileSync(SEED, `${JSON.stringify(rows, null, 1)}\n`, "utf8");
  console.log(`guide.json: ${rows.length} chapters`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
