export type ApiRequest = {
  method?: string;
  url?: string;
  query?: Record<string, string | string[] | undefined>;
};

export type ApiResponse = {
  setHeader(name: string, value: string): void;
  status?: (code: number) => { json: (payload: unknown) => void; send: (payload: string) => void };
  statusCode?: number;
  end?: (chunk?: string | Uint8Array) => void;
};

export function getQueryParam(request: ApiRequest, key: string): string {
  if (request.query && typeof request.query === "object") {
    const val = request.query[key];
    if (Array.isArray(val)) return val[0] ?? "";
    if (typeof val === "string") return val;
  }
  try {
    const url = new URL(request.url ?? "", "http://localhost");
    return url.searchParams.get(key) ?? "";
  } catch {
    return "";
  }
}

export const queryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] ?? "" : value ?? "";

export const isIcao = (value: string) => /^[A-Z]{4}$/.test(String(value ?? "").trim().toUpperCase());

export function sendJson(response: ApiResponse, status: number, payload: unknown) {
  try {
    if (typeof response.setHeader === "function") {
      response.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");
      response.setHeader("Content-Type", "application/json");
    }
    if (typeof response.status === "function") {
      const res = response.status(status);
      if (res && typeof res.json === "function") {
        res.json(payload);
        return;
      }
    }
    response.statusCode = status;
    if (typeof response.end === "function") {
      response.end(JSON.stringify(payload));
    }
  } catch (err) {
    console.error("sendJson error:", err);
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export function utcHourTimestamp(hoursAgo = 0): string {
  const date = new Date();
  if (hoursAgo !== 0) {
    date.setUTCHours(date.getUTCHours() - hoursAgo);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}${month}${day}${hour}`;
}
