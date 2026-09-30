import { StockpilesBoard } from "@/features/stockpiles";

// наследник StorageMonitor.tsx и api/stockpiles — теперь фича
export default function StockpilesPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <StockpilesBoard />
    </main>
  );
}
