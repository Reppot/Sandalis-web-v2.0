// Демо-клан для скриншотов руководства: склады, таймеры, рапорты, приглашения.
// Работает напрямую с API (BACKEND), рассчитан на пустую БД (см. README.md).
import { readFileSync } from "node:fs";

const catalog = JSON.parse(readFileSync(new URL("../../backend/app/seed/data/catalog.json", import.meta.url), "utf8"));
const code = (english) => {
  const item = catalog.find((c) => c.english_name === english);
  if (!item) throw new Error(`catalog: ${english}`);
  return item;
};

export const COMMANDER = { user_id: "guide-commander", clan_id: "SANDALIS", role: "owner", display_name: "Reppot" };

async function api(base, token, method, path, body) {
  const r = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Accept-Language": "ru", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

const HOUR = 3600;

export async function seedDemo(base) {
  const { access_token: token } = await api(base, null, "POST", "/auth/dev-token", { ...COMMANDER, upsert: true });
  const call = (method, path, body) => api(base, token, method, path, body);
  const line = (english, quantity, unit = "crate") => ({ name: code(english).name, item_code: code(english).code, quantity, unit });
  const draft = [line("7.62mm", 6), line("Bandages", 4), line("Shovel", 2, "unit")].map((l) => ({ ...l, icon_url: catalog.find((c) => c.code === l.item_code).icon_url }));

  // повторный запуск: демо-клан уже создан — только достаём закреплённый склад
  const existing = (await call("GET", "/stockpiles?limit=200")).items;
  const found = existing.find((s) => s.name === "Port Kirknell");
  if (found) return { token, pinnedId: found.id, draft };

  const stock = async (name, region, items) => {
    const { stockpile } = await call("POST", "/stockpiles", { name, region });
    await call("PUT", `/stockpiles/${stockpile.id}/items`, {
      source: "clipboard",
      items: items.map(([english, quantity]) => ({ item_code: code(english).code, quantity })),
    });
    return stockpile;
  };

  const port = await stock("Port Kirknell", "The Moors", [
    ["Basic Materials", 4200], ["Refined Materials", 860], ["Explosive Powder", 640], ["Heavy Explosive Powder", 220],
    ["7.62mm", 380], ["9mm", 240], ["12.7mm", 160], ["Bandages", 300], ["First Aid Kit", 90], ["Blood Plasma", 120],
    ["Soldier Supplies", 150], ["Maintenance Supplies", 1200], ["Gas Mask Filter", 80], ["Shovel", 25], ["Hammer", 18],
  ]);
  const seaport = await stock("Seaport Kingstone", "Callahan's Passage", [["Basic Materials", 1500], ["Diesel", 600], ["Petrol", 300]]);
  const depot = await stock("Storage Depot Blemish", "Deadlands", [["Refined Materials", 300], ["Concrete Materials", 120]]);

  const timer = async (stockpile, seconds, note) =>
    (await call("POST", "/timers", {
      title: stockpile.name,
      ends_at: new Date(Date.now() + seconds * 1000).toISOString(),
      duration_seconds: seconds,
      stockpile_id: stockpile.id,
      note,
    })).timer;
  const t1 = await timer(port, 0.7 * HOUR, null);
  await timer(seaport, 9.5 * HOUR, null);
  await timer(depot, 31 * HOUR, "Резерв бетона для бункеров");
  await call("POST", `/timers/${t1.id}/events`, { message: "Обновил склад, оставил 2 ящика бмата" });
  await call("POST", `/timers/${t1.id}/events`, { message: "Нужна смена до 22:00" });

  const r1 = await call("POST", "/reports", {
    title: "Снабжение фронта: Moors",
    note: "Приоритет — медицина и 7.62",
    meta: { region: "The Moors", stockpile: "Port Kirknell" },
    lines: [line("7.62mm", 10), line("Bandages", 6), line("First Aid Kit", 4), line("Soldier Supplies", 8), line("Basic Materials", 12)],
  });
  await call("POST", "/reports", {
    title: "Артиллерийский заказ",
    meta: { region: "Callahan's Passage", stockpile: "Seaport Kingstone" },
    lines: [line("120mm", 9), line("150mm", 5)],
  });
  await call("POST", `/reports/${r1.report.id}/status`, { status: "in_progress" });

  await call("POST", "/auth/invites", { role: "member", max_uses: 10, expires_in_hours: 72 });
  await call("POST", "/auth/invites", { role: "officer", max_uses: 1, expires_in_hours: 24 });

  return { token, pinnedId: port.id, draft };
}

// node demo.mjs — только создать демо-клан (до привязки сервера в БД, см. README.md)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  seedDemo(process.env.GUIDE_BACKEND ?? "http://127.0.0.1:8020").then((d) => console.log("demo ok, pinned", d.pinnedId));
}
