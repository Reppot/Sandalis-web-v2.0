// Сколько минут нужно цеху: 100 штук ≈ 26 минут + очередь.
// Чистая функция: ни импортов, ни сети — тестируется одной строкой.
const MINUTES_PER_BATCH = 26;
const BATCH_SIZE = 100;

export function calcDeadlineMinutes(quantity: number, queueSize = 0): number {
  const batches = Math.ceil(quantity / BATCH_SIZE);
  return (batches + queueSize) * MINUTES_PER_BATCH;
}

// рядом лежит calc-deadline.test.ts — vitest, три кейса.
// (на бэкенде живёт зеркал: app/domain/timing/calc_deadline.py)
