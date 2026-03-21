export interface RedemetAlert {
  id: string;
  tipo: string;
  mensagem: string;
  data_validade_ini?: string;
  data_validade_fim?: string;
  [key: string]: any;
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
  recebimento: string;
  validade_inicial: string;
};

export type SynopHistoryItem = {
  mens: string;
  validade_inicial: string;
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
  const rawMsg = (alert as any).mensagem ?? (alert as any).mens ?? "";
  const rawTipo = (alert as any).tipo ?? "";

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
    return "Falha de conexão com a API da REDEMET. Verifique VITE_REDEMET_API_KEY e conectividade.";
  }
  return message || fallback;
}

function getUtcHourTimestamp(hoursAgo = 0): string {
  const date = new Date();
  if (hoursAgo > 0) {
    date.setUTCHours(date.getUTCHours() - hoursAgo);
  }
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${year}${month}${day}${hour}`;
}

type IcaoWmoLookup = {
  icao?: string;
  wmo?: string | null;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  elevation_m?: number | null;
  source: "aviationweather";
  error?: string;
};

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

async function icaoParaWmo(icao: string): Promise<IcaoWmoLookup> {
  const code = String(icao ?? "").trim().toUpperCase();

  if (!/^[A-Z0-9]{4}$/.test(code)) {
    return { source: "aviationweather", error: "ICAO inválido. Exemplo: SBGR" };
  }

  const externalUrl = `https://aviationweather.gov/api/data/stationinfo?ids=${encodeURIComponent(code)}&format=json`;
  const candidates = [
    `/api/stationinfo?ids=${encodeURIComponent(code)}&format=json`,
    externalUrl,
    `https://corsproxy.io/?${encodeURIComponent(externalUrl)}`,
  ];

  let data: unknown = null;
  let lastHttpStatus: number | null = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (response.status === 204) {
        return { source: "aviationweather", error: "Estação não encontrada" };
      }
      if (!response.ok) {
        lastHttpStatus = response.status;
        continue;
      }

      data = await response.json();
      break;
    } catch {
      // Try next candidate URL
    }
  }

  if (!data) {
    return {
      source: "aviationweather",
      error: lastHttpStatus ? `Erro HTTP ${lastHttpStatus}` : "Falha de conexão na consulta do ICAO.",
    };
  }

  if (!Array.isArray(data) || data.length === 0) {
    return { source: "aviationweather", error: "Estação não encontrada" };
  }

  const station = data[0] ?? {};
  const rawWmo = station.wmoId ?? station.wmoid ?? station.wmo ?? null;
  const normalizedWmo =
    rawWmo !== null && rawWmo !== undefined ? String(rawWmo).trim() : null;

  return {
    icao: station.icaoId ?? code,
    wmo: normalizedWmo && /^\d{5}$/.test(normalizedWmo) ? normalizedWmo : null,
    name: station.name ?? station.site ?? null,
    latitude: station.lat ?? null,
    longitude: station.lon ?? null,
    elevation_m: station.elev ?? null,
    source: "aviationweather",
  };
}

