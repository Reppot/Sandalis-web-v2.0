/**
 * Схема валидации переменных окружения фронтенда.
 * Предотвращает запуск приложения с некорректными/отсутствующими настройками.
 */

const getEnvVar = (key: string, defaultValue?: string): string => {
  const value = process.env[key] ?? defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is missing`);
  }
  return value;
};

export const env = {
  // Публичный URL API бэкенда для клиентских и серверных запросов
  apiUrl: getEnvVar("NEXT_PUBLIC_API_URL", "http://localhost:8000"),
  
  // Имя куки для сессии (зафиксировано в требованиях)
  sessionCookieName: getEnvVar("NEXT_PUBLIC_SESSION_COOKIE", "sindaris_session"),
  
  // URL CDN/S3 для медиафайлов и иконок
  cdnUrl: getEnvVar("NEXT_PUBLIC_CDN_URL", ""),
} as const;