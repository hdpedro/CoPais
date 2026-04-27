/**
 * Billing Status Client — reads the single source of truth from the PWA.
 *
 * All tier / trial / Early Bird decisions live server-side in
 * /api/billing/status. The native app never infers premium state from
 * RevenueCat's cache alone — it fetches this endpoint so both platforms
 * agree on what the family has access to.
 *
 * Cache: in-memory only, cleared on app foreground (handled by caller).
 */

import { supabase } from '../lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

export interface BillingStatus {
  groupId: string | null;
  tier: 'free' | 'harmonia' | 'premium_juridico';
  planId: string;
  status: string;
  isActive: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentProvider: string;
  payerUserId: string | null;
  canPay: boolean;
  payerReason?: string;
  earlyBird: Array<{
    planId: string;
    maxSubscribers: number;
    currentCount: number;
    slotsRemaining: number;
    isSoldOut: boolean;
  }>;
}

export const FREE_BILLING: BillingStatus = {
  groupId: null,
  tier: 'free',
  planId: 'free',
  status: 'none',
  isActive: false,
  isTrial: false,
  trialDaysRemaining: 0,
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  paymentProvider: 'none',
  payerUserId: null,
  canPay: false,
  earlyBird: [],
};

export async function getBillingStatus(groupId?: string): Promise<BillingStatus> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return FREE_BILLING;

    const url = `${WEB_URL}/api/billing/status${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return FREE_BILLING;
    return (await res.json()) as BillingStatus;
  } catch (err) {
    console.warn('[billing] getBillingStatus failed:', err);
    return FREE_BILLING;
  }
}
