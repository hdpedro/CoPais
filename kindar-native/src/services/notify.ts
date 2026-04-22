/**
 * Notify Service — Calls PWA backend to trigger side-effects.
 *
 * After every successful write, the nativo calls /api/native/notify
 * to replicate: push notifications, chat-notify, analytics.
 *
 * Fire-and-forget: never blocks the user. Failures are silent.
 */

import { supabase } from '../lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

type NotifyAction =
  | 'expense_created'
  | 'expense_approved'
  | 'expense_rejected'
  | 'event_created'
  | 'decision_created'
  | 'agreement_created'
  | 'health_event_created'
  | 'chat_message_sent'
  | 'child_created'
  | 'document_uploaded'
  | 'swap_request_created'
  | 'swap_approved'
  | 'swap_rejected'
  | 'decision_voted'
  | 'decision_argument_posted'
  | 'decision_closed'
  | 'invitation_sent'
  | 'invitation_cancelled'
  | 'invitation_accepted'
  | 'agreement_accepted'
  | 'agreement_revoked'
  | 'sensitive_note_created'
  | 'sensitive_note_deletion_requested'
  | 'sensitive_note_deleted'
  | 'sensitive_note_deletion_cancelled';

/**
 * Fire-and-forget notification to PWA backend.
 * Call this AFTER a successful safeWrite.
 */
export function notifyAction(
  action: NotifyAction,
  groupId: string,
  data: Record<string, unknown> = {}
): void {
  // Fire-and-forget — don't await, don't block
  _sendNotify(action, groupId, data).catch(() => {});
}

async function _sendNotify(
  action: NotifyAction,
  groupId: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    await fetch(`${WEB_URL}/api/native/notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, groupId, data }),
    });
  } catch {
    // Silent — notifications are non-critical
  }
}
