import { supabase } from "@/integrations/supabase/client";

export interface RedemetAlert {
  id: string;
  tipo: string;
  mensagem: string;
  data_validade_ini?: string;
  data_validade_fim?: string;
  [key: string]: any;
}

export interface RedemetResponse {
  data?: {
    data?: RedemetAlert[];
  };
  error?: string;
}

/**
 * Fetch aviation alerts for a specific ICAO code via secure Edge Function proxy
 */
export async function fetchRedemetAlerts(icao: string): Promise<RedemetResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('redemet-proxy', {
      body: { icao: icao.toUpperCase() },
    });

    if (error) {
      console.error('Edge function error:', error);
      return { error: error.message || 'Failed to fetch alerts' };
    }

    return { data };
  } catch (error) {
    console.error('Fetch error:', error);
    return { 
      error: error instanceof Error ? error.message : 'Unknown error occurred' 
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
 * Consulta o endpoint /aerodromos/status/localidades/{ICAO} via função de backend.
 * Retorna o "flag" (ex.: g/y/r) que vem antes do METAR na resposta.
 */
export async function fetchAerodromeStatus(icao: string): Promise<{ flag: string | null; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("redemet-status-proxy", {
      body: { icao: icao.toUpperCase() },
    });

    if (error) {
      console.error("Edge function error:", error);
      return { flag: null, error: error.message || "Failed to fetch aerodrome status" };
    }

    // Formato esperado: { data: [ [ 'SBVT', 'Nome', lat, lon, 'g', 'METAR...' ] ] }
    const row = (data as any)?.data?.[0];
    const flag = Array.isArray(row) ? (row[4] ?? null) : null;
    return { flag: flag ? String(flag) : null };
  } catch (e) {
    console.error("Fetch error:", e);
    return { flag: null, error: e instanceof Error ? e.message : "Unknown error occurred" };
  }
}