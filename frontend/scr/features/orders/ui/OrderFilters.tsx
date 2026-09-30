import * as React from "react";
import type { OrderStatus } from "@/entities/order";
import type { OrderFilterState } from "@/features/orders/model/types";
import { Input, Button } from "@/shared";
import { Search } from "lucide-react";

interface OrderFiltersProps {
  filters: OrderFilterState;
  onChange: (filters: OrderFilterState) => void;
}

const statusOptions: { label: string; value: OrderFilterState["status"] }[] = [
  { label: "Все", value: "all" },
  { label: "В очереди", value: "pending" },
  { label: "В работе", value: "processing" },
  { label: "Выполненные", value: "completed" },
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
      </div>

      <div className="w-full md:w-72 relative">
        <Input
          placeholder="Поиск по складу / предмету..."
          value={filters.searchQuery}
          onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
        />
      </div>
    </div>
  );
};