// Генератор руководства «Навигация»: демо-клан -> скриншоты интерфейса на ru/en/cs ->
// координаты меток из DOM -> backend/static/guide/<locale>/*.webp + seed/data/guide.json.
// Запуск и подготовка окружения — README.md рядом.
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { CHAPTERS } from "./chapters.mjs";
import { COMMANDER, seedDemo } from "./demo.mjs";

const FRONTEND = process.env.GUIDE_FRONTEND ?? "http://127.0.0.1:3300";
const BACKEND = process.env.GUIDE_BACKEND ?? "http://127.0.0.1:8020";
const SECRET = process.env.GUIDE_JWT_SECRET ?? "local-dev-secret";
const BROWSER = process.env.GUIDE_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const LOCALES = ["ru", "en", "cs"];
const VIEWPORT = { width: 1440, height: 960 };
const STATIC = new URL("../../backend/static/guide/", import.meta.url);
const SEED = new URL("../../backend/app/seed/data/guide.json", import.meta.url);
const LINKED_GUILD = "900000000000000001";

// --- подписанная кука выбора сервера (тот же формат, что seal() в discord_oauth.py) ---
const sortKeys = (v) =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
function seal(body, ttlSec) {
  const raw = Buffer.from(JSON.stringify(sortKeys({ ...body, exp: Math.floor(Date.now() / 1000) + ttlSec }))).toString("base64url");
  return `${raw}.${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
}
const setupCookie = () =>
  seal(
    {
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
    },
    3600,
  );

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
    markers.push({ x: +Math.min(98.5, Math.max(1.5, x)).toFixed(2), y: +Math.min(98, Math.max(2, y)).toFixed(2) });
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
        if (shot.setupCookie) await page.setCookie({ name: "sindaris_discord_setup", value: setupCookie(), url: FRONTEND });
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

  const rows = CHAPTERS.map((chapter, sort) => ({
    kind: "guide_chapter",
    key: chapter.key,
    sort,
    payload: {
      icon: chapter.icon,
      title: chapter.title,
      summary: chapter.summary,
      shots: chapter.shots.map((shot) => ({
        id: shot.id,
        caption: shot.caption,
        images: Object.fromEntries(LOCALES.map((l) => [l, `/api/v1/assets/guide/${l}/${shot.id}.webp`])),
        size: Object.fromEntries(LOCALES.map((l) => [l, results[shot.id][l].size])),
        markers: Object.fromEntries(LOCALES.map((l) => [l, results[shot.id][l].markers])),
        notes: Object.fromEntries(LOCALES.map((l) => [l, shot.markers.map((m) => m.note[l])])),
      })),
    },
  }));
  writeFileSync(SEED, `${JSON.stringify(rows, null, 1)}\n`, "utf8");
  console.log(`guide.json: ${rows.length} chapters`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
