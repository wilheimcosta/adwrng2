import { fetchWithTimeout, getQueryParam, isIcao, sendJson, type ApiRequest, type ApiResponse } from "../server/http.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const icao = getQueryParam(request, "ids").trim().toUpperCase();
  if (!isIcao(icao)) return sendJson(response, 400, { error: "ICAO inválido." });
  const resource = getQueryParam(request, "resource").trim().toLowerCase() === "taf" ? "taf" : "metar";
  try {
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