const getEnvVar = (value: string | undefined, defaultValue: string): string => value ?? defaultValue;

// NEXT_PUBLIC_* инлайнятся при сборке, поэтому читаем их явными литералами.
export const env = {
  /**
   * База для запросов к API. Пусто = тот же origin: браузер ходит на /api/*,
   * а Next проксирует на BACKEND_URL (см. next.config.ts). Так сессионная кука
   * first-party и не зависит от блокировки сторонних кук.
   * Задавать абсолютный URL — только для отладки без прокси.
   */
  apiUrl: getEnvVar(process.env.NEXT_PUBLIC_API_URL, "").replace(/\/$/, ""),
  cdnUrl: getEnvVar(process.env.NEXT_PUBLIC_CDN_URL, ""),
  enableDevLogin: getEnvVar(process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN, "false") === "true",
} as const;
