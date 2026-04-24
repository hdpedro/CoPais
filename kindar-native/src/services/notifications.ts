/**
 * Notifications Service — All writes use safeWrite.
 *
 * Mirrors PWA filtering: push_sub + system + raw JSON payloads are internal
 * logs and never shown to user.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';

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
  return safeWrite({ table: 'notifications', operation: 'update', payload: { id: notificationId, is_read: true } });
}

export async function markAllAsRead(userId: string) {
  // markAllAsRead needs a different pattern — can't use safeWrite with filter
  // This one stays as direct call since it's a bulk update with compound filter
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  return { success: !error, error: error?.message };
}
