export interface RedemetAlert {
  id: string;
  tipo: string;
  mensagem: string;
  data_validade_ini?: string;
  data_validade_fim?: string;
  [key: string]: unknown;
}

export interface RedemetResponse { data?: RedemetAlert[]; error?: string }
export type AerodromeStatusDetails = { flag: string | null; reportText: string; hasAdWarning: boolean; warningText: string | null; error?: string };
export type AiswebAerodrome = { code: string; name: string; city: string; uf: string };
export type MetarHistoryItem = { mens: string; recebimento: string; validade_inicial: string };
export type SynopHistoryItem = { mens: string; validade_inicial: string };
type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null;
const asRows = (value: unknown): RecordValue[] => Array.isArray(value) ? value.filter(isRecord) : [];
const dataOf = (value: unknown): unknown => isRecord(value) ? value.data : undefined;
const getRedemetRows = (payload: unknown) => asRows(dataOf(dataOf(payload)));
const getStatusRows = (payload: unknown): unknown[][] => {
  const rows = dataOf(payload);
  return Array.isArray(rows) ? rows.filter(Array.isArray) : [];
};

function toTitleCase(value: string): string {
  return String(value ?? "").toLocaleLowerCase("pt-BR").replace(/(^|[\s\-/'(])\p{L}/gu, (ch) => ch.toLocaleUpperCase("pt-BR"));
}

function normalizeText(input: string) { return input.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, ""); }

export function isAerodromeWarning(alert: RedemetAlert): boolean {
  const tipo = normalizeText(String(alert.tipo ?? ""));
  const msg = normalizeText(String(alert.mensagem ?? alert.mens ?? ""));
  return msg.includes("ad wrng") || msg.includes("aerodrome warning") || tipo.includes("aerodromo") || msg.includes("aerodromo") || (tipo.includes("aviso") && msg.includes("ad"));
}

function formatNetworkError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed/i.test(message) ? "Falha de conexão com os serviços meteorológicos." : message || fallback;
}

const wmoCache = new Map<string, string>();
let wmoCsvMapPromise: Promise<Map<string, string>> | null = null;

async function loadWmoMapFromCsv(): Promise<Map<string, string>> {
  if (!wmoCsvMapPromise) {
    wmoCsvMapPromise = fetch("/StationList_WMO.csv", { headers: { Accept: "text/csv,text/plain;q=0.9" } })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Falha ao carregar StationList_WMO.csv (${response.status}).`);
        const map = new Map<string, string>();
        (await response.text()).split(/\r?\n/).slice(1).forEach((line) => {
          const match = line.trim().match(/^([^,]+),.*?,(\d{5})$/);
          if (match && /^[A-Z0-9]{4}$/.test(match[1].toUpperCase())) map.set(match[1].toUpperCase(), match[2]);
        });
        return map;
      })
      .catch((error) => { wmoCsvMapPromise = null; throw error; });
  }
  return wmoCsvMapPromise;
}

async function fetchWmoIdFromRedemetMetar(icao: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/redemet?resource=metar&icao=${encodeURIComponent(icao)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const first = getRedemetRows(await response.json())[0];
    const raw = first?.id_estacao ?? first?.idEstacao ?? first?.idEstacaoWmo;
    const wmo = String(raw ?? "").trim();
    return /^\d{5}$/.test(wmo) ? wmo : null;
  } catch { return null; }
}

async function fetchWmoIdFromStationInfo(icao: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/stationinfo?ids=${encodeURIComponent(icao)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const first = Array.isArray(payload) && isRecord(payload[0]) ? payload[0] : null;
    const wmo = String(first?.wmoId ?? first?.wmoid ?? first?.wmo ?? "").trim();
    return /^\d{5}$/.test(wmo) ? wmo : null;
  } catch { return null; }
}

async function fetchWmoIdByIcao(icao: string): Promise<string | null> {
  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(station)) return null;
  if (wmoCache.has(station)) return wmoCache.get(station) ?? null;
  try {
    const csvWmo = (await loadWmoMapFromCsv()).get(station);
    if (csvWmo) { wmoCache.set(station, csvWmo); return csvWmo; }
  } catch { /* fall through to service lookup */ }
  const redemetWmo = await fetchWmoIdFromRedemetMetar(station);
  const wmo = redemetWmo ?? await fetchWmoIdFromStationInfo(station);
  if (wmo) wmoCache.set(station, wmo);
  return wmo;
}

function extractAdWarning(reportText: string) {
  const lines = String(reportText ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const index = lines.findIndex((line) => /AD WRNG/i.test(line));
  return index < 0 || /não há aviso para a localidade/i.test(reportText) ? { hasAdWarning: false, warningText: null } : { hasAdWarning: true, warningText: lines.slice(index).join(" ") };
}

export async function fetchRedemetAlerts(icao: string): Promise<RedemetResponse> {
  try {
    const response = await fetch(`/api/redemet?resource=alerts&icao=${encodeURIComponent(icao.toUpperCase())}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return { error: `REDEMET retornou ${response.status}` };
    const payload: unknown = await response.json();
    const root = dataOf(payload);
    const alerts = asRows(root).length ? asRows(root) : asRows(dataOf(root));
    return { data: alerts.map((item) => ({ id: String(item.id ?? ""), tipo: String(item.tipo ?? ""), mensagem: String(item.mensagem ?? item.mens ?? ""), ...item })) };
  } catch (error) { return { error: formatNetworkError(error, "Falha ao consultar avisos.") }; }
}

export function determineAlertSeverity(alert: RedemetAlert): "low" | "medium" | "high" | "critical" {
  const message = alert.mensagem.toLowerCase(); const tipo = alert.tipo.toLowerCase();
  if (message.includes("closed") || message.includes("fechado") || message.includes("danger") || tipo.includes("sigmet")) return "critical";
  if (message.includes("thunderstorm") || message.includes("tempestade") || message.includes("severe") || message.includes("turbulence")) return "high";
  return message.includes("caution") || message.includes("warning") || message.includes("aviso") ? "medium" : "low";
}

export type FlightRule = "VFR" | "IFR" | "LIFR";
export function mapFlightRuleFromFlag(flag: unknown): FlightRule | null { const f = String(flag ?? "").toLowerCase(); return f === "g" ? "VFR" : f === "y" ? "IFR" : f === "r" ? "LIFR" : null; }

export async function fetchAerodromeStatusDetails(icao: string): Promise<AerodromeStatusDetails> {
  try {
    const response = await fetch(`/api/redemet?resource=status&icao=${encodeURIComponent(icao.toUpperCase())}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return { flag: null, reportText: "", hasAdWarning: false, warningText: null, error: `REDEMET retornou ${response.status}` };
    const rows = getStatusRows(await response.json());
    const row = rows.find((item) => String(item[0] ?? "").toUpperCase() === icao.toUpperCase()) ?? rows[0];
    const reportText = Array.isArray(row) ? String(row[5] ?? "") : "";
    const warning = extractAdWarning(reportText);
    return { flag: row?.[4] ? String(row[4]) : null, reportText, ...warning };
  } catch (error) { return { flag: null, reportText: "", hasAdWarning: false, warningText: null, error: formatNetworkError(error, "Falha ao consultar o status do aeródromo.") }; }
}

export async function fetchAerodromeStatus(icao: string) { const details = await fetchAerodromeStatusDetails(icao); return { flag: details.flag, error: details.error }; }
export function extractIcaosFromAdWarning(warningText: string) {
  const text = String(warningText ?? "").toUpperCase();
  const segment = text.includes("AD WRNG") ? text.split("AD WRNG")[0] : text;
  return Array.from(new Set(segment.match(/\b[A-Z]{4}\b/g) ?? []));
}

export async function fetchAiswebAerodromes(codes: string[]): Promise<{ data: AiswebAerodrome[]; error?: string }> {
  const normalized = Array.from(new Set(codes.map((code) => String(code).toUpperCase().trim()).filter((code) => /^[A-Z]{4}$/.test(code))));
  if (!normalized.length) return { data: [] };
  try {
    const response = await fetch(`/api/aisweb?codes=${encodeURIComponent(normalized.join(","))}`, { headers: { Accept: "application/xml,text/xml;q=0.9" } });
    if (!response.ok) return { data: [], error: `AISWEB retornou ${response.status}` };
    const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
    if (xml.querySelector("parsererror")) return { data: [], error: "Falha ao interpretar XML retornado pela AISWEB." };
    const order = new Map(normalized.map((code, index) => [code, index]));
    const data = Array.from(xml.querySelectorAll("item")).map((item) => ({ code: item.querySelector("AeroCode")?.textContent?.trim().toUpperCase() ?? "", name: toTitleCase(item.querySelector("name")?.textContent?.trim() ?? ""), city: item.querySelector("city")?.textContent?.trim() ?? "", uf: item.querySelector("uf")?.textContent?.trim().toUpperCase() ?? "" }));
    return { data: data.sort((a, b) => (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.code) ?? Number.MAX_SAFE_INTEGER)) };
  } catch (error) { return { data: [], error: formatNetworkError(error, "Falha ao consultar AISWEB.") }; }
}

export async function fetchMetarHistory24h(icao: string): Promise<{ data: MetarHistoryItem[]; error?: string }> {
  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(station)) return { data: [], error: "ICAO inválido para consulta METAR." };
  try {
    const response = await fetch(`/api/redemet?resource=metar&icao=${encodeURIComponent(station)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return { data: [], error: `REDEMET retornou ${response.status} para METAR.` };
    const data = getRedemetRows(await response.json()).map((item) => ({ mens: String(item.mens ?? ""), recebimento: String(item.recebimento ?? ""), validade_inicial: String(item.validade_inicial ?? "") })).filter((item) => item.mens && item.validade_inicial);
    return { data };
  } catch (error) { return { data: [], error: formatNetworkError(error, "Falha ao consultar histórico METAR.") }; }
}

export async function fetchSynopHistory24h(icao: string): Promise<{ data: SynopHistoryItem[]; error?: string }> {
  const wmoId = await fetchWmoIdByIcao(icao);
  if (!wmoId) return { data: [], error: `Não foi possível determinar o WMO ID para ${icao}.` };
  try {
    const response = await fetch(`/api/redemet?resource=synop&wmo=${encodeURIComponent(wmoId)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) return { data: [], error: `REDEMET retornou ${response.status} para SYNOP.` };
    const data = getRedemetRows(await response.json()).map((item) => ({ mens: String(item.mens ?? ""), validade_inicial: String(item.validade_inicial ?? "") })).filter((item) => item.mens && item.validade_inicial);
    return { data };
  } catch (error) { return { data: [], error: formatNetworkError(error, "Falha ao consultar histórico SYNOP.") }; }
}
