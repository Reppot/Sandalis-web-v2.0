import { ProductionCalculator } from "@/features/production";

// бывшие tools/*: FactoryWorkspace (15 КБ) + RefineryWorkspace (12,6 КБ),
// собранные в одну фичу с чистым domain на бэкенде
export default function ProductionPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <ProductionCalculator />
    </main>
  );
}
