type VercelRequest = { method?: string; query: Record<string, string | string[] | undefined> };
type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): { json(payload: unknown): void; send(payload: string): void };
};

export type ApiRequest = VercelRequest;
export type ApiResponse = VercelResponse;
export const queryValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
export const isIcao = (value: string) => /^[A-Z]{4}$/.test(value);

export function sendJson(response: ApiResponse, status: number, payload: unknown) {
  response.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");
  response.status(status).json(payload);
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timeout); }
}

export function utcHourTimestamp(hoursAgo = 0): string {
  const date = new Date();
  date.setUTCHours(date.getUTCHours() - hoursAgo);
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}`;
}
