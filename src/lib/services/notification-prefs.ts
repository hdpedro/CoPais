/**
 * notification-prefs.ts — Server-only helper pra respeitar preferências
 * de notificação do user. Plugado em `sendPushToUser` early-return.
 *
 * Migration 00093 introduz `profiles.notification_prefs` JSONB. Esse
 * módulo é o consumidor único — qualquer outro caller que queira validar
 * "este push pode ir?" passa pelo `shouldSendPush(userId, category)`.
 *
 * Decisões de design:
 *  1. **Default permissivo**: novo user sem prefs setadas recebe tudo.
 *     Migração silenciosa pra users existentes — ninguém perde push da
 *     noite pro dia.
 *  2. **Categories MAP**: chave do tipo de notif → boolean. Categoria
 *     ausente = true (permissivo). User que mutou X = false explicit.
 *  3. **Quiet hours**: HH:MM strings + flag enabled. TZ hardcoded BRT
 *     pra v1 (BR sem DST). Pós-MVP: profiles.timezone.
 *  4. **Mute until**: ISO timestamp. Cron skip + push direct skip.
 *     Auto-expira sem cleanup necessário (helper checa now > until).
 *  5. **Override por urgent**: priority='urgent' (Foundation Collab)
 *     atravessa quiet_hours + mute. Save the day pra criança com febre.
 *
 * Não é fonte de verdade pra UI — UI mostra direto do row do user.
 * Esse module só decide "send push agora?" no momento do envio.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Categorias suportadas. Sincronizado com `recordType`s do Foundation Collab
 *  e tipos custom (chat, retention, birthday). NÃO renomear — chaves persistem
 *  no JSONB de cada user. */
export type NotificationCategory =
  | "activity_reminders"   // T-(lead) lembretes pré-evento
  | "activity_digest"      // D-1 noite (resumo amanhã)
  | "vaccine_alerts"       // saúde preventiva (cron 09 BRT)
  | "chat"                 // mensagens em conversa
  | "school_collab"        // Foundation Collab: school_logs
  | "expense_collab"       // Foundation Collab: expenses
  | "health_collab"        // Foundation Collab: 5 tipos saúde
  | "decisions"            // votos / argumentos / fechamento
  | "swap"                 // trocas de guarda
  | "retention"            // re-engajamento (cron 14 BRT — marketing-ish)
  | "birthday"             // aniversários
  | "balance_operations"   // ajustes de saldo (custódia)
  | "settlements";         // acertos financeiros

/** Default: todos ativos. Categoria ausente no JSONB = true. */
const DEFAULT_CATEGORY_ENABLED = true;

export interface NotificationPrefs {
  quiet_hours: {
    enabled: boolean;
    start: string; // "HH:MM"
    end: string;
  };
  mute_until: string | null; // ISO timestamp
  categories: Partial<Record<NotificationCategory, boolean>>;
}

/** Brazil offset — sem DST desde 2019. Hardcode pra v1. */
const BRAZIL_OFFSET_MIN = -180;

/**
 * Resolve prefs do user. Sem prefs = retorna defaults permissivos.
 * Falha de query → também retorna defaults (não bloquear push em outage DB).
 */
export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();

    const raw = (data?.notification_prefs ?? {}) as Partial<NotificationPrefs>;
    return {
      quiet_hours: {
        enabled: raw.quiet_hours?.enabled ?? false,
        start: raw.quiet_hours?.start ?? "22:00",
        end: raw.quiet_hours?.end ?? "07:00",
      },
      mute_until: raw.mute_until ?? null,
      categories: raw.categories ?? {},
    };
  } catch {
    return {
      quiet_hours: { enabled: false, start: "22:00", end: "07:00" },
      mute_until: null,
      categories: {},
    };
  }
}

/**
 * Decisão central: este push deve ir AGORA?
 *
 * Ordem de checks (todos curto-circuitam):
 *  1. Override de urgência: bypass se isUrgent=true (criança com febre não
 *     espera quiet hours; Foundation Collab promove gravidade='grave' pra urgent)
 *  2. Mute until: se now < mute_until, skip
 *  3. Categoria mutada: skip (default true se ausente)
 *  4. Quiet hours: se enabled E now ∈ [start, end] em BRT, skip
 *  5. Tudo OK → send
 *
 * Retorna { send: true } ou { send: false, reason } pra logging.
 */
