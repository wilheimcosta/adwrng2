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
    return "Falha de conexão com o backend (Supabase). Verifique VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.";
  }
  return message || fallback;
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
 * Consulta o endpoint /aerodromos/status/localidades/{ICAO} diretamente na REDEMET.
 * Retorna o "flag" (ex.: g/y/r) que vem antes do METAR na resposta.
 */
export async function fetchAerodromeStatus(icao: string): Promise<{ flag: string | null; error?: string }> {
  const apiKey = import.meta.env.VITE_REDEMET_API_KEY;
  if (!apiKey) {
    return { flag: null, error: "VITE_REDEMET_API_KEY não configurada no .env." };
  }

  try {
    const url = `https://api-redemet.decea.mil.br/aerodromos/status/localidades/${icao.toUpperCase()}?api_key=${apiKey}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return { flag: null, error: `REDEMET retornou ${response.status}` };
    }

    const data = await response.json();
    // Formato esperado: { data: [ [ 'SBVT', 'Nome', lat, lon, 'g', 'METAR...' ] ] }
    const row = (data as any)?.data?.[0];
    const flag = Array.isArray(row) ? (row[4] ?? null) : null;
    return { flag: flag ? String(flag) : null };
  } catch (e) {
    console.error("Fetch error:", e);
    return { flag: null, error: formatNetworkError(e, "Unknown error occurred") };
  }
}