async function fetchWmoIdFromRedemetMetar(icao: string): Promise<string | null> {
  const apiKey = import.meta.env.VITE_REDEMET_API_KEY;
  if (!apiKey) return null;

  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z0-9]{4}$/.test(station)) return null;

  const dataFim = getUtcHourTimestamp(0);
  const dataIni = getUtcHourTimestamp(24);

  try {
    const url = new URL(`https://api-redemet.decea.mil.br/mensagens/metar/${station}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("data_ini", dataIni);
    url.searchParams.set("data_fim", dataFim);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;

    const payload = await response.json();
    const rows = Array.isArray((payload as any)?.data?.data) ? (payload as any).data.data : [];
    const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const raw = first?.id_estacao ?? first?.idEstacao ?? first?.idEstacaoWmo ?? null;
    if (raw === null || raw === undefined) return null;

    const normalized = String(raw).trim();
    return /^\d{5}$/.test(normalized) ? normalized : null;
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

    const redemetWmo = await fetchWmoIdFromRedemetMetar(station);
    if (redemetWmo) {
      wmoCache.set(station, redemetWmo);
      return redemetWmo;
    }

    const lookup = await icaoParaWmo(station);
    const wmo = lookup.wmo ?? null;
    if (wmo) {
      wmoCache.set(station, wmo);
      return wmo;
    }
    return null;
  } catch {
    return null;
  }
}

function extractAdWarning(reportText: string): { hasAdWarning: boolean; warningText: string | null } {
  const normalized = String(reportText ?? "");
  if (!normalized.trim()) return { hasAdWarning: false, warningText: null };

  if (/não há aviso para a localidade/i.test(normalized)) {
    return { hasAdWarning: false, warningText: null };
  }

  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const warningLine = lines.find((line) => /AD WRNG/i.test(line));
  if (warningLine) return { hasAdWarning: true, warningText: warningLine };

  return { hasAdWarning: false, warningText: null };
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

function extractAlertRows(payload: unknown): RedemetAlert[] {
  const dataLevel = (payload as { data?: unknown })?.data;
  if (Array.isArray(dataLevel)) return dataLevel as RedemetAlert[];

  const nestedLevel = (dataLevel as { data?: unknown } | undefined)?.data;
  if (Array.isArray(nestedLevel)) return nestedLevel as RedemetAlert[];

  const deepLevel = (nestedLevel as { data?: unknown } | undefined)?.data;
  if (Array.isArray(deepLevel)) return deepLevel as RedemetAlert[];

  return [];
}

/**
 * Busca avisos de aeródromo diretamente na API da REDEMET.
 */
export async function fetchRedemetAlerts(icao: string): Promise<RedemetResponse> {
  const apiKey = import.meta.env.VITE_REDEMET_API_KEY;
  if (!apiKey) {
    return { error: "VITE_REDEMET_API_KEY não configurada no .env." };
  }

  try {
    const url = `https://api-redemet.decea.mil.br/mensagens/aviso/${icao.toUpperCase()}?api_key=${apiKey}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { error: `REDEMET retornou ${response.status}` };
    }

    const payload = await response.json();
    const alerts = extractAlertRows(payload);

    return { data: alerts };
  } catch (error) {
    console.error("Fetch error:", error);
    return {
      error: formatNetworkError(error, "Unknown error occurred"),
    };
  }
}

/**
 * Determine alert severity based on message content and type
 */
export function determineAlertSeverity(alert: RedemetAlert): "low" | "medium" | "high" | "critical" {
  const message = alert.mensagem?.toLowerCase() || "";
  const tipo = alert.tipo?.toLowerCase() || "";

  // Critical keywords
  if (message.includes("closed") || message.includes("fechado") || message.includes("danger") || tipo.includes("sigmet")) {
    return "critical";
  }

  // High severity keywords
  if (message.includes("thunderstorm") || message.includes("tempestade") || message.includes("severe") || message.includes("turbulence")) {
    return "high";
  }

  // Medium severity keywords
  if (message.includes("caution") || message.includes("warning") || message.includes("aviso")) {
    return "medium";
  }

  return "low";
}

export type FlightRule = "VFR" | "IFR" | "LIFR";

export function mapFlightRuleFromFlag(flag: unknown): FlightRule | null {
  const f = String(flag ?? "").toLowerCase();
  if (f === "g") return "VFR";
  if (f === "y") return "IFR";
  if (f === "r") return "LIFR";
  return null;
}

export type AerodromeStatusResult =
  | { ok: true; icao: string; flag: string | null }
  | { ok: false; error: string };

/**
 * Consulta o endpoint /aerodromos/status/localidades/{ICAO} diretamente na REDEMET
 * e extrai:
 * - flag (g/y/r)
 * - texto da resposta (METAR/TAF/WRNG)
 * - presença de AD WRNG.
 */
