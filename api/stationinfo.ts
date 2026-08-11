import { fetchWithTimeout, getQueryParam, isIcao, sendJson, type ApiRequest, type ApiResponse } from "../server/http.js";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const icao = getQueryParam(request, "ids").trim().toUpperCase();
  if (!isIcao(icao)) return sendJson(response, 400, { error: "ICAO inválido." });
  try {
    const upstream = await fetchWithTimeout(`https://aviationweather.gov/api/data/stationinfo?ids=${encodeURIComponent(icao)}&format=json`, { headers: { Accept: "application/json" } }, 5_000);
    const payload = await upstream.json().catch(() => null);
    return sendJson(response, upstream.status, payload ?? { error: "Resposta inválida do serviço de estações." });
  } catch {
    return sendJson(response, 504, { error: "Tempo esgotado ao consultar a estação." });
  }
}
