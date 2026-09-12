import { fetchWithTimeout, getQueryParam, isIcao, sendJson, type ApiRequest, type ApiResponse } from "../server/http.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const icao = getQueryParam(request, "ids").trim().toUpperCase();
  if (!isIcao(icao)) return sendJson(response, 400, { error: "ICAO inválido." });
  const format = getQueryParam(request, "format").trim().toLowerCase();
  try {
    if (format === "raw") {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
      const upstream = await fetchWithTimeout(
        `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icao)}&format=raw&taf=true&hours=24&date=${date}`,
        { headers: { Accept: "text/plain" } },
        10_000,
      );
      if (!upstream.ok) {
        return sendJson(response, 502, { error: "AVIATIONWEATHER indisponível." });
      }
      const text = await upstream.text();
      if (typeof response.setHeader === "function") {
        response.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=40");
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
      if (typeof response.status === "function") {
        const res = response.status(200);
        if (res && typeof res.send === "function") {
          res.send(text);
          return;
        }
      }
      response.statusCode = 200;
      if (typeof response.end === "function") response.end(text);
      return;
    }
    const resource = getQueryParam(request, "resource").trim().toLowerCase() === "taf" ? "taf" : "metar";
    const upstream = await fetchWithTimeout(`https://aviationweather.gov/api/data/${resource}?ids=${encodeURIComponent(icao)}&format=json`, { headers: { Accept: "application/json" } }, 8_000);
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      return sendJson(response, 502, { error: "AVIATIONWEATHER indisponível." });
    }
    return sendJson(response, 200, payload);
  } catch {
    return sendJson(response, 504, { error: "Tempo esgotado ao consultar a AVIATIONWEATHER." });
  }
}