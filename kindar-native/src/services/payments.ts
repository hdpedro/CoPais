/**
 * Payments Service — Apple IAP only (iOS).
 *
 * Backend has ONLY /api/iap/verify which accepts:
 *   { productId, originalTransactionId, isRestore }
 * and uses payment_provider='apple' in subscriptions table.
 *
 * Android: NOT supported yet (no Google Billing backend).
 * Web: Stripe via kindar.com.br/pricing (separate flow).
 */

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// ── Types ──

export type PaymentPlatform = 'apple' | 'stripe';
export type PlanTier = 'free' | 'premium' | 'elite';

export interface UserSubscription {
  planId: string;
  tier: PlanTier;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  paymentProvider: string | null;
}

export const PRODUCTS = {
  premium_monthly: 'kindar_premium_monthly',
  premium_yearly: 'kindar_premium_yearly',
} as const;

// ── Get current subscription ──

export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_id, status, current_period_end, cancel_at_period_end, payment_provider')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .single();

  if (error || !data) {
    return { planId: 'free', tier: 'free', status: 'active', currentPeriodEnd: '', cancelAtPeriodEnd: false, paymentProvider: null };
  }

  return {
    planId: data.plan_id,
    tier: data.plan_id?.startsWith('elite') ? 'elite' : data.plan_id?.startsWith('premium') ? 'premium' : 'free',
    status: data.status,
    currentPeriodEnd: data.current_period_end || '',
    cancelAtPeriodEnd: data.cancel_at_period_end || false,
    paymentProvider: data.payment_provider || null,
  };
}

// ── Platform detection ──

export function getPaymentPlatform(): PaymentPlatform {
  if (Platform.OS === 'ios') return 'apple';
  return 'stripe';
}

export function isNativeIAP(): boolean {
  return Platform.OS === 'ios';
}

// ── Verify purchase with backend ──

/**
 * Call /api/iap/verify with the purchase data from StoreKit.
 * This is the ONLY endpoint the backend supports.
 */
async function verifyWithBackend(params: {
  productId: string;
  originalTransactionId?: string;
  isRestore?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, error: 'Nao autenticado' };
    }

    const res = await fetch(`${process.env.EXPO_PUBLIC_WEB_URL}/api/iap/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        productId: params.productId,
        originalTransactionId: params.originalTransactionId || null,
        isRestore: params.isRestore || false,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Erro na verificacao' }));
      return { success: false, error: data.error || `HTTP ${res.status}` };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || 'Erro de conexao' };
  }
}

// ── Purchase (iOS only) ──

export async function purchaseProduct(productId: string): Promise<{ success: boolean; error?: string }> {
  if (!isNativeIAP()) {
    return { success: false, error: 'Compras mobile disponiveis apenas no iOS. Use kindar.com.br/pricing para assinar via web.' };
  }

  // StoreKit purchase happens on-device via Capacitor/native bridge.
  // The native side sends us productId + originalTransactionId after success.
  // We then verify with our backend.
  // For now, this is called after the native purchase completes.
  return verifyWithBackend({ productId });
}

// ── Restore (iOS only) ──

export async function restorePurchases(productId: string, originalTransactionId: string): Promise<{ success: boolean; error?: string }> {
  if (!isNativeIAP()) {
    return { success: false, error: 'Restore disponivel apenas no iOS' };
  }

  return verifyWithBackend({
    productId,
    originalTransactionId,
    isRestore: true,
  });
}
