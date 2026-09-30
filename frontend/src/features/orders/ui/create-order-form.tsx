"use client";

import type { NewOrder } from "../model/types";

export function CreateOrderForm({
  onSubmit,
}: {
  onSubmit: (data: NewOrder) => void;
}) {
  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        onSubmit({
          itemId: Number(data.get("itemId")),
          quantity: Number(data.get("quantity")),
        });
      }}
    >
      <select name="itemId" className="rounded-md border px-3 py-2">
        {/* опции приходят из entities/item */}
      </select>
      <input
        name="quantity"
        type="number"
        min={1}
        defaultValue={100}
        className="w-28 rounded-md border px-3 py-2"
      />
      <button type="submit" className="rounded-md border px-4 py-2">
        Заказать
      </button>
    </form>
  );
}
