import { fetchWithTimeout, queryValue, sendJson, type ApiRequest, type ApiResponse } from "../server/http";

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed" });
  const apiKey = process.env.AISWEB_API_KEY;
  const apiPass = process.env.AISWEB_API_PASS;
  if (!apiKey || !apiPass) return sendJson(response, 503, { error: "Serviço AISWEB não configurado." });
  const codes = Array.from(new Set(queryValue(request.query.codes).toUpperCase().split(",").filter((code) => /^[A-Z]{4}$/.test(code))));
  if (!codes.length) return sendJson(response, 400, { error: "Nenhum ICAO válido foi informado." });
  const url = new URL("https://api.decea.mil.br/aisweb/");
  url.search = new URLSearchParams({ apiKey, apiPass, area: "rotaer", aero: codes.join(",") }).toString();
  try {
    const upstream = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/xml,text/xml;q=0.9" } });
    const body = await upstream.text();
    if (!upstream.ok) return sendJson(response, upstream.status, { error: `AISWEB retornou ${upstream.status}` });
    response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    return response.status(200).send(body);
  } catch { return sendJson(response, 504, { error: "Tempo esgotado ao consultar a AISWEB." }); }
}
