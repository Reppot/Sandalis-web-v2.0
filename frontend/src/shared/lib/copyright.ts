/** Год запуска терминала: в уведомлении «© 2026» или «© 2026–2027». */
export const COPYRIGHT_SINCE = 2026;
export const COPYRIGHT_HOLDER = "Reppot / SINDARIS";

export function copyrightYears(now = new Date()): string {
  const year = now.getFullYear();
  return year > COPYRIGHT_SINCE ? `${COPYRIGHT_SINCE}–${year}` : String(COPYRIGHT_SINCE);
}
