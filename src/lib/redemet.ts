export interface RedemetAlert {
  id: string;
  tipo: string;
  mensagem: string;
  data_validade_ini?: string;
  data_validade_fim?: string;
  [key: string]: unknown;
}

export interface RedemetResponse {
  data?: RedemetAlert[];
  error?: string;
}

export type AerodromeStatusDetails = {
  flag: string | null;
  reportText: string;
  hasAdWarning: boolean;
  warningText: string | null;
  error?: string;
};

export type AiswebAerodrome = {
  code: string;
  name: string;
  city: string;
  uf: string;
};

export type MetarHistoryItem = {
  mens: string;
  recebimento?: string;
  validade_inicial: string;
};

export type SynopHistoryItem = {
  mens: string;
  validade_inicial: string;
};

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue => typeof value === "object" && value !== null;
const asRows = (value: unknown): RecordValue[] => (Array.isArray(value) ? value.filter(isRecord) : []);
const dataOf = (value: unknown): unknown => (isRecord(value) ? value.data : undefined);
const getRedemetRows = (payload: unknown) => asRows(dataOf(dataOf(payload)));
const getStatusRows = (payload: unknown): unknown[][] => {
  const rows = dataOf(payload);
  return Array.isArray(rows) ? rows.filter(Array.isArray) : [];
};

