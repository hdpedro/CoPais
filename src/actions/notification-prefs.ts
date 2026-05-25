"use server";

/**
 * Server actions pra atualizar preferências de notificação.
 *
 * Caller principal: PWA /perfil/notificacoes Client Component via form actions.
 * Native usa o endpoint REST `/api/notifications/prefs` (com Bearer auth).
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  updateNotificationPrefs,
  getNotificationPrefs,
  type NotificationCategory,
  type NotificationPrefs,
} from "@/lib/services/notification-prefs";

/**
 * Atualiza um campo específico das prefs. Recebe FormData com:
 *   - field: "quiet_hours_enabled" | "quiet_hours_start" | "quiet_hours_end"
 *            | "mute_until" | "category:<name>"
 *   - value: string (boolean stringified, HH:MM, ISO ts, etc.)
 */
export async function updatePref(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const field = (formData.get("field") as string) || "";
  const valueRaw = (formData.get("value") as string) || "";

  const patch: Partial<NotificationPrefs> = {};

  if (field === "quiet_hours_enabled") {
    patch.quiet_hours = { enabled: valueRaw === "true", start: "22:00", end: "07:00" };
    // Merge no service — current values são preservados pra start/end
    const current = await getNotificationPrefs(user.id);
    patch.quiet_hours = {
      enabled: valueRaw === "true",
      start: current.quiet_hours.start,
      end: current.quiet_hours.end,
    };
  } else if (field === "quiet_hours_start" || field === "quiet_hours_end") {
    const current = await getNotificationPrefs(user.id);
    const which = field === "quiet_hours_start" ? "start" : "end";
    patch.quiet_hours = {
      enabled: current.quiet_hours.enabled,
      start: which === "start" ? valueRaw : current.quiet_hours.start,
      end: which === "end" ? valueRaw : current.quiet_hours.end,
    };
  } else if (field === "mute_until") {
    // valueRaw pode ser ISO timestamp ou "" (clear mute)
    patch.mute_until = valueRaw ? valueRaw : null;
  } else if (field === "mute_quick") {
    // valueRaw = "1h" | "4h" | "tomorrow" | "clear"
    const now = new Date();
    if (valueRaw === "clear") {
      patch.mute_until = null;
    } else if (valueRaw === "1h") {
      patch.mute_until = new Date(now.getTime() + 60 * 60_000).toISOString();
    } else if (valueRaw === "4h") {
      patch.mute_until = new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
    } else if (valueRaw === "tomorrow") {
      // 8h da manhã do dia seguinte (BRT)
      const tomorrowBrt = new Date(now.getTime() + 24 * 60 * 60_000);
      tomorrowBrt.setUTCHours(11, 0, 0, 0); // 08:00 BRT = 11:00 UTC
      patch.mute_until = tomorrowBrt.toISOString();
    }
  } else if (field.startsWith("category:")) {
    const category = field.slice("category:".length) as NotificationCategory;
    patch.categories = { [category]: valueRaw === "true" };
  }

  await updateNotificationPrefs({ userId: user.id, patch });
  revalidatePath("/perfil/notificacoes");
}

/**
 * Server action pra mute global imediato (1h/4h/até amanhã/clear).
 * Form action standalone — usa no botão da tela /perfil/notificacoes
 * E também no dashboard como atalho ("Silenciar 1h").
 */
export async function quickMute(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const duration = (formData.get("duration") as string) || "clear";
  const now = new Date();
  let mute_until: string | null = null;
  if (duration === "1h") mute_until = new Date(now.getTime() + 60 * 60_000).toISOString();
  else if (duration === "4h") mute_until = new Date(now.getTime() + 4 * 60 * 60_000).toISOString();
  else if (duration === "tomorrow") {
    const t = new Date(now.getTime() + 24 * 60 * 60_000);
    t.setUTCHours(11, 0, 0, 0);
    mute_until = t.toISOString();
  }

  await updateNotificationPrefs({ userId: user.id, patch: { mute_until } });
  revalidatePath("/perfil/notificacoes");
}
