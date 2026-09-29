// Единственная HTTP-дверь фронтенда. Вызов fetch() в компонентах
// и хуках запрещён — только через этот клиент:
// единая обработка ошибок, креды и типизация ответа.

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include", // JWT живёт в httpOnly-cookie
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }
  return (await res.json()) as T;
}