function toTitleCase(value: string): string {
  return String(value ?? "")
    .toLocaleLowerCase("pt-BR")
    .replace(/(^|[\s\-/'(])\p{L}/gu, (ch) => ch.toLocaleUpperCase("pt-BR"));
}

function normalizeText(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function isAerodromeWarning(alert: RedemetAlert): boolean {
  const rawMsg = String(alert.mensagem ?? alert.mens ?? "");
  const rawTipo = String(alert.tipo ?? "");

  const tipo = normalizeText(String(rawTipo));
  const msg = normalizeText(String(rawMsg));

  if (msg.includes("ad wrng") || msg.includes("aerodrome warning")) return true;
  if (tipo.includes("aerodromo") || msg.includes("aerodromo")) return true;
  if (tipo.includes("aviso") && (msg.includes("ad") || msg.includes("aerodromo"))) return true;

  return false;
}

function formatNetworkError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "Falha de conexão com a API da REDEMET. Verifique conectividade.";
  }
  return message || fallback;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  return isRecord(payload) && typeof payload.error === "string" ? payload.error : fallback;
}

const wmoCache = new Map<string, string>();
let wmoCsvMapPromise: Promise<Map<string, string>> | null = null;

async function loadWmoMapFromCsv(): Promise<Map<string, string>> {
  if (wmoCsvMapPromise) return wmoCsvMapPromise;

  wmoCsvMapPromise = (async () => {
    const response = await fetch("/StationList_WMO.csv", {
      method: "GET",
      headers: { Accept: "text/csv,text/plain;q=0.9,*/*;q=0.8" },
    });
    if (!response.ok) {
      throw new Error(`Falha ao carregar StationList_WMO.csv (${response.status}).`);
    }

    const csv = await response.text();
    const map = new Map<string, string>();
    const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const match = line.match(/^([^,]+),.*?,(\d{5})$/);
      if (!match) continue;
      const icao = String(match[1] ?? "").trim().toUpperCase();
      const wmo = String(match[2] ?? "").trim();
      if (/^[A-Z0-9]{4}$/.test(icao) && /^\d{5}$/.test(wmo)) {
        map.set(icao, wmo);
      }
    }
    return map;
  })();

  return wmoCsvMapPromise;
}

async function fetchWmoIdFromRedemetMetar(icao: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/redemet?resource=metar&icao=${encodeURIComponent(icao)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const first = getRedemetRows(await response.json())[0];
    const raw = first?.id_estacao ?? first?.idEstacao ?? first?.idEstacaoWmo;
    const wmo = String(raw ?? "").trim();
    return /^\d{5}$/.test(wmo) ? wmo : null;
  } catch {
    return null;
  }
}

async function fetchWmoIdFromStationInfo(icao: string): Promise<string | null> {
  try {
    const response = await fetch(`/api/stationinfo?ids=${encodeURIComponent(icao)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const first = Array.isArray(payload) && isRecord(payload[0]) ? payload[0] : null;
    const wmo = String(first?.wmoId ?? first?.wmoid ?? first?.wmo ?? "").trim();
    return /^\d{5}$/.test(wmo) ? wmo : null;
  } catch {
    return null;
  }
}

async function fetchWmoIdByIcao(icao: string): Promise<string | null> {
  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(station)) return null;
  if (wmoCache.has(station)) return wmoCache.get(station) ?? null;

  try {
    const csvMap = await loadWmoMapFromCsv();
    const csvWmo = csvMap.get(station) ?? null;
    if (csvWmo) {
      wmoCache.set(station, csvWmo);
      return csvWmo;
    }
  } catch {
    // fall through
  }

  const redemetWmo = await fetchWmoIdFromRedemetMetar(station);
  if (redemetWmo) {
    wmoCache.set(station, redemetWmo);
    return redemetWmo;
  }

  const stationWmo = await fetchWmoIdFromStationInfo(station);
  if (stationWmo) {
    wmoCache.set(station, stationWmo);
    return stationWmo;
  }

  return null;
}

function resolveUtcDate(day: number, hour: number, minute: number, reference: Date): Date {
  const year = reference.getUTCFullYear();
  const month = reference.getUTCMonth();
  const candidateOffsets = [-1, 0, 1].map((monthOffset) =>
    new Date(Date.UTC(year, month + monthOffset, day, hour, minute, 0, 0)),
  );

  return candidateOffsets.reduce((closest, candidate) => {
    const closestDistance = Math.abs(closest.getTime() - reference.getTime());
    const candidateDistance = Math.abs(candidate.getTime() - reference.getTime());
    return candidateDistance < closestDistance ? candidate : closest;
  });
}

function isAdWarningActiveAt(text: string, reference: Date): boolean {
  if (!/AD\s+WRNG/i.test(text)) return false;

  const validityMatch = text
    .toUpperCase()
    .match(/\bVALID\s+(\d{2})(\d{2})(\d{2})\/(\d{2})(\d{2})(\d{2})\b/);

  if (!validityMatch) return true;

  const startsAt = resolveUtcDate(
    Number(validityMatch[1]),
    Number(validityMatch[2]),
    Number(validityMatch[3]),
    reference,
  );
  const endsAt = resolveUtcDate(
    Number(validityMatch[4]),
    Number(validityMatch[5]),
    Number(validityMatch[6]),
    startsAt,
  );

  return reference >= startsAt && reference < endsAt;
}

function extractAdWarning(
  reportText: string,
  reference: Date = new Date(),
): { hasAdWarning: boolean; warningText: string | null } {
  const normalized = String(reportText ?? "");
  if (!normalized.trim()) return { hasAdWarning: false, warningText: null };

  if (/não há aviso para a localidade/i.test(normalized)) {
    return { hasAdWarning: false, warningText: null };
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const warningLine = lines.find((line) => isAdWarningActiveAt(line, reference));
  if (warningLine) return { hasAdWarning: true, warningText: warningLine };

  return { hasAdWarning: false, warningText: null };
}

function extractAlertRows(payload: unknown): RedemetAlert[] {
  const dataLevel = (payload as { data?: unknown })?.data;
  if (Array.isArray(dataLevel)) return dataLevel as RedemetAlert[];

  const nestedLevel = (dataLevel as { data?: unknown } | undefined)?.data;
  if (Array.isArray(nestedLevel)) return nestedLevel as RedemetAlert[];

  const deepLevel = (nestedLevel as { data?: unknown } | undefined)?.data;
  if (Array.isArray(deepLevel)) return deepLevel as RedemetAlert[];

  return [];
}

export async function fetchRedemetAlerts(icao: string): Promise<RedemetResponse> {
  try {
    const response = await fetch(`/api/redemet?resource=alerts&icao=${encodeURIComponent(icao.toUpperCase())}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { error: await responseError(response, `REDEMET retornou ${response.status}`) };
    const payload: unknown = await response.json();
    const root = dataOf(payload);
    const alerts = asRows(root).length ? asRows(root) : asRows(dataOf(root));
    return {
      data: alerts.map((item) => ({
        id: String(item.id ?? ""),
        tipo: String(item.tipo ?? ""),
        mensagem: String(item.mensagem ?? item.mens ?? ""),
        ...item,
      })),
    };
  } catch (error) {
    return { error: formatNetworkError(error, "Falha ao consultar avisos.") };
  }
}

export function determineAlertSeverity(alert: RedemetAlert): "low" | "medium" | "high" | "critical" {
  const message = alert.mensagem.toLowerCase();
  const tipo = alert.tipo.toLowerCase();
  if (message.includes("closed") || message.includes("fechado") || message.includes("danger") || tipo.includes("sigmet"))
    return "critical";
  if (message.includes("thunderstorm") || message.includes("tempestade") || message.includes("severe") || message.includes("turbulence"))
    return "high";
  return message.includes("caution") || message.includes("warning") || message.includes("aviso") ? "medium" : "low";
}

export type FlightRule = "VFR" | "IFR" | "LIFR";
export function mapFlightRuleFromFlag(flag: unknown): FlightRule | null {
  const f = String(flag ?? "").toLowerCase();
  return f === "g" ? "VFR" : f === "y" ? "IFR" : f === "r" ? "LIFR" : null;
}

export async function fetchAerodromeStatusDetails(icao: string): Promise<AerodromeStatusDetails> {
  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(station)) {
    return { flag: null, reportText: "", hasAdWarning: false, warningText: null, error: "ICAO inválido." };
  }

  const nowUtc = new Date();
  let flag: string | null = null;
  let reportText = "";
  let statusError: string | undefined = undefined;

  try {
    const statusResponse = await fetch(`/api/redemet?resource=status&icao=${encodeURIComponent(station)}`, {
      headers: { Accept: "application/json" },
    });
    if (statusResponse.ok) {
      const rows = getStatusRows(await statusResponse.json());
      const row = rows.find((item) => String(item[0] ?? "").toUpperCase() === station) ?? rows[0];
      if (row) {
        flag = row[4] ? String(row[4]) : null;
        reportText = Array.isArray(row) ? String(row[5] ?? "") : "";
      }
    } else {
      statusError = await responseError(statusResponse, `REDEMET retornou HTTP ${statusResponse.status}`);
    }
  } catch (error) {
    statusError = formatNetworkError(error, "Falha ao consultar o status do aeródromo.");
  }

  if (!reportText) {
    try {
      const metarRes = await fetchMetarHistory24h(station);
      if (metarRes.data && metarRes.data.length > 0) {
        reportText = metarRes.data[0].mens;
      }
    } catch {
      // ignore metar fallback error
    }
  }

  let warningText: string | null = null;
  let hasAdWarning = false;

  try {
    const warningResponse = await fetch(`/api/redemet?resource=aviso_pais_list`, {
      headers: { Accept: "application/json" },
    });
    if (warningResponse.ok) {
      const warningPayload = await warningResponse.json();
      const warningRows = extractAlertRows(warningPayload);
      const matchedWarning = warningRows
        .map((row) => String(row.mensagem ?? row.mens ?? "").trim())
        .find((text) => {
          if (!text.toUpperCase().includes(station)) return false;
          return isAdWarningActiveAt(text, nowUtc);
        });
      if (matchedWarning) {
        warningText = matchedWarning;
        hasAdWarning = true;
      }
    }
  } catch {
    // keep status available even if warning endpoint is temporarily unavailable
  }

  if (!hasAdWarning) {
    const fallback = extractAdWarning(reportText, nowUtc);
    hasAdWarning = fallback.hasAdWarning;
    warningText = fallback.warningText;
  }

  return {
    flag,
    reportText,
    hasAdWarning,
    warningText,
    error: !reportText && !flag && statusError ? statusError : undefined,
  };
}

export async function fetchAerodromeStatus(icao: string): Promise<{ flag: string | null; error?: string }> {
  const details = await fetchAerodromeStatusDetails(icao);
  return { flag: details.flag, error: details.error };
}

export function extractIcaosFromAdWarning(warningText: string): string[] {
  const text = String(warningText ?? "").toUpperCase();
  if (!text.trim()) return [];

  const segment = text.includes("AD WRNG") ? text.split("AD WRNG")[0] : text;
  const codes = segment.match(/\b[A-Z]{4}\b/g) ?? [];
  return Array.from(new Set(codes));
}

export async function fetchAiswebAerodromes(codes: string[]): Promise<{ data: AiswebAerodrome[]; error?: string }> {
  const normalized = Array.from(
    new Set(
      codes
        .map((c) => String(c).toUpperCase().trim())
        .filter((c) => /^[A-Z]{4}$/.test(c)),
    ),
  );
  if (!normalized.length) return { data: [] };

  try {
    const response = await fetch(`/api/aisweb?codes=${encodeURIComponent(normalized.join(","))}`, {
      headers: { Accept: "application/xml,text/xml;q=0.9" },
    });
    if (!response.ok) return { data: [], error: `AISWEB retornou ${response.status}` };
    const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
    if (xml.querySelector("parsererror")) return { data: [], error: "Falha ao interpretar XML retornado pela AISWEB." };
    const order = new Map(normalized.map((code, index) => [code, index]));
    const data = Array.from(xml.querySelectorAll("item")).map((item) => ({
      code: item.querySelector("AeroCode")?.textContent?.trim().toUpperCase() ?? "",
      name: toTitleCase(item.querySelector("name")?.textContent?.trim() ?? ""),
      city: item.querySelector("city")?.textContent?.trim() ?? "",
      uf: item.querySelector("uf")?.textContent?.trim().toUpperCase() ?? "",
    }));
    return { data: data.sort((a, b) => (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.code) ?? Number.MAX_SAFE_INTEGER)) };
  } catch (error) {
    return { data: [], error: formatNetworkError(error, "Falha ao consultar AISWEB.") };
  }
}

