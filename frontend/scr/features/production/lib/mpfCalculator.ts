import type { MpfCalculationInput, MpfCalculationResult } from "@/features/production/model/types";

// Скидки MPF в Foxhole по тирам очереди (1 очередь = 10%, 2 = 20%, ..., max 50%)
const MPF_DISCOUNT_TIERS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5];

export function calculateMpf(input: MpfCalculationInput): MpfCalculationResult {
  const { baseCost, queueCount, crateMultiplier } = input;
  const count = Math.min(Math.max(1, queueCount), 9);
  
  let totalCost = 0;
  const tierCosts: number[] = [];

  for (let i = 0; i < count; i++) {
    const discount = MPF_DISCOUNT_TIERS[i];
    const costForTier = Math.round(baseCost * (1 - discount) * crateMultiplier);
    tierCosts.push(costForTier);
    totalCost += costForTier;
  }

  const totalCrates = count * crateMultiplier;
  const standardCost = baseCost * totalCrates;
  const savings = standardCost - totalCost;
  const savingsPercentage = standardCost > 0 ? Math.round((savings / standardCost) * 100) : 0;
  const costPerCrate = totalCrates > 0 ? Math.round(totalCost / totalCrates) : 0;

  return {
    totalCrates,
    totalCost,
    savingsPercentage,
    costPerCrate,
    tierCosts,
  };
}