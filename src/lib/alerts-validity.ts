import { supabase } from "@/integrations/supabase/client";

export type ValidityLike = {
  valid_from?: string | null;
  valid_until?: string | null;
};

export function isAlertInForce(alert: ValidityLike, now = new Date()): boolean {
  const from = alert.valid_from ? new Date(alert.valid_from) : null;
  const until = alert.valid_until ? new Date(alert.valid_until) : null;

  if (from && Number.isFinite(from.getTime()) && now < from) return false;
  if (until && Number.isFinite(until.getTime()) && now > until) return false;
  return true;
}

/**
 * Marca como "expired" os avisos que ainda estão como "active",
 * mas estão fora da janela de validade (valid_from/valid_until).
 */
export async function expireOutOfWindowActiveAlerts(params?: { icaos?: string[]; now?: Date }) {
  const now = params?.now ?? new Date();
  const nowIso = now.toISOString();

  // Expira quando valid_until < agora
  let q1 = supabase
    .from("alerts_history")
    .update({ status: "expired" })
    .eq("status", "active")
    .not("valid_until", "is", null)
    .lt("valid_until", nowIso);

  if (params?.icaos?.length) q1 = q1.in("icao", params.icaos.map((i) => i.toUpperCase()));

  const r1 = await q1;
  if (r1.error) throw r1.error;

  // Expira quando valid_from > agora (ainda não começou)
  let q2 = supabase
    .from("alerts_history")
    .update({ status: "expired" })
    .eq("status", "active")
    .not("valid_from", "is", null)
    .gt("valid_from", nowIso);

  if (params?.icaos?.length) q2 = q2.in("icao", params.icaos.map((i) => i.toUpperCase()));

  const r2 = await q2;
  if (r2.error) throw r2.error;
}