export async function shouldSendPush(
  userId: string,
  category: NotificationCategory,
  opts: { isUrgent?: boolean; now?: Date } = {},
): Promise<{ send: boolean; reason?: string }> {
  // Urgent bypass — exception única, atrás de tudo
  if (opts.isUrgent) return { send: true };

  const prefs = await getNotificationPrefs(userId);
  const now = opts.now ?? new Date();

  // 1. Mute global temporário
  if (prefs.mute_until) {
    const until = new Date(prefs.mute_until);
    if (now < until) {
      return { send: false, reason: "muted_until" };
    }
  }

  // 2. Categoria mutada
  const categoryEnabled = prefs.categories[category] ?? DEFAULT_CATEGORY_ENABLED;
  if (!categoryEnabled) {
    return { send: false, reason: `category_disabled:${category}` };
  }

  // 3. Quiet hours
  if (prefs.quiet_hours.enabled) {
    if (isWithinQuietHours(now, prefs.quiet_hours.start, prefs.quiet_hours.end)) {
      return { send: false, reason: "quiet_hours" };
    }
  }

  return { send: true };
}

/**
 * Check se `now` (UTC) cai em [start, end] em BRT. Lida com janelas que
 * atravessam meia-noite (ex: 22:00 → 07:00).
 */
function isWithinQuietHours(now: Date, startHHMM: string, endHHMM: string): boolean {
  // Convert UTC → BRT
  const brtMs = now.getTime() + BRAZIL_OFFSET_MIN * 60_000;
  const brt = new Date(brtMs);
  const nowMin = brt.getUTCHours() * 60 + brt.getUTCMinutes();

  const [sh, sm] = startHHMM.split(":").map(Number);
  const [eh, em] = endHHMM.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin === endMin) return false; // zero-length window
  if (startMin < endMin) {
    // Same-day window: e.g. 13:00-17:00
    return nowMin >= startMin && nowMin < endMin;
  }
  // Overnight: e.g. 22:00-07:00
  return nowMin >= startMin || nowMin < endMin;
}

/**
 * Helper pra crons: filtra lista de userIds pra só os que devem receber
 * a notif agora. Útil quando o cron já pega N candidatos e antes do
 * fanout de push quer skipar muted. Evita 1 query por user no path serial.
 */
export async function filterRecipientsByPrefs(
  userIds: string[],
  category: NotificationCategory,
  opts: { isUrgent?: boolean; now?: Date } = {},
): Promise<{ allowed: string[]; skipped: Array<{ userId: string; reason: string }> }> {
  if (opts.isUrgent) {
    return { allowed: userIds, skipped: [] };
  }

  const allowed: string[] = [];
  const skipped: Array<{ userId: string; reason: string }> = [];

  // Query bulk
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, notification_prefs")
      .in("id", userIds);

    const prefsMap = new Map<string, NotificationPrefs>();
    for (const row of data ?? []) {
      const raw = (row.notification_prefs ?? {}) as Partial<NotificationPrefs>;
      prefsMap.set(row.id as string, {
        quiet_hours: {
          enabled: raw.quiet_hours?.enabled ?? false,
          start: raw.quiet_hours?.start ?? "22:00",
          end: raw.quiet_hours?.end ?? "07:00",
        },
        mute_until: raw.mute_until ?? null,
        categories: raw.categories ?? {},
      });
    }

    const now = opts.now ?? new Date();
    for (const userId of userIds) {
      const prefs = prefsMap.get(userId);
      if (!prefs) {
        allowed.push(userId);
        continue;
      }
      // Mute
      if (prefs.mute_until && now < new Date(prefs.mute_until)) {
        skipped.push({ userId, reason: "muted_until" });
        continue;
      }
      // Categoria
      const enabled = prefs.categories[category] ?? DEFAULT_CATEGORY_ENABLED;
      if (!enabled) {
        skipped.push({ userId, reason: `category_disabled:${category}` });
        continue;
      }
      // Quiet hours
      if (prefs.quiet_hours.enabled && isWithinQuietHours(now, prefs.quiet_hours.start, prefs.quiet_hours.end)) {
        skipped.push({ userId, reason: "quiet_hours" });
        continue;
      }
      allowed.push(userId);
    }
  } catch {
    // Em outage da query, permite tudo (fail open).
    return { allowed: userIds, skipped: [] };
  }

  return { allowed, skipped };
}

/**
 * Update prefs (server action). Chamado pelo PWA /perfil/notificacoes
 * e Native /perfil/notificacoes via API.
 */
export interface UpdatePrefsInput {
  userId: string;
  patch: Partial<NotificationPrefs>;
}

export async function updateNotificationPrefs(input: UpdatePrefsInput): Promise<void> {
  const admin = createAdminClient();
  // Merge com prefs atuais — não obriga client mandar tudo
  const current = await getNotificationPrefs(input.userId);
  const next: NotificationPrefs = {
    quiet_hours: { ...current.quiet_hours, ...(input.patch.quiet_hours ?? {}) },
    mute_until: input.patch.mute_until !== undefined ? input.patch.mute_until : current.mute_until,
    categories: { ...current.categories, ...(input.patch.categories ?? {}) },
  };

  await admin
    .from("profiles")
    .update({ notification_prefs: next })
    .eq("id", input.userId);
}
