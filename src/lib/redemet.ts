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
    const alerts: RedemetAlert[] =
      (Array.isArray(payload?.data) ? payload.data : null) ??
      (Array.isArray(payload?.data?.data) ? payload.data.data : null) ??
      (Array.isArray(payload?.data?.data?.data) ? payload.data.data.data : null) ??
      [];

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
    const url = `https://api-redemet.decea.mil.br/aerodromos/status/localidades/${icao.toUpperCase()}?api_key=${apiKey}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { flag: null, reportText: "", hasAdWarning: false, warningText: null, error: `REDEMET retornou ${response.status}` };
    }

    const data = await response.json();
    const rows = Array.isArray((data as any)?.data) ? (data as any).data : [];
    const upperIcao = icao.toUpperCase();
    const row = rows.find((r: unknown) => Array.isArray(r) && String((r as any)[0] ?? "").toUpperCase() === upperIcao) ?? rows[0];
    const flag = Array.isArray(row) ? (row[4] ?? null) : null;
    const reportText = Array.isArray(row) ? String(row[5] ?? "") : "";
    const warning = extractAdWarning(reportText);
    return {
      flag: flag ? String(flag) : null,
      reportText,
      hasAdWarning: warning.hasAdWarning,
      warningText: warning.warningText,
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
      name: item.querySelector("name")?.textContent?.trim() ?? "",
      city: item.querySelector("city")?.textContent?.trim() ?? "",
      uf: item.querySelector("uf")?.textContent?.trim().toUpperCase() ?? "",
    }));

    return { data };
  } catch (error) {
    return {
      data: [],
      error: formatNetworkError(error, "Falha ao consultar AISWEB."),
    };
  }
}
