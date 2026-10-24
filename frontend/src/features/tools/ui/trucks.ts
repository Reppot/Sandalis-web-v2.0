import type { MessageKey, Translate } from "@/shared";
import type { SummaryLine } from "@/features/tools/ui/ResourceSummaryPanel";

type Truck = { label: MessageKey; crates: number; icon: string };

/** Вместимость транспорта в ящиках: Dunne Transport — 15, Flatbed с грузовым контейнером — 60. */
const DUNNE: Truck = { label: "tools.truckDunne", crates: 15, icon: "/api/v1/assets/items/TruckW.png" };
const FLATBED: Truck = { label: "tools.truckFlatbed", crates: 60, icon: "/api/v1/assets/items/FlatbedTruck.png" };

function line({ label, crates: cap, icon }: Truck, crates: number, t: Translate): SummaryLine {
  const trucks = Math.ceil(crates / cap);
  const last = crates - (trucks - 1) * cap;
  return {
    name: t(label, { n: cap }),
    quantity: trucks,
    unit: t("tools.trucksUnit"),
    icon,
    note: last < cap ? t("tools.truckLast", { n: last, cap }) : undefined,
  };
}

/**
 * Итог «в грузовиках». crates — ящики предметов (Dunne и Flatbed с контейнером);
 * shippables — ящики техники и сооружений: Dunne их не возит, на Flatbed — по одному.
 * dunneOnly — только Dunne (Factory).
 */
export function truckLines(crates: number, t: Translate, opts: { shippables?: number; dunneOnly?: boolean } = {}): SummaryLine[] {
  const shippables = opts.shippables ?? 0;
  const out: SummaryLine[] = [];
  if (crates > 0) out.push(line(DUNNE, crates, t));
  if (crates > 0 && !opts.dunneOnly) out.push(line(FLATBED, crates, t));
  if (shippables > 0 && !opts.dunneOnly) {
    out.push({ name: t("tools.truckFlatbedShippable"), quantity: shippables, unit: t("tools.trucksUnit"), icon: FLATBED.icon, note: t("tools.truckShippableNote") });
  }
  return out;
}
