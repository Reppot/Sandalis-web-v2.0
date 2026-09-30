import { env } from "@/shared/config/env";

export interface ApiErrorOptions {
  status: number;
  message: string;
  payload?: unknown;
}

export class ApiError extends Error {
  status: number;
  payload?: unknown;

  constructor({ status, message, payload }: ApiErrorOptions) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Единый типизированный HTTP-клиент приложения.
 * Работает как на стороне сервера (NextJS), так и на клиенте.
 * Автоматически передает credentials (куки) для авторизации.
 */
export const apiClient = {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...rest } = options;
    
    // Формируем query-параметры
    let url = `${env.apiUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          searchParams.append(key, String(val));
        }
      });
      const queryStr = searchParams.toString();
      if (queryStr) {
        url += `?${queryStr}`;
      }
    }

    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const config: RequestInit = {
      ...rest,
      headers: {
        ...defaultHeaders,
        ...headers,
      },
      // Важно для работы httpOnly-cookie сессий кросс-доменно
      credentials: "include", 
    };

    try {
      const response = await fetch(url, config);

      if (response.status === 204) {
        return {} as T;
      }

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        throw new ApiError({
          status: response.status,
          message: typeof data === "object" && data !== null && "detail" in data 
            ? String((data as { detail: unknown }).detail) 
            : "HTTP Request Failed",
          payload: data,
        });
      }

      return data as T;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        status: 500,
        message: error instanceof Error ? error.message : "Network error occurred",
      });
    }
  },

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: "GET" });
  },

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  },
};