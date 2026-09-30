export interface MpfCalculationInput {
  baseCost: number;       // Стоимость одного ящика на обычном заводе
  queueCount: number;     // Количество заказов в очереди (от 1 до 9)
  crateMultiplier: number;// Количество ящиков в одной очереди (обычно 1, 3 или 5)
}

export interface MpfCalculationResult {
  totalCrates: number;
  totalCost: number;
  savingsPercentage: number;
  costPerCrate: number;
  tierCosts: number[];
}