export async function fetchAerodromeStatusDetails(icao: string): Promise<AerodromeStatusDetails> {
  const apiKey = import.meta.env.VITE_REDEMET_API_KEY;
  if (!apiKey) {
    return {
      flag: null,
      reportText: "",
      hasAdWarning: false,
      warningText: null,
      error: "VITE_REDEMET_API_KEY não configurada no .env.",
    };
  }

  try {
    const station = icao.toUpperCase();
    const statusUrl = `https://api-redemet.decea.mil.br/aerodromos/status/localidades/${station}?api_key=${apiKey}`;
    const statusResponse = await fetch(statusUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!statusResponse.ok) {
      return { flag: null, reportText: "", hasAdWarning: false, warningText: null, error: `REDEMET retornou ${statusResponse.status}` };
    }

    const statusPayload = await statusResponse.json();
    const statusRows = Array.isArray((statusPayload as { data?: unknown })?.data)
      ? ((statusPayload as { data?: unknown[] }).data ?? [])
      : [];
    const row = statusRows.find((r) => Array.isArray(r) && String(r[0] ?? "").toUpperCase() === station) ?? statusRows[0];
    const flag = Array.isArray(row) ? (row[4] ?? null) : null;
    const reportText = Array.isArray(row) ? String(row[5] ?? "") : "";

    let warningText: string | null = null;
    let hasAdWarning = false;

    try {
      const warningUrl = new URL("https://api-redemet.decea.mil.br/mensagens/aviso/pais/list");
      warningUrl.searchParams.set("api_key", apiKey);

      const warningResponse = await fetch(warningUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (warningResponse.ok) {
        const warningPayload = await warningResponse.json();
        const warningRows = extractAlertRows(warningPayload);
        const nowUtc = new Date();
        const matchedWarning = warningRows
          .map((row) => String(row.mens ?? "").trim())
          .find((text) => {
            if (!/AD\s+WRNG/i.test(text)) return false;
            if (!text.toUpperCase().includes(station)) return false;

            const validityMatch = text
              .toUpperCase()
              .match(/\bVALID\s+(\d{2})(\d{2})(\d{2})\/(\d{2})(\d{2})(\d{2})\b/);

            if (!validityMatch) return true;

            const startsAt = resolveUtcDate(
              Number(validityMatch[1]),
              Number(validityMatch[2]),
              Number(validityMatch[3]),
              nowUtc,
            );
            const endsAt = resolveUtcDate(
              Number(validityMatch[4]),
              Number(validityMatch[5]),
              Number(validityMatch[6]),
              startsAt,
            );

            return nowUtc < endsAt;
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
      const fallback = extractAdWarning(reportText);
      hasAdWarning = fallback.hasAdWarning;
      warningText = fallback.warningText;
    }

    return {
      flag: flag ? String(flag) : null,
      reportText,
      hasAdWarning,
      warningText,
    };
  } catch (e) {
    console.error("Fetch error:", e);
    return { flag: null, reportText: "", hasAdWarning: false, warningText: null, error: formatNetworkError(e, "Unknown error occurred") };
  }
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
  const apiKey = import.meta.env.VITE_AISWEB_API_KEY;
  const apiPass = import.meta.env.VITE_AISWEB_API_PASS;
  if (!apiKey || !apiPass) {
    return { data: [], error: "VITE_AISWEB_API_KEY e VITE_AISWEB_API_PASS nao configuradas no .env." };
  }

  const normalized = Array.from(
    new Set(
      codes
        .map((c) => String(c).toUpperCase().trim())
        .filter((c) => /^[A-Z]{4}$/.test(c)),
    ),
  );
  if (!normalized.length) return { data: [] };

  try {
    const url = new URL("https://api.decea.mil.br/aisweb/");
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("apiPass", apiPass);
    url.searchParams.set("area", "rotaer");
    url.searchParams.set("aero", normalized.join(","));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
    });

    if (!response.ok) {
      return { data: [], error: `AISWEB retornou ${response.status}` };
    }

    const xmlText = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    const parserError = xml.querySelector("parsererror");
    if (parserError) {
      return { data: [], error: "Falha ao interpretar XML retornado pela AISWEB." };
    }

    const items = Array.from(xml.querySelectorAll("item"));
    const data: AiswebAerodrome[] = items.map((item) => ({
      code: item.querySelector("AeroCode")?.textContent?.trim().toUpperCase() ?? "",
      name: toTitleCase(item.querySelector("name")?.textContent?.trim() ?? ""),
      city: item.querySelector("city")?.textContent?.trim() ?? "",
      uf: item.querySelector("uf")?.textContent?.trim().toUpperCase() ?? "",
    }));

    const order = new Map(normalized.map((code, idx) => [code, idx]));
    data.sort((a, b) => (order.get(a.code) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.code) ?? Number.MAX_SAFE_INTEGER));

    return { data };
  } catch (error) {
    return {
      data: [],
      error: formatNetworkError(error, "Falha ao consultar AISWEB."),
    };
  }
}

export async function fetchMetarHistory24h(icao: string): Promise<{ data: MetarHistoryItem[]; error?: string }> {
  const apiKey = import.meta.env.VITE_REDEMET_API_KEY;
  if (!apiKey) {
    return { data: [], error: "VITE_REDEMET_API_KEY não configurada no .env." };
  }

  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(station)) {
    return { data: [], error: "ICAO inválido para consulta METAR." };
  }

  const dataFim = getUtcHourTimestamp(0);
  const dataIni = getUtcHourTimestamp(24);

  try {
    const url = new URL(`https://api-redemet.decea.mil.br/mensagens/metar/${station}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("data_ini", dataIni);
    url.searchParams.set("data_fim", dataFim);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { data: [], error: `REDEMET retornou ${response.status} para METAR.` };
    }

    const payload = await response.json();
    const rows = Array.isArray((payload as any)?.data?.data) ? (payload as any).data.data : [];
    const data: MetarHistoryItem[] = rows
      .map((item: any) => ({
        mens: String(item?.mens ?? ""),
        recebimento: String(item?.recebimento ?? ""),
        validade_inicial: String(item?.validade_inicial ?? ""),
      }))
      .filter((item: MetarHistoryItem) => item.mens && item.validade_inicial);

    return { data };
  } catch (error) {
    return {
      data: [],
      error: formatNetworkError(error, "Falha ao consultar histórico METAR."),
    };
  }
}

export async function fetchSynopHistory24h(icao: string): Promise<{ data: SynopHistoryItem[]; error?: string }> {
  const apiKey = import.meta.env.VITE_REDEMET_API_KEY;
  if (!apiKey) {
    return { data: [], error: "VITE_REDEMET_API_KEY não configurada no .env." };
  }

  const station = String(icao ?? "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(station)) {
    return { data: [], error: "ICAO inválido para consulta SYNOP." };
  }

  const wmoId = await fetchWmoIdByIcao(station);
  if (!wmoId) {
    return {
      data: [],
      error: `Nao foi possivel determinar o WMO ID para ${station}.`,
    };
  }

  const dataFim = getUtcHourTimestamp(0);
  const dataIni = getUtcHourTimestamp(24);

  try {
    const url = new URL("https://api-redemet.decea.mil.br/mensagens/synop");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("estacao", wmoId);
    url.searchParams.set("data_ini", dataIni);
    url.searchParams.set("data_fim", dataFim);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { data: [], error: `REDEMET retornou ${response.status} para SYNOP.` };
    }

    const payload = await response.json();
    const rows = Array.isArray((payload as any)?.data?.data) ? (payload as any).data.data : [];
    const data: SynopHistoryItem[] = rows
      .map((item: any) => ({
        mens: String(item?.mens ?? ""),
        validade_inicial: String(item?.validade_inicial ?? ""),
      }))
      .filter((item: SynopHistoryItem) => item.mens && item.validade_inicial);

    return { data };
  } catch (error) {
    return {
      data: [],
      error: formatNetworkError(error, "Falha ao consultar histórico SYNOP."),
    };
  }
}
