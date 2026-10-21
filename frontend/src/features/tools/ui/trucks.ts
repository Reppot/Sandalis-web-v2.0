import type { MessageKey, Translate } from "@/shared";
import type { SummaryLine } from "@/features/tools/ui/ResourceSummaryPanel";

/** Вместимость транспорта в ящиках: Dunne Transport — 15, Flatbed с грузовым контейнером — 60. */
const TRUCKS: { label: MessageKey; crates: number; icon: string }[] = [
  { label: "tools.truckDunne", crates: 15, icon: "/api/v1/assets/items/TruckW.png" },
  { label: "tools.truckFlatbed", crates: 60, icon: "/api/v1/assets/items/FlatbedTruck.png" },
];

/** Итог «в грузовиках»: сколько рейсов на crates ящиков и сколько ящиков в последнем. */
export function truckLines(crates: number, t: Translate): SummaryLine[] {
  if (crates <= 0) return [];
  return TRUCKS.map(({ label, crates: cap, icon }) => {
    const trucks = Math.ceil(crates / cap);
    const last = crates - (trucks - 1) * cap;
    return {
      name: t(label, { n: cap }),
      quantity: trucks,
      unit: t("tools.trucksUnit"),
      icon,
      note: last < cap ? t("tools.truckLast", { n: last, cap }) : undefined,
    };
  });
}
