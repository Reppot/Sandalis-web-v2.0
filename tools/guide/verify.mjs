// Проверка опубликованного руководства: главы и снимки RU/EN, маркеры, мобильное оглавление.
import puppeteer from "puppeteer-core";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { COMMANDER, seedDemo } from "./demo.mjs";

const FRONTEND = process.env.GUIDE_FRONTEND ?? "http://127.0.0.1:3300";
const BACKEND = process.env.GUIDE_BACKEND ?? "http://127.0.0.1:8020";
const BROWSER = process.env.GUIDE_BROWSER ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const EXPECTED_CHAPTERS = 18;
const GUIDE_DATA = new URL("../../backend/app/seed/data/guide.json", import.meta.url);
const GUIDE_STATIC = new URL("../../backend/static/guide/", import.meta.url);

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function verifyChapters(page, locale) {
  const buttons = await page.$$(".guide-toc-list button");
  assert(buttons.length === EXPECTED_CHAPTERS, `${locale}: expected ${EXPECTED_CHAPTERS} guide chapters, found ${buttons.length}`);

  for (let index = 0; index < buttons.length; index += 1) {
    const button = (await page.$$(".guide-toc-list button"))[index];
    const title = await button.$eval(".truncate", (element) => element.textContent?.trim() ?? "");
    await button.click();
    await page.waitForFunction((expected) => document.querySelector("article h2")?.textContent?.includes(expected), { timeout: 15000 }, title);
    await page.waitForFunction(() => {
      const images = [...document.querySelectorAll(".guide-shot img")];
      return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0 && Boolean(image.alt));
    }, { timeout: 30000 });

    const state = await page.evaluate(() => ({
      images: [...document.querySelectorAll(".guide-shot img")].map((image) => image.currentSrc),
      imageSizes: [...document.querySelectorAll(".guide-shot img")].map((image) => {
        const rect = image.getBoundingClientRect();
        return { width: rect.width, height: rect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
      }),
      notes: document.querySelectorAll(".guide-note").length,
      notePanels: document.querySelectorAll(".guide-note-panel").length,
      legacyMarkers: document.querySelectorAll(".guide-marker, .guide-focus-target").length,
      shotPager: document.querySelector("[data-guide-shot-index]")?.textContent?.trim() ?? null,
    }));
    assert(state.images.length === 1, `${locale}: chapter “${title}” should show one active screenshot, found ${state.images.length}`);
    assert(state.imageSizes.every((image) => image.width <= image.naturalWidth + 1 && image.height <= image.naturalHeight + 1), `${locale}: chapter “${title}” enlarges a screenshot past its source size: ${JSON.stringify(state.imageSizes)}`);
    assert(state.notes === 0 || state.notePanels === 1, `${locale}: chapter “${title}” has missing screen notes`);
    assert(state.shotPager === null || /\d+\s*\/\s*\d+/.test(state.shotPager), `${locale}: chapter “${title}” has an invalid screenshot counter: ${state.shotPager}`);
    assert(state.legacyMarkers === 0, `${locale}: chapter “${title}” still overlays numbered markers`);
    assert(state.images.every((src) => src.includes(`/guide/${locale}/`)), `${locale}: chapter “${title}” uses a wrong-locale screenshot`);
    assert(state.images.every((src) => new URL(src).pathname.match(/\/guide\/(ru|en)\/[a-z0-9-]+\.[a-f0-9]{16}\.webp$/)), `${locale}: chapter “${title}” has an unversioned screenshot URL`);
    if (index === 3) {
      await page.click("[data-guide-zoom]");
      await page.waitForSelector(".modal-panel .guide-shot.is-zoomed img", { timeout: 5000 });
      const zoom = await page.$eval(".modal-panel .guide-shot.is-zoomed img", (image) => {
        const rect = image.getBoundingClientRect();
        const frame = image.closest(".guide-shot");
        return {
          width: rect.width,
          height: rect.height,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          frameHeight: frame.clientHeight,
          frameScrollHeight: frame.scrollHeight,
          overflowY: getComputedStyle(frame).overflowY,
        };
      });
      assert(zoom.width <= zoom.naturalWidth + 1 && zoom.height <= zoom.naturalHeight + 1, `${locale}: zoom enlarges the source screenshot: ${JSON.stringify(zoom)}`);
      if (zoom.naturalHeight > zoom.frameHeight + 1) assert(zoom.overflowY === "auto" && zoom.frameScrollHeight > zoom.frameHeight, `${locale}: tall zoomed screenshot cannot scroll: ${JSON.stringify(zoom)}`);
      await page.keyboard.press("Escape");
      await page.waitForFunction(() => !document.querySelector(".modal-panel"), { timeout: 5000 });
    }

    const nextShot = await page.$("[data-guide-next-shot]");
    if (nextShot) {
      const before = state.shotPager;
      await nextShot.click();
      await page.waitForFunction((counter) => document.querySelector("[data-guide-shot-index]")?.textContent?.trim() !== counter, { timeout: 5000 }, before);
      const nextState = await page.evaluate(() => ({
        src: document.querySelector(".guide-shot img")?.currentSrc,
        counter: document.querySelector("[data-guide-shot-index]")?.textContent?.trim(),
      }));
      assert(/\d+\s*\/\s*\d+/.test(nextState.counter ?? "") && nextState.counter !== before, `${locale}: chapter “${title}” screenshot navigation did not advance`);
      await page.click("[data-guide-prev-shot]");
      await page.waitForFunction((counter) => document.querySelector("[data-guide-shot-index]")?.textContent?.trim() === counter, { timeout: 5000 }, before);
    }
  }

  return buttons.length;
}

