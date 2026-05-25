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

// In-memory cache for billing status — backend is authoritative but native
// hits this on every foreground transition, which scales linearly with users.
// 60s TTL matches Cache-Control on /api/billing/status. Callers can force a
// refresh after writes (e.g. after `/api/iap/verify`) via `invalidateBillingCache()`.
const BILLING_CACHE_TTL_MS = 60_000;
type BillingCacheEntry = { data: BillingStatus; at: number };
const billingCache = new Map<string, BillingCacheEntry>(); // key = groupId ?? '__primary__'

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
  /** Whether auto-split is enabled on the active subscription. */
  autoSplit?: boolean;
  /** UUID of the co-user receiving the split expense (when on). */
  autoSplitCoUserId?: string | null;
  /** Co-user's percentage share (1–99) of the bill. */
  autoSplitCoShare?: number | null;
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

export async function getBillingStatus(
  groupId?: string,
  options?: { skipCache?: boolean },
): Promise<BillingStatus> {
  const cacheKey = groupId ?? '__primary__';
  const cached = billingCache.get(cacheKey);
  const now = Date.now();
  if (!options?.skipCache && cached && now - cached.at < BILLING_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return FREE_BILLING;

    const url = `${WEB_URL}/api/billing/status${groupId ? `?groupId=${encodeURIComponent(groupId)}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return FREE_BILLING;
    const data = (await res.json()) as BillingStatus;
    billingCache.set(cacheKey, { data, at: now });
    return data;
  } catch (err) {
    console.warn('[billing] getBillingStatus failed:', err);
    return FREE_BILLING;
  }
}

/**
 * Forces the next `getBillingStatus()` to bypass the in-memory cache and hit
 * the server. Call this immediately after any flow that mutates billing
 * state — `purchasePackage`, `restore`, `enableSubscriptionSplit`, etc.
 * Cheaper than `skipCache: true` on every call from those flows because
 * callers may be in deep components that don't know about the cache.
 */
export function invalidateBillingCache(groupId?: string): void {
  if (groupId) {
    billingCache.delete(groupId);
  } else {
    billingCache.clear();
  }
}

/**
 * Enable auto-split on the active subscription. Mirror of PWA action
 * `enableSubscriptionSplit` (src/actions/subscription-split.ts:26),
 * routed through the Bearer-auth `POST /api/subscription/split` so the
 * server enforces "only the payer" + "co-user is parent role" gates.
 *
 * Side effects on success: first split expense created, push + chat ping
 * sent to coUser, posthog event captured.
 */
export async function enableSubscriptionSplit(params: {
  groupId: string;
  coUserId: string;
  coSharePercent?: number;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return { success: false, error: 'Sessão expirada' };

    const res = await fetch(`${WEB_URL}/api/subscription/split`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        groupId: params.groupId,
        coUserId: params.coUserId,
        coSharePercent: params.coSharePercent ?? 50,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error || `Erro ${res.status}` };
    }
    // Mutou auto_split no servidor — invalida cache local pra que o próximo
    // getBillingStatus() reflita o novo estado imediatamente. Sem isso a UI
    // mostra autoSplit stale por até BILLING_CACHE_TTL_MS (60s).
    invalidateBillingCache(params.groupId);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Falha de rede' };
  }
}

/**
 * Disable auto-split. Mirror of PWA `disableSubscriptionSplit`.
 */
export async function disableSubscriptionSplit(
  groupId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) return { success: false, error: 'Sessão expirada' };

    const res = await fetch(`${WEB_URL}/api/subscription/split`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ groupId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { success: false, error: body.error || `Erro ${res.status}` };
    }
    // Mutou auto_split — invalida cache (mesmo motivo do enable).
    invalidateBillingCache(groupId);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message || 'Falha de rede' };
  }
}
