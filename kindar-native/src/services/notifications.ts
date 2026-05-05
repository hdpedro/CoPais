/**
 * Notifications Service — writes go through PWA admin routes
 * (`/api/notifications/mark-read`, `/api/notifications/mark-all-read`) so
 * ownership is enforced server-side and a single code path mutates the table.
 *
 * Mirrors PWA filtering: push_sub + system + raw JSON payloads are internal
 * logs and never shown to user.
 */

import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';

export interface AppNotification {
  id: string; type: string; title: string; message: string;
  link: string | null; is_read: boolean; created_at: string;
}

/** Replace email addresses in notification text with first-name (ex:
 *  "henrique.pedros@hotmail.com aprovou" -> "Henrique aprovou"). Matches
 *  PWA sanitizeEmailInText. */
export function sanitizeEmailInText(text: string | null | undefined): string {
  if (!text) return '';
  return text.replace(
    /([a-zA-Z0-9._%+-]+)@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    (_, localPart: string) => {
      const name = localPart.split(/[._-]/)[0];
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }
  );
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  // Match PWA page.tsx filter — exclude push_sub records and system type
  // at the DB level, then double-check for any raw JSON subscription payloads
  // that might have leaked through.
  const { data } = await supabase.from('notifications')
    .select('id, type, title, message, link, is_read, created_at')
    .eq('user_id', userId)
    .neq('title', 'push_sub')
    .neq('type', 'system')
    .order('created_at', { ascending: false })
    .limit(50);

  const filtered = (data || []).filter(n => {
    if (n.title === 'push_sub') return false;
    if (n.type === 'system') return false;
    // Raw push subscription payloads that slipped through
    if (n.message && n.message.includes('"endpoint"') && (
      n.message.includes('fcm.googleapis.com') || n.message.includes('web.push.apple.com')
    )) return false;
    return true;
  });

  // Sanitize email addresses in titles/messages before returning
  return filtered.map(n => ({
    ...n,
    title: sanitizeEmailInText(n.title),
    message: sanitizeEmailInText(n.message),
  }));
}

export async function markAsRead(notificationId: string) {
  // Single-id flip via PWA route (admin client + ownership gate).
  const r = await apiFetch<{ success: true }>(`/api/notifications/mark-read`, {
    method: 'PATCH',
    body: { id: notificationId },
  });
  return { success: r.ok, error: r.ok ? undefined : r.error };
}

/* eslint-disable @typescript-eslint/no-unused-vars */
export async function markAllAsRead(_userId: string) {
  // Bulk flip via PWA route (server resolves user from Bearer token).
  const r = await apiFetch<{ success: true; updated: number }>(`/api/notifications/mark-all-read`, {
    method: 'POST',
  });
  return { success: r.ok, error: r.ok ? undefined : r.error };
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/**
 * Subscribe to notification changes for a user via Supabase Realtime.
 * Mirrors PWA src/components/NotificationBadge.tsx — INSERT + UPDATE.
 *
 * Returns an unsubscribe function. Always returns a cleanup, even if userId
 * is missing, so callers can unconditionally invoke it in useEffect cleanup.
 *
 * The channel name embeds a per-call instance suffix so multiple callers
 * (e.g. Dashboard + NotificacoesScreen mounted simultaneously, or fast
 * remounts before `removeChannel` settles) never share a channel — the
 * supabase-js client throws `cannot add postgres_changes callbacks ... after
 * subscribe()` when two subscribers race on the same channel name.
 */
export function subscribeToNotifications(
  userId: string | null | undefined,
  onChange: () => void
): () => void {
  if (!userId) return () => {};

  const instanceId = Math.random().toString(36).slice(2, 10);
  const channel = supabase
    .channel(`notifications:${userId}:${instanceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      onChange,
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      // non-fatal
    }
  };
}