function verifyGeneratedAssets() {
  const rows = JSON.parse(readFileSync(fileURLToPath(GUIDE_DATA), "utf8"));
  for (const locale of ["ru", "en"]) {
    const expected = new Set(rows.flatMap((row) => row.payload.shots.map((shot) => shot.images[locale].split("/").at(-1))));
    const directory = fileURLToPath(new URL(`${locale}/`, GUIDE_STATIC));
    const actual = new Set(readdirSync(directory).filter((filename) => filename.endsWith(".webp")));
    const stale = [...actual].filter((filename) => !expected.has(filename));
    const missing = [...expected].filter((filename) => !actual.has(filename));
    assert(stale.length === 0 && missing.length === 0, `${locale}: screenshot directory differs from current guide manifest (stale ${stale.length}, missing ${missing.length})`);
  }
}

async function main() {
  await seedDemo(BACKEND);
  const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ["--hide-scrollbars", "--force-device-scale-factor=1"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(`${FRONTEND}/`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async (commander) => {
      localStorage.setItem("sindaris-locale", "ru");
      localStorage.setItem("sindaris-theme", "dark");
      const response = await fetch("/api/v1/auth/dev-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...commander, upsert: true }),
      });
      if (!response.ok) throw new Error(`Demo sign-in failed (${response.status})`);
    }, COMMANDER);

    await page.goto(`${FRONTEND}/?tab=guide`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction((count) => document.querySelectorAll(".guide-toc-list button").length === count, { timeout: 60000 }, EXPECTED_CHAPTERS);
    const desktop = await page.evaluate(() => ({
      mobileToc: getComputedStyle(document.querySelector(".guide-toc-mobile")).display,
      desktopToc: getComputedStyle(document.querySelector(".guide-toc-list")).display,
    }));
    assert(desktop.mobileToc === "none" && desktop.desktopToc !== "none", `Desktop TOC layout is incorrect: ${JSON.stringify(desktop)}`);

    const ruChapters = await verifyChapters(page, "ru");
    await page.evaluate(() => localStorage.setItem("sindaris-locale", "en"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((count) => document.querySelectorAll(".guide-toc-list button").length === count, { timeout: 60000 }, EXPECTED_CHAPTERS);
    const enChapters = await verifyChapters(page, "en");

    await page.setViewport({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction((count) => document.querySelectorAll("#guide-mobile-jump option").length === count, { timeout: 60000 }, EXPECTED_CHAPTERS);
    const mobile = await page.evaluate(() => ({
      selector: getComputedStyle(document.querySelector(".guide-toc-mobile")).display,
      desktopList: getComputedStyle(document.querySelector(".guide-toc-list")).display,
      options: document.querySelectorAll("#guide-mobile-jump option").length,
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    assert(mobile.selector !== "none" && mobile.desktopList === "none", `Mobile TOC layout is incorrect: ${JSON.stringify(mobile)}`);
    assert(mobile.options === EXPECTED_CHAPTERS, `Mobile TOC has ${mobile.options} chapters`);
    assert(mobile.width <= mobile.viewport + 1, `Guide has horizontal overflow on mobile: ${JSON.stringify(mobile)}`);
    await page.select("#guide-mobile-jump", "planning");
    await page.waitForFunction(() => document.querySelector("article h2")?.textContent?.includes("Operation planning"), { timeout: 15000 });
    await page.waitForSelector(".guide-shot img", { timeout: 15000 });
    await page.waitForFunction(() => {
      const image = document.querySelector(".guide-shot img");
      return image?.complete && image.naturalWidth > 0;
    }, { timeout: 15000 });
    const mobileGuideShot = await page.$eval(".guide-shot img", (image) => {
      const rect = image.getBoundingClientRect();
      return { width: rect.width, height: rect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
    });
    assert(mobileGuideShot.width <= mobileGuideShot.naturalWidth + 1 && mobileGuideShot.height <= mobileGuideShot.naturalHeight + 1, `Mobile guide enlarges its screenshot: ${JSON.stringify(mobileGuideShot)}`);

    await page.goto(`${FRONTEND}/?tab=tools&tool=planning`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".planning-canvas [data-region]", { timeout: 60000 });
    const emptyPlanning = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      regions: document.querySelectorAll(".planning-canvas [data-region]").length,
      selected: document.querySelectorAll(".planning-canvas .is-region-selected").length,
      markers: document.querySelectorAll(".planning-canvas .planning-marker").length,
      details: performance.getEntriesByType("resource").map((entry) => new URL(entry.name).pathname).filter((path) => path.includes("/api/v1/world/map/regions")),
    }));
    assert(emptyPlanning.width <= emptyPlanning.viewport + 1, `Planning map overflows mobile: ${JSON.stringify(emptyPlanning)}`);
    assert(emptyPlanning.regions >= 40 && emptyPlanning.selected === 0 && emptyPlanning.markers === 0, `Planning did not start as an empty map overview: ${JSON.stringify(emptyPlanning)}`);
    assert(emptyPlanning.details.length === 0, `Empty planning map requested region details: ${emptyPlanning.details.join(", ")}`);

    await page.click('[data-guide="planning-regions"]');
    await page.waitForFunction(() => document.querySelectorAll(".planning-hex.is-selecting").length >= 40, { timeout: 30000 });
    await page.click('[data-region="DeadLandsHex"]');
    const secondRegion = await page.$$eval("[data-region]", (regions) => {
      const first = regions.find((region) => region.dataset.region === "DeadLandsHex");
      const x = Number.parseFloat(first?.style.left ?? "0");
      const y = Number.parseFloat(first?.style.top ?? "0");
      return regions.filter((region) => region !== first).sort((a, b) => {
        const distance = (region) => Math.hypot(Number.parseFloat(region.style.left) - x, Number.parseFloat(region.style.top) - y);
        return distance(a) - distance(b);
      })[0]?.dataset.region;
    });
    assert(secondRegion, "Mobile planning map has no adjacent region to select");
    await page.click(`[data-region="${secondRegion}"]`);
    await page.click('[data-guide="planning-regions"]');
    await page.waitForFunction(() => document.querySelectorAll(".planning-canvas [data-region]").length === 2, { timeout: 30000 });
    await page.waitForFunction(() => document.querySelector(".planning-filters-head")?.getAttribute("aria-expanded") === "false", { timeout: 3000 });
    await page.waitForSelector(".planning-marker", { timeout: 30000 });
    const selectedPlanning = await page.evaluate((selectedRegion) => {
      const canvas = document.querySelector(".planning-canvas").getBoundingClientRect();
      const hexes = [...document.querySelectorAll(".planning-canvas [data-region]")].map((region) => region.getBoundingClientRect());
      const detailUrls = performance.getEntriesByType("resource").map((entry) => new URL(entry.name)).filter((url) => url.pathname.includes("/api/v1/world/map/regions"));
      const details = detailUrls.map((url) => [...url.searchParams.entries()].filter(([key]) => key.startsWith("regions")).flatMap(([, value]) => value.split(",")).sort().join(","));
      const expected = ["DeadLandsHex", selectedRegion].sort().join(",");
      const markerRegions = [...document.querySelectorAll(".planning-marker")].map((marker) => marker.closest("[data-region]")?.dataset.region);
      const filter = document.querySelector(".planning-filters-head").getBoundingClientRect();
      const markers = [...document.querySelectorAll(".planning-marker")];
      const tooltipWidths = markers.map((marker) => Number.parseFloat(getComputedStyle(marker, "::after").maxWidth));
      const bounds = { left: Math.min(...hexes.map((hex) => hex.left)), top: Math.min(...hexes.map((hex) => hex.top)), right: Math.max(...hexes.map((hex) => hex.right)), bottom: Math.max(...hexes.map((hex) => hex.bottom)) };
      return { width: document.documentElement.scrollWidth, viewport: window.innerWidth, canvas: [canvas.left, canvas.top, canvas.right, canvas.bottom], hex: [bounds.left, bounds.top, bounds.right, bounds.bottom], filter: [filter.left, filter.top, filter.right, filter.bottom], regions: hexes.length, selected: document.querySelectorAll(".planning-hex.is-region-selected").length, markers: markers.length, markerRegions, tooltipWidths, details, expected };
    }, secondRegion);
    assert(selectedPlanning.width <= selectedPlanning.viewport + 1, `Selected mobile plan has horizontal overflow: ${JSON.stringify(selectedPlanning)}`);
    assert(selectedPlanning.regions === 2 && selectedPlanning.selected === 2, `Mobile plan retained unselected regions: ${JSON.stringify(selectedPlanning)}`);
    assert(selectedPlanning.hex[0] >= selectedPlanning.canvas[0] - 2 && selectedPlanning.hex[1] >= selectedPlanning.canvas[1] - 2 && selectedPlanning.hex[2] <= selectedPlanning.canvas[2] + 2 && selectedPlanning.hex[3] <= selectedPlanning.canvas[3] + 2, `Selected mobile hexes do not fit the map: ${JSON.stringify(selectedPlanning)}`);
    assert(selectedPlanning.filter[3] - selectedPlanning.filter[1] < 80, `Mobile building filters did not collapse after selection: ${JSON.stringify(selectedPlanning)}`);
    assert(selectedPlanning.details.some((keys) => keys?.split(",").sort().join(",") === selectedPlanning.expected), `Mobile map requested details outside the selected hexes: ${JSON.stringify(selectedPlanning)}`);
    assert(selectedPlanning.markers > 0 && selectedPlanning.markerRegions.every((region) => region === "DeadLandsHex" || region === secondRegion), `Mobile map showed buildings outside selected hexes: ${JSON.stringify(selectedPlanning)}`);
    assert(selectedPlanning.tooltipWidths.every((width) => width <= 320), `Mobile building tooltip is oversized: ${JSON.stringify(selectedPlanning)}`);

    await page.click('[data-guide="planning-frontline-toggle"]');
    await page.waitForSelector(".planning-frontline path", { timeout: 30000 });
    const frontline = await page.evaluate(() => [...document.querySelectorAll(".planning-frontline path")].map((path) => {
      const d = path.getAttribute("d") ?? "";
      const start = d.match(/^M\s*(-?[\d.eE]+)\s+(-?[\d.eE]+)/);
      const segments = [...d.matchAll(/C\s*(-?[\d.eE]+)\s+(-?[\d.eE]+),\s*(-?[\d.eE]+)\s+(-?[\d.eE]+),\s*(-?[\d.eE]+)\s+(-?[\d.eE]+)/g)];
      let previous = start ? [Number(start[1]), Number(start[2])] : null;
      let maxJump = 0;
      for (const segment of segments) {
        const end = [Number(segment[5]), Number(segment[6])];
        if (previous) maxJump = Math.max(maxJump, Math.hypot(end[0] - previous[0], end[1] - previous[1]));
        previous = end;
      }
      return {
        stroke: path.getAttribute("stroke"),
        dash: path.getAttribute("stroke-dasharray"),
        curve: d.includes(" C "),
        segments: segments.length,
        maxJump,
      };
    }));
    assert(frontline.length === 2 && frontline.every((line) => line.dash === null && line.curve), `Frontline is not drawn as a continuous smooth stroke: ${JSON.stringify(frontline)}`);
    assert(frontline.every((line) => line.maxJump <= 3072), `Frontline contains a long jump between town-hall pairs: ${JSON.stringify(frontline)}`);
    verifyGeneratedAssets();
    assert(pageErrors.length === 0, `Browser runtime errors: ${pageErrors.join("; ")}`);

    console.log(JSON.stringify({ result: "PASS", ruChapters, enChapters, mobileOptions: mobile.options, mobileWidth: `${mobile.width}/${mobile.viewport}`, planningOverview: "empty / overview only", planningSelection: "2 selected / details scoped / map fits", frontline, legacyMarkers: 0 }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
