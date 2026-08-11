import { fetchWithTimeout, isIcao, queryValue, sendJson, utcHourTimestamp, type ApiRequest, type ApiResponse } from "../server/http";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const apiKey = process.env.REDEMET_API_KEY;
  if (!apiKey) return sendJson(response, 503, { error: "Serviço REDEMET não configurado." });

  const resource = queryValue(request.query.resource);
  const icao = queryValue(request.query.icao).trim().toUpperCase();
  const wmo = queryValue(request.query.wmo).trim();
  const params = new URLSearchParams({ api_key: apiKey });
  let path = "";
  if (resource === "status" && isIcao(icao)) path = `/aerodromos/status/localidades/${icao}`;
  else if (resource === "alerts" && isIcao(icao)) path = `/mensagens/aviso/${icao}`;
  else if (resource === "metar" && isIcao(icao)) {
    path = `/mensagens/metar/${icao}`;
    params.set("data_ini", utcHourTimestamp(24)); params.set("data_fim", utcHourTimestamp());
  } else if (resource === "synop" && /^\d{5}$/.test(wmo)) {
    path = "/mensagens/synop";
    params.set("estacao", wmo); params.set("data_ini", utcHourTimestamp(24)); params.set("data_fim", utcHourTimestamp());
  } else return sendJson(response, 400, { error: "Parâmetros de consulta inválidos." });

  try {
    const upstream = await fetchWithTimeout(`https://api-redemet.decea.mil.br${path}?${params.toString()}`, { headers: { Accept: "application/json" } });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) return sendJson(response, upstream.status, { error: `REDEMET retornou ${upstream.status}` });
    return sendJson(response, 200, payload);
  } catch { return sendJson(response, 504, { error: "Tempo esgotado ao consultar a REDEMET." }); }
}
