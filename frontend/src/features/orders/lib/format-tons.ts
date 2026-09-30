// Тоннаж по-человечески: 12 500 кг → «12,5 т».
export function formatTons(kg: number): string {
  if (kg < 1000) return kg + " кг";
  const tons = (kg / 1000).toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
  return tons + " т";
}
