import * as React from "react";
import type { OrderFilterState } from "@/features/orders/model/types";
import { Input, Button } from "@/shared";

interface OrderFiltersProps {
  filters: OrderFilterState;
  onChange: (filters: OrderFilterState) => void;
}

const statusOptions: { label: string; value: OrderFilterState["status"] }[] = [
  { label: "Все", value: "all" },
  { label: "Черновик", value: "draft" },
  { label: "Очередь", value: "queued" },
  { label: "В работе", value: "in_progress" },
  { label: "Готово", value: "done" },
  { label: "Отменены", value: "cancelled" },
];

export const OrderFilters: React.FC<OrderFiltersProps> = ({ filters, onChange }) => {
  return (
    <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
      <div className="flex gap-1.5 w-full md:w-auto overflow-x-auto">
        {statusOptions.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={filters.status === opt.value ? "primary" : "secondary"}
            onClick={() => onChange({ ...filters, status: opt.value })}
          >
            {opt.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={filters.mineOnly ? "primary" : "ghost"}
          onClick={() => onChange({ ...filters, mineOnly: !filters.mineOnly })}
        >
          Мои
        </Button>
      </div>

      <div className="w-full md:w-72 relative">
        <Input
          placeholder="Поиск по названию / коду..."
          value={filters.searchQuery}
          onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
        />
      </div>
    </div>
  );
};
