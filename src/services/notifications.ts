/**
 * Notifications Service — All writes use safeWrite.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';

export interface AppNotification {
  id: string; type: string; title: string; message: string;
  link: string | null; is_read: boolean; created_at: string;
}

export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data } = await supabase.from('notifications')
    .select('id, type, title, message, link, is_read, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(50);
  return data || [];
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
