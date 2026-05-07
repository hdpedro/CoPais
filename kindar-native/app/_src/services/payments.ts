/**
 * Payments Service — queries de subscription server-side.
 *
 * Fluxo de COMPRA real agora mora em `./iap.ts` (RevenueCat wrapper).
 * Este arquivo cuida apenas da leitura do status atual no Supabase +
 * tipos/constantes compartilhados.
 *
 * Plataformas:
 *   - iOS: Apple IAP via RevenueCat → /api/iap/verify
 *   - Android: Google Billing via RevenueCat (quando habilitado no ASC)
 *   - Web: Stripe checkout via kindar.com.br/pricing (fluxo separado)
 */

import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { APPLE_PRODUCT_IDS } from './iap';

// ── Types ──

export type PaymentPlatform = 'apple' | 'google' | 'stripe';
export type PlanTier = 'free' | 'premium' | 'elite';

export interface UserSubscription {
  planId: string;
  tier: PlanTier;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  paymentProvider: string | null;
}

// Backward-compat: alguns callers importam PRODUCTS pra mostrar labels.
// Os IDs reais sao os de APPLE_PRODUCT_IDS (com.kindar.premium.monthly etc).
export const PRODUCTS = APPLE_PRODUCT_IDS;

// ── Get current subscription from DB ──

export async function getUserSubscription(userId: string): Promise<UserSubscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan_id, status, current_period_end, cancel_at_period_end, payment_provider')
    .eq('user_id', userId)
    .in('status', ['active', 'trialing'])
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return {
      planId: 'free',
      tier: 'free',
      status: 'active',
      currentPeriodEnd: '',
      cancelAtPeriodEnd: false,
      paymentProvider: null,
    };
  }

  return {
    planId: data.plan_id,
    tier: data.plan_id?.startsWith('elite')
      ? 'elite'
      : data.plan_id?.startsWith('premium')
        ? 'premium'
        : 'free',
    status: data.status,
    currentPeriodEnd: data.current_period_end || '',
    cancelAtPeriodEnd: data.cancel_at_period_end || false,
    paymentProvider: data.payment_provider || null,
  };
}

// ── Platform detection ──

export function getPaymentPlatform(): PaymentPlatform {
  if (Platform.OS === 'ios') return 'apple';
  if (Platform.OS === 'android') return 'google';
  return 'stripe';
}

export function isNativeIAP(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}
