/**
 * WhatsApp link service — talks to /api/native/whatsapp on the PWA host.
 *
 * Linking flow mirrors PWA:
 *   1. request(phone) → sends 6-digit OTP via WhatsApp
 *   2. verify(otp)    → completes linking
 *   3. unlink()       → deactivates the link
 */

import { supabase } from '../lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

export type WhatsAppStatus =
  | { status: 'unlinked' }
  | { status: 'pending'; phone: string }
  | { status: 'linked'; phone: string };

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

async function call<T>(body: Record<string, unknown>): Promise<T | { error: string }> {
  const token = await getToken();
  if (!token) return { error: 'Nao autenticado' };
  try {
    const res = await fetch(`${WEB_URL}/api/native/whatsapp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: (data && (data.error as string)) || `HTTP ${res.status}` };
    }
    return data as T;
  } catch (err: unknown) {
    const msg = (err as { message?: string })?.message || 'Falha de rede';
    return { error: msg };
  }
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus | { error: string }> {
  return call<WhatsAppStatus>({ action: 'status' });
}

export async function requestWhatsAppLink(phone: string): Promise<{ success: true; phone: string } | { error: string }> {
  return call({ action: 'request', phone });
}

export async function verifyWhatsAppOTP(otp: string): Promise<{ success: true } | { error: string }> {
  return call({ action: 'verify', otp });
}

export async function unlinkWhatsApp(): Promise<{ success: true } | { error: string }> {
  return call({ action: 'unlink' });
}