export async function fetchMetarHistory24h(icao: string): Promise<{ data: MetarHistoryItem[]; error?: string }> {
  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(station)) return { data: [], error: "ICAO inválido para consulta METAR." };
  try {
    const response = await fetch(`/api/redemet?resource=metar&icao=${encodeURIComponent(station)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { data: [], error: await responseError(response, `REDEMET retornou ${response.status} para METAR.`) };
    const data = getRedemetRows(await response.json())
      .map((item) => ({
        mens: String(item.mens ?? ""),
        recebimento: String(item.recebimento ?? ""),
        validade_inicial: String(item.validade_inicial ?? ""),
      }))
      .filter((item) => item.mens && item.validade_inicial);
    return { data };
  } catch (error) {
    return { data: [], error: formatNetworkError(error, "Falha ao consultar histórico METAR.") };
  }
}

export async function fetchSynopHistory24h(icao: string): Promise<{ data: SynopHistoryItem[]; error?: string }> {
  const wmoId = await fetchWmoIdByIcao(icao);
  if (!wmoId) return { data: [], error: `Não foi possível determinar o WMO ID para ${icao}.` };
  try {
    const response = await fetch(`/api/redemet?resource=synop&wmo=${encodeURIComponent(wmoId)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return { data: [], error: await responseError(response, `REDEMET retornou ${response.status} para SYNOP.`) };
    const data = getRedemetRows(await response.json())
      .map((item) => ({
        mens: String(item.mens ?? ""),
        validade_inicial: String(item.validade_inicial ?? ""),
      }))
      .filter((item) => item.mens && item.validade_inicial);
    return { data };
  } catch (error) {
    return { data: [], error: formatNetworkError(error, "Falha ao consultar histórico SYNOP.") };
  }
}

export function parseUtcDate(dateTime: string): Date | null {
  const value = String(dateTime ?? "").trim();
  if (!value) return null;
  const parsed = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveDayHourMinuteWithReference(
  day: number,
  hour: number,
  minute: number,
  reference: Date,
): Date {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const candidate = new Date(Date.UTC(y, m, day, hour, minute, 0, 0));
  const diffDays = Math.round((candidate.getTime() - reference.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays > 20) return new Date(Date.UTC(y, m - 1, day, hour, minute, 0, 0));
  if (diffDays < -20) return new Date(Date.UTC(y, m + 1, day, hour, minute, 0, 0));
  return candidate;
}

export function getMessageNominalUtc(item: MetarHistoryItem): Date | null {
  const ref =
    parseUtcDate(item.validade_inicial) ??
    parseUtcDate(item.recebimento) ??
    new Date();

  const match = String(item.mens ?? "").toUpperCase().match(/\b(\d{2})(\d{2})(\d{2})Z\b/);
  if (!match) return parseUtcDate(item.validade_inicial) ?? null;

  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if ([day, hour, minute].some((v) => Number.isNaN(v))) {
    return parseUtcDate(item.validade_inicial) ?? null;
  }
  return resolveDayHourMinuteWithReference(day, hour, minute, ref);
}

export function toUtcHourKey(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}${String(date.getUTCHours()).padStart(2, "0")}`;
}

export function isMetarWatchMinute(minuteUtc: number): boolean {
  return minuteUtc >= 55 && minuteUtc < 60;
}

export function isSynopticPublicationHour(hourUtc: number): boolean {
  return hourUtc >= 0 && hourUtc <= 23 && hourUtc % 3 === 0;
}

export function nextSynopticHourDate(from: Date): Date {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), 0, 0, 0),
  );
  next.setUTCHours(next.getUTCHours() + 1);
  while (!isSynopticPublicationHour(next.getUTCHours())) {
    next.setUTCHours(next.getUTCHours() + 1);
  }
  return next;
}

function getSynopObservationHourUtc(item: SynopHistoryItem): Date | null {
  const ref = parseUtcDate(item.validade_inicial);
  if (!ref) return null;
  const match = String(item.mens ?? "").toUpperCase().match(/\bAAXX\s+(\d{2})(\d{2})/);
  if (!match) return null;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  if ([day, hour].some((v) => Number.isNaN(v))) return null;
  return resolveDayHourMinuteWithReference(day, hour, 0, ref);
}

export function hasMetarForHour(items: MetarHistoryItem[], targetUtcHourKey: string): boolean {
  return items.some((item) => {
    const upper = String(item.mens ?? "").toUpperCase().trim();
    if (!/^(METAR|SPECI)\b/.test(upper)) return false;
    const nominal = getMessageNominalUtc(item);
    return nominal !== null && toUtcHourKey(nominal) === targetUtcHourKey;
  });
}

export function hasSynopForHour(items: SynopHistoryItem[], targetUtcHourKey: string): boolean {
  return items.some((item) => {
    const parsed = parseUtcDate(item.validade_inicial);
    if (parsed !== null && toUtcHourKey(parsed) === targetUtcHourKey) return true;
    const observation = getSynopObservationHourUtc(item);
    return observation !== null && toUtcHourKey(observation) === targetUtcHourKey;
  });
}

export function isPendingAlertStale(
  pendingSinceMs: number | null,
  nowMs: number,
  maxMs: number,
): boolean {
  return pendingSinceMs !== null && nowMs - pendingSinceMs > maxMs;
}
