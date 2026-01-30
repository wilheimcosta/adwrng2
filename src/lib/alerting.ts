import { fetchRedemetAlerts, determineAlertSeverity, type RedemetAlert } from "@/lib/redemet";
import { supabase } from "@/integrations/supabase/client";

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

  // Padrões comuns na REDEMET (ex.: "AD WRNG")
  if (msg.includes("ad wrng") || msg.includes("aerodrome warning")) return true;

  // Heurística defensiva
  if (tipo.includes("aerodromo") || msg.includes("aerodromo")) return true;
  if (tipo.includes("aviso") && (msg.includes("ad") || msg.includes("aerodromo"))) return true;

  return false;
}

export type RegisterResult =
  | { ok: true; inserted: number; alreadyActive: number; sampleMessage?: string }
  | { ok: false; error: string };

/**
 * Busca avisos na REDEMET e registra apenas os NOVOS (evita alarmes duplicados)
 * comparando por (icao + alert_type + content) com status=active.
 */
export async function registerAerodromeWarningsForIcao(icao: string): Promise<RegisterResult> {
  const res = await fetchRedemetAlerts(icao);
  if (res.error) return { ok: false, error: res.error };

  const payload: any = res.data;
  // A REDEMET normalmente retorna: { status, message, data: { ..., data: [...] } }
  // Mas mantemos compatibilidade com formatos alternativos.
  const alerts: any[] =
    (Array.isArray(payload?.data) ? payload.data : null) ??
    (Array.isArray(payload?.data?.data) ? payload.data.data : null) ??
    (Array.isArray(payload?.data?.data?.data) ? payload.data.data.data : null) ??
    [];

  const aerodromeWarnings = alerts.filter(isAerodromeWarning);
  const firstMessage = aerodromeWarnings[0]?.mensagem ?? aerodromeWarnings[0]?.mens;

  let inserted = 0;
  let alreadyActive = 0;

  const toIsoZ = (v: unknown): string | null => {
    if (!v) return null;
    const s = String(v);
    // "YYYY-MM-DD HH:mm:ss" -> "YYYY-MM-DDTHH:mm:ssZ" (assumindo UTC)
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s.replace(" ", "T") + "Z";
    return s;
  };

  for (const a of aerodromeWarnings) {
    const rawMsg = (a as any).mensagem ?? (a as any).mens ?? "";
    const rawTipo = (a as any).tipo ?? "AD WRNG";
    const alertType = String(rawTipo || "AVISO");
    const content = String(rawMsg || "(sem mensagem)");

    const validFrom = toIsoZ((a as any).data_validade_ini ?? (a as any).validade_inicial);
    const validUntil = toIsoZ((a as any).data_validade_fim ?? (a as any).validade_final);

    const { data: existing, error: existingErr } = await supabase
      .from("alerts_history")
      .select("id")
      .eq("icao", icao.toUpperCase())
      .eq("status", "active")
      .eq("alert_type", alertType)
      .eq("content", content)
      .limit(1);

    if (existingErr) {
      console.error("[alerting] existing check error", existingErr);
      return { ok: false, error: existingErr.message };
    }

    if (existing && existing.length > 0) {
      alreadyActive++;
      continue;
    }

    const severity = determineAlertSeverity({ ...(a as any), mensagem: content, tipo: alertType } as any);

    const { error: insertErr } = await supabase.from("alerts_history").insert({
      icao: icao.toUpperCase(),
      alert_type: alertType,
      content,
      status: "active",
      severity,
      valid_from: validFrom,
      valid_until: validUntil,
      raw_data: a as any,
    });

    if (insertErr) {
      console.error("[alerting] insert error", insertErr);
      return { ok: false, error: insertErr.message };
    }
    inserted++;
  }

  return { ok: true, inserted, alreadyActive, sampleMessage: firstMessage ? String(firstMessage) : undefined };
}
