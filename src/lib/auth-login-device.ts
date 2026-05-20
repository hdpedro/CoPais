import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeFingerprint,
  locationLabel,
} from "@/lib/auth-fingerprint";
import { sendLoginAlertEmail } from "@/lib/emails/login-alert";
import { captureServerEvent } from "@/lib/posthog-server";

/**
 * Registra a tentativa de login num par (user_id, device_hash).
 *
 * Fluxo:
 *   - Se existe row pra esse device → atualiza last_seen, ip, ua, geo.
 *     **NÃO** dispara alerta.
 *   - Se NÃO existe → insere row + decide se dispara alerta:
 *       - Se for o PRIMEIRO device do user (count == 1 após insert), pula o
 *         alerta. É o signup; o user obviamente sabe que entrou. Mandar
 *         email "novo dispositivo" pra esse caso polui inbox e mata a
 *         credibilidade do alerta real depois.
 *       - Senão, dispara `sendLoginAlertEmail` e seta `alert_sent_at`.
 *
 * Roda em background (fire-and-forget pelo caller). Falhas NUNCA bloqueiam
 * o login.
 *
 * Pra observabilidade: captura `login_device_known` ou `login_device_new`
 * no PostHog em todo path.
 */
export async function recordLoginDevice(args: {
  userId: string;
  email: string;
  firstName?: string | null;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  city: string | null;
}): Promise<{ isNewDevice: boolean; alertSent: boolean }> {
  try {
    const supabase = createAdminClient();
    const fp = computeFingerprint(args.userAgent, args.ip);

    // Existing?
    const { data: existing, error: selErr } = await supabase
      .from("auth_login_devices")
      .select("id, alert_sent_at")
      .eq("user_id", args.userId)
      .eq("device_hash", fp.hash)
      .maybeSingle();

    if (selErr) {
      console.error("[recordLoginDevice] select failed:", selErr.message);
      return { isNewDevice: false, alertSent: false };
    }

    if (existing) {
      await supabase
        .from("auth_login_devices")
        .update({
          last_seen: new Date().toISOString(),
          user_agent: args.userAgent,
          ip_address: args.ip,
          country: args.country,
          city: args.city,
        })
        .eq("id", existing.id);
      captureServerEvent(args.userId, "login_device_known", {
        device_label: fp.deviceLabel,
        country: args.country,
      });
      return { isNewDevice: false, alertSent: false };
    }

    // INSERT new device
    const { data: inserted, error: insErr } = await supabase
      .from("auth_login_devices")
      .insert({
        user_id: args.userId,
        device_hash: fp.hash,
        user_agent: args.userAgent,
        ip_address: args.ip,
        country: args.country,
        city: args.city,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      console.error("[recordLoginDevice] insert failed:", insErr?.message);
      return { isNewDevice: false, alertSent: false };
    }

    // Se é o primeiro device do user → NÃO alertar (é signup, ele acabou de criar conta)
    const { count } = await supabase
      .from("auth_login_devices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", args.userId);

    if (!count || count <= 1) {
      captureServerEvent(args.userId, "login_device_new", {
        device_label: fp.deviceLabel,
        country: args.country,
        is_first_device: true,
        alert_skipped: true,
      });
      return { isNewDevice: true, alertSent: false };
    }

    // Alert
    const result = await sendLoginAlertEmail({
      email: args.email,
      firstName: args.firstName,
      userId: args.userId,
      deviceLabel: fp.deviceLabel,
      locationLabel: locationLabel(args.country, args.city),
      whenIso: new Date().toISOString(),
    });

    if (result.ok) {
      await supabase
        .from("auth_login_devices")
        .update({ alert_sent_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }

    captureServerEvent(args.userId, "login_device_new", {
      device_label: fp.deviceLabel,
      country: args.country,
      is_first_device: false,
      alert_sent: result.ok,
    });

    return { isNewDevice: true, alertSent: result.ok };
  } catch (err) {
    console.error("[recordLoginDevice] unexpected:", err);
    return { isNewDevice: false, alertSent: false };
  }
}
