import * as React from "react";
import { Card, Input } from "@/shared";
import { calculateMpf } from "@/features/production/lib/mpfCalculator";

export const MpfCalculator: React.FC = () => {
  const [baseCost, setBaseCost] = React.useState(100);
  const [queueCount, setQueueCount] = React.useState(9);
  const [crateMultiplier, setCrateMultiplier] = React.useState(3);

  const result = calculateMpf({ baseCost, queueCount, crateMultiplier });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="space-y-4">
        <h3 className="text-base font-bold text-sindaris-accent">ПАРАМЕТРЫ ОЧЕРЕДИ MPF</h3>

        <Input
          label="Базовая стоимость за ящик (Bmats / Rmats / Emats)"
          type="number"
          min="1"
          value={baseCost}
          onChange={(e) => setBaseCost(parseInt(e.target.value) || 0)}
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-mono font-medium text-sindaris-muted">
            Количество слотов в заказе (1–9)
          </label>
          <input
            type="range"
            min="1"
            max="9"
            value={queueCount}
            onChange={(e) => setQueueCount(parseInt(e.target.value) || 1)}
            className="w-full accent-sindaris-accent cursor-pointer"
          />
          <div className="flex justify-between text-xs font-mono text-sindaris-muted">
            <span>1 слот</span>
            <span className="text-sindaris-accent font-bold">{queueCount} слотов</span>
            <span>9 слотов (макс)</span>
          </div>
        </div>

        <Input
          label="Ящиков в одной очереди (для техники 3, для припасов до 5)"
          type="number"
          min="1"
          max="5"
          value={crateMultiplier}
          onChange={(e) => setCrateMultiplier(parseInt(e.target.value) || 1)}
        />
      </Card>

      <Card className="space-y-4 bg-sindaris-bg/50">
        <h3 className="text-base font-bold text-sindaris-accent">ИТОГОВЫЙ РАСЧЁТ MPF</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-sindaris-panel p-3 rounded-md border border-sindaris-border">
            <span className="text-xs text-sindaris-muted">Всего ящиков:</span>
            <p className="text-xl font-bold font-mono text-sindaris-text mt-1">{result.totalCrates} шт</p>
          </div>
          <div className="bg-sindaris-panel p-3 rounded-md border border-sindaris-border">
            <span className="text-xs text-sindaris-muted">Экономия ресурсов:</span>
            <p className="text-xl font-bold font-mono text-green-400 mt-1">-{result.savingsPercentage}%</p>
          </div>
          <div className="bg-sindaris-panel p-3 rounded-md border border-sindaris-border">
            <span className="text-xs text-sindaris-muted">Итоговая стоимость:</span>
            <p className="text-xl font-bold font-mono text-yellow-400 mt-1">{result.totalCost} мат.</p>
          </div>
          <div className="bg-sindaris-panel p-3 rounded-md border border-sindaris-border">
            <span className="text-xs text-sindaris-muted">Цена за 1 ящик:</span>
            <p className="text-xl font-bold font-mono text-sindaris-text mt-1">{result.costPerCrate} мат.</p>
          </div>
        </div>

        <div className="pt-2">
          <span className="text-xs font-bold text-sindaris-muted uppercase">Стоимость по слотам:</span>
          <div className="flex gap-1 mt-2">
            {result.tierCosts.map((cost, i) => (
              <div
                key={i}
                className="flex-1 bg-sindaris-panel border border-sindaris-border p-1.5 text-center rounded text-[11px] font-mono"
                title={`Слот ${i + 1}`}
              >
                <div className="text-sindaris-muted text-[9px]">#{i + 1}</div>
                <div className="text-sindaris-accent font-bold">{cost}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};