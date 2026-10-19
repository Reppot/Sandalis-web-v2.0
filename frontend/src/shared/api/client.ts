import { env } from "@/shared/config/env";

export interface ApiErrorOptions {
  status: number;
  message: string;
  code?: string;
  payload?: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  payload?: unknown;

  constructor({ status, message, code, payload }: ApiErrorOptions) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

// 401 посреди работы = кука истекла. Сессионный провайдер подписывается и
// сбрасывает session, чтобы вкладки показали экран входа, а не сырую ошибку.
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | null | undefined | ReadonlyArray<string>>;
}

function errorMessage(data: unknown, fallback: string): { message: string; code?: string } {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    const nested = record.error;
    if (nested && typeof nested === "object") {
      const error = nested as Record<string, unknown>;
      return {
        message: typeof error.message === "string" ? error.message : fallback,
        code: typeof error.code === "string" ? error.code : undefined,
      };
    }
    if (typeof record.detail === "string") {
      return { message: record.detail };
    }
  }
  return { message: fallback };
}

export const apiClient = {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { params, headers, ...rest } = options;

    let url = `${env.apiUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val === undefined || val === null) return;
        // массив -> повтор ключа (?status=open&status=in_progress), как ждёт FastAPI
        for (const item of Array.isArray(val) ? val : [val]) searchParams.append(key, String(item));
      });
      const queryStr = searchParams.toString();
      if (queryStr) {
        url += `?${queryStr}`;
      }
    }

    const defaultHeaders: Record<string, string> = {
      Accept: "application/json",
      "X-Locale": "ru",
      "Accept-Language": "ru",
    };
    // FormData сам выставит multipart-границу
    if (rest.body && !(rest.body instanceof FormData)) {
      defaultHeaders["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      ...rest,
      headers: {
        ...defaultHeaders,
        ...headers,
      },
      // same-origin через прокси; include — только при отладке с абсолютным NEXT_PUBLIC_API_URL
      credentials: env.apiUrl ? "include" : "same-origin",
    });

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get("content-type");
    const isJson = contentType?.includes("application/json");
    const data = isJson ? await response.json() : await response.text();

    if (!response.ok) {
      if (response.status === 401) {
        unauthorizedHandler?.();
      }
      const parsed = errorMessage(data, "HTTP Request Failed");
      throw new ApiError({
        status: response.status,
        message: parsed.message,
        code: parsed.code,
        payload: data,
      });
    }

    return data as T;
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

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },

  /** multipart/form-data: файлы сканера, PNG-вложения. */
  postForm<T>(path: string, form: FormData, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: "POST", body: form });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: "DELETE" });
  },
};
