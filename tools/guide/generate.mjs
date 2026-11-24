// Генератор руководства «Навигация»: демо-клан -> скриншоты интерфейса на ru/en/cs ->
// координаты меток из DOM -> backend/static/guide/<locale>/*.webp + seed/data/guide.json.
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
  },
  async expandReport(page) {
    await page.waitForSelector('[data-guide="report-card"] button', { timeout: 30000 });
    await page.click('[data-guide="report-card"] button');
  },
  async openTimer(page) {
    await page.waitForSelector('[data-guide="timer-manage"]', { timeout: 30000 });
    await page.click('[data-guide="timer-manage"]');
    await page.waitForSelector('.modal-panel [data-guide="tmodal-left"]');
    await sleep(900); // журнал подгружается отдельно
  },
  async openMpf(page) {
    await page.waitForSelector('[data-guide="tools-tabs"] [role=tab]', { timeout: 30000 });
    const tabs = await page.$$('[data-guide="tools-tabs"] [role=tab]');
    await tabs[1].click();
    await page.waitForSelector(".factory-item-card");
  },
  async openPlanning(page) {
    await page.waitForSelector('[data-guide="planning-regions"]', { timeout: 30000 });
  },
  async selectPlanningHex(page) {
    await page.waitForSelector('[data-guide="planning-regions"]', { timeout: 30000 });
    await page.click('[data-guide="planning-regions"]');
    await page.waitForSelector('[data-region="DeadLandsHex"]', { timeout: 30000 });
    await page.click('[data-region="DeadLandsHex"]');
    await page.waitForSelector(".planning-marker", { timeout: 30000 });
    await page.click('[data-guide="planning-regions"]');
  },
  async openPlanningTools(page) {
    const toggle = await page.$('[data-guide="planning-tools-toggle"]');
    if (await toggle.evaluate((el) => el.getAttribute("aria-expanded") !== "true")) await toggle.click();
    await page.waitForSelector('[data-guide="planning-tool-tabs"]', { timeout: 30000 });
    const draw = await page.$('[data-guide="planning-tool-tabs"] [role="tab"]');
    await draw.click();
  },
  async expandMember(page) {
    await page.waitForSelector('[data-guide="mgmt-members"] li button', { timeout: 30000 });
    await page.click('[data-guide="mgmt-members"] li button');
  },
  async openRolesTab(page) {
    await page.waitForSelector("[role=tab]", { timeout: 30000 });
    const tabs = await page.$$("main [role=tab]");
    await tabs[1].click();
    await page.waitForSelector('[data-guide="mgmt-level"]', { timeout: 30000 });
  },
  async openIntegrationsTab(page) {
    await page.waitForSelector("[role=tab]", { timeout: 30000 });
    const tabs = await page.$$("main [role=tab]");
    await tabs[2].click();
    await page.waitForSelector('[data-guide="cab-token"]', { timeout: 30000 });
  },
  async openSettingsLanguage(page) {
    await page.waitForSelector('[data-guide="settings-sections"] .filter-card', { timeout: 30000 });
    const cards = await page.$$('[data-guide="settings-sections"] .filter-card');
    await cards[1].click();
    await page.waitForSelector('[data-guide="cab-lang"]', { timeout: 30000 });
  },
  async openSettingsAppearance(page) {
    await page.waitForSelector('[data-guide="settings-sections"] .filter-card', { timeout: 30000 });
    const cards = await page.$$('[data-guide="settings-sections"] .filter-card');
    await cards[2].click();
    await page.waitForSelector('[data-guide="settings-appearance"]', { timeout: 30000 });
  },
  async openBurger(page) {
    await page.waitForSelector('[data-guide="shell-burger"]', { timeout: 30000 });
    await page.click('[data-guide="shell-burger"]');
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
    const cards = await page.$$(".factory-item-card");
    await cards[0].click();
    await cards[3].click();
    await page.waitForSelector(".factory-plan-row");
    await page.evaluate(() => {
      const top = document.querySelector(".factory-topbar").getBoundingClientRect().top + window.scrollY;
      const chrome = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chrome-h")) || 72;
      window.scrollTo(0, Math.max(0, top - chrome - 12));
    });
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

function markerPoint(r, at) {
  if (at === "start" || r.w > 260 || r.h > 70) return { x: r.x + 18, y: r.y + 18 };
  return { x: r.x + r.w - 4, y: r.y + 4 };
}

async function shoot(page, locale, shot) {
  await page.goto(`${FRONTEND}${shot.path}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
  const ready = shot.mode === "viewport" || shot.prepare ? shot.markers[0].sel : shot.mode.clip;
  if (shot.prepare) await page.waitForSelector("main, .auth-panel", { timeout: 30000 });
  else await page.waitForSelector(ready.split(" >>")[0], { timeout: 30000 });
  if (shot.prepare) await PREPARE[shot.prepare](page);
  await sleep(700);

  let clip;
  if (shot.mode === "viewport") {
    const scrollY = await page.evaluate(() => window.scrollY);
    clip = { x: 0, y: scrollY, width: VIEWPORT.width, height: VIEWPORT.height };
  } else {
    const r = await rectOf(page, shot.mode.clip);
    if (!r) throw new Error(`[${locale}] ${shot.id}: clip ${shot.mode.clip} not found`);
    clip = { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.ceil(r.w), height: Math.ceil(r.h) };
  }

  const markers = [];
  for (const m of shot.markers) {
    const r = await rectOf(page, m.sel);
    if (!r) throw new Error(`[${locale}] ${shot.id}: marker ${m.sel} not found`);
    const p = markerPoint(r, m.at);
    const x = ((p.x - clip.x) / clip.width) * 100;
    const y = ((p.y - clip.y) / clip.height) * 100;
    if (x < -1 || x > 101 || y < -1 || y > 101) throw new Error(`[${locale}] ${shot.id}: marker ${m.sel} outside the shot`);
    const bx = Math.max(0, ((r.x - clip.x) / clip.width) * 100);
    const by = Math.max(0, ((r.y - clip.y) / clip.height) * 100);
    const bw = Math.max(0, Math.min(100 - bx, (r.w / clip.width) * 100));
    const bh = Math.max(0, Math.min(100 - by, (r.h / clip.height) * 100));
    markers.push({
      x: +Math.min(98.5, Math.max(1.5, x)).toFixed(2),
      y: +Math.min(98, Math.max(2, y)).toFixed(2),
      box: { x: +bx.toFixed(2), y: +by.toFixed(2), w: +bw.toFixed(2), h: +bh.toFixed(2) },
    });
  }

  mkdirSync(new URL(`${locale}/`, STATIC), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL(`${locale}/${shot.id}.webp`, STATIC)), type: "webp", quality: 82, clip, captureBeyondViewport: true });
  return { size: { w: clip.width, h: clip.height }, markers };
}

async function main() {
  console.log("demo clan…");
  const demo = await seedDemo(BACKEND);
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });
  const results = {}; // shotId -> locale -> {size, markers}

  for (const locale of LOCALES) {
    console.log(`locale ${locale}`);
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto(FRONTEND, { waitUntil: "networkidle0" });
    await page.evaluate((loc) => localStorage.setItem("sindaris-locale", loc), locale);

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
        console.log(`  ${shot.id}: ${shot.markers.length} markers`);
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
        markers: { ...(old.markers ?? {}), ...Object.fromEntries(LOCALES.map((l) => [l, results[shot.id][l].markers])) },
        notes: { ...(old.notes ?? {}), ...Object.fromEntries(LOCALES.map((l) => [l, shot.markers.map((m) => m.note[l])])) },
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
