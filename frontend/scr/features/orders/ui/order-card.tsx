import { formatTons } from "../lib/format-tons";
import type { Order } from "../model/types";

export function OrderCard({ order }: { order: Order }) {
  return (
    <li className="rounded-lg border p-4">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold">{order.itemName}</h3>
        <span className="text-sm">{order.statusLabel}</span>
      </header>
      <p className="mt-2 text-sm text-zinc-500">
        {formatTons(order.quantityKg)} · готово к {order.deadlineLabel}
      </p>
    </li>
  );
}
