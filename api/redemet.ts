import { fetchWithTimeout, isIcao, queryValue, sendJson, utcHourTimestamp, type ApiRequest, type ApiResponse } from "../server/http";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  else if (resource === "aviso_pais_list") path = "/mensagens/aviso/pais/list";
  else if (resource === "metar" && isIcao(icao)) {
    path = `/mensagens/metar/${icao}`;
    params.set("data_ini", utcHourTimestamp(24)); params.set("data_fim", utcHourTimestamp());
  } else if (resource === "synop" && /^\d{5}$/.test(wmo)) {
    path = "/mensagens/synop";
    params.set("estacao", wmo); params.set("data_ini", utcHourTimestamp(24)); params.set("data_fim", utcHourTimestamp());
  } else return sendJson(response, 400, { error: "Parâmetros de consulta inválidos." });

  try {
    const url = `https://api-redemet.decea.mil.br${path}?${params.toString()}`;
    let upstream: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      upstream = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 4_000);
      if (upstream.status < 500 || attempt === 2) break;
      await sleep(250 * (attempt + 1));
    }
    if (!upstream) return sendJson(response, 502, { error: "REDEMET indisponível." });
    const payload = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      console.error("REDEMET upstream failure", { resource, status: upstream.status, payload });
      return sendJson(response, 502, { error: "REDEMET indisponível após novas tentativas. Tente novamente em instantes." });
    }
    return sendJson(response, 200, payload);
  } catch (error) {
    console.error("REDEMET request failed", { resource, error: error instanceof Error ? error.message : String(error) });
    return sendJson(response, 504, { error: "Tempo esgotado ao consultar a REDEMET." });
  }
}
