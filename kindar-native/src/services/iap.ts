/**
 * IAP Service — RevenueCat wrapper.
 *
 * RevenueCat abstrai StoreKit (iOS) + Google Billing (Android) + retry +
 * offline + receipt validation. O backend /api/iap/verify continua sendo
 * chamado pro nosso lado ter a subscription na tabela `subscriptions`
 * (alem do status atualizado no RevenueCat webhook pra redundancia).
 *
 * SKUs (definidos no ASC e no RevenueCat dashboard):
 *   com.kindar.premium.monthly  → plan_id=premium_monthly
 *   com.kindar.premium.annual   → plan_id=premium_annual
 *   com.kindar.elite.monthly    → plan_id=elite_monthly
 *   com.kindar.elite.annual     → plan_id=elite_annual
 *
 * Setup obrigatorio antes da primeira compra real:
 *   1. Criar produtos no ASC em status "Ready to Submit"
 *   2. Criar app no RevenueCat + configurar Apple App-Specific Shared Secret
 *   3. Cadastrar os 4 produtos como "Entitlements" em RevenueCat (entitlement
 *      id = 'premium' ou 'elite')
 *   4. Set EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY no eas.json / .env
 *   5. Enable In-App Purchase capability no Apple Developer Portal
 */

import { Platform } from 'react-native';
import Purchases, {
  PurchasesError,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';

const APPLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY || '';
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY || '';

// Apple product IDs — match migration 00051_apple_product_ids.sql + ASC products
export const APPLE_PRODUCT_IDS = {
  premium_monthly: 'com.kindar.premium.monthly',
  premium_annual: 'com.kindar.premium.annual',
  elite_monthly: 'com.kindar.elite.monthly',
  elite_annual: 'com.kindar.elite.annual',
} as const;

let initialized = false;

/**
 * Inicializa RevenueCat. Chamar 1x no bootstrap (_layout.tsx).
 * Se o userId nao estiver disponivel ainda, pode chamar sem — o
 * `identifyUser()` posterior faz login.
 */
export async function initializeIAP(userId?: string): Promise<void> {
  if (initialized) return;

  const apiKey = Platform.OS === 'ios' ? APPLE_API_KEY : GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('[iap] RevenueCat API key not set — IAP disabled');
    return;
  }

  if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  Purchases.configure({
    apiKey,
    appUserID: userId || null,
  });

  initialized = true;
}

/**
 * Chama apos login. Liga o usuario RevenueCat ao userId Supabase.
 */
export async function identifyUser(userId: string): Promise<void> {
  if (!initialized) return;
  try {
    await Purchases.logIn(userId);
  } catch (err) {
    console.warn('[iap] logIn failed:', err);
  }
}

/**
 * Chama no signOut. Reseta RevenueCat pro modo anonimo.
 */
export async function resetUser(): Promise<void> {
  if (!initialized) return;
  try {
    await Purchases.logOut();
  } catch {
    /* ignore */
  }
}

/**
 * Lista os packages ofertados (lidos do Offering "default" no RevenueCat).
 * Usa `listAllPackages` pra compatibilidade com Offerings simples.
 */
export async function getAvailablePackages(): Promise<PurchasesPackage[]> {
  if (!initialized) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return [];
    return current.availablePackages;
  } catch (err) {
    console.warn('[iap] getOfferings failed:', err);
    return [];
  }
}

/**
 * Tenta comprar um package. RevenueCat apresenta o sheet StoreKit,
 * processa o pagamento e, em caso de sucesso, retorna o CustomerInfo
 * atualizado. Em seguida chamamos /api/iap/verify pra refletir no
 * nosso banco (tabela subscriptions).
 */
export async function purchasePackage(
  pkg: PurchasesPackage,
  accessToken: string,
  webUrl: string
): Promise<{ success: boolean; error?: string; customerInfo?: CustomerInfo }> {
  if (!initialized) {
    return { success: false, error: 'IAP nao inicializado' };
  }
  try {
    const { customerInfo, productIdentifier } = await Purchases.purchasePackage(pkg);

    // Notifica o backend pra criar/atualizar a linha em subscriptions.
    // O RevenueCat ja validou com a Apple — o verify no backend e um
    // espelho local. Em producao, RevenueCat webhooks tambem batem
    // /api/iap/webhook (se configurado) pra redundancia.
    const originalTxn = customerInfo.originalAppUserId || null;
    try {
      await fetch(`${webUrl}/api/iap/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          productId: productIdentifier,
          originalTransactionId: originalTxn,
          isRestore: false,
        }),
      });
    } catch (verifyErr) {
      // Backend sync falhou mas compra Apple OK — nao reverter.
      // RevenueCat webhook ira reconciliar.
      console.warn('[iap] backend verify failed (will reconcile via webhook):', verifyErr);
    }

    return { success: true, customerInfo };
  } catch (err) {
    const pErr = err as PurchasesError;
    if (pErr.userCancelled) {
      return { success: false, error: 'Compra cancelada' };
    }
    const code = pErr.code;
    if (code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      return { success: false, error: 'Pagamento pendente de aprovacao' };
    }
    return { success: false, error: pErr.message || 'Erro na compra' };
  }
}

/**
 * Restore: o usuario ja comprou antes (outro device, reinstalou, etc).
 * RevenueCat relê as transactions da Apple e reativa o entitlement.
 */
export async function restore(accessToken: string, webUrl: string): Promise<{
  success: boolean;
  hasActive: boolean;
  error?: string;
}> {
  if (!initialized) return { success: false, hasActive: false, error: 'IAP nao inicializado' };
  try {
    const customerInfo = await Purchases.restorePurchases();
    const hasActive = Object.keys(customerInfo.entitlements.active).length > 0;

    if (hasActive) {
      // Encontra o productId ativo e sincroniza com backend
      const active = Object.values(customerInfo.entitlements.active)[0];
      try {
        await fetch(`${webUrl}/api/iap/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            productId: active.productIdentifier,
            originalTransactionId: customerInfo.originalAppUserId,
            isRestore: true,
          }),
        });
      } catch {
        /* ignore — webhook reconcilia */
      }
    }

    return { success: true, hasActive };
  } catch (err) {
    const pErr = err as PurchasesError;
    return { success: false, hasActive: false, error: pErr.message || 'Erro ao restaurar' };
  }
}

/**
 * Le CustomerInfo atual (cache RevenueCat). Rapido, nao faz network.
 */
export async function getCurrentCustomerInfo(): Promise<CustomerInfo | null> {
  if (!initialized) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch {
    return null;
  }
}

/**
 * Helper: usuario tem entitlement "premium" ou "elite" ativo no RevenueCat?
 * (Complementa a checagem da tabela `subscriptions` no backend.)
 */
export function hasActiveEntitlement(info: CustomerInfo | null, id: 'premium' | 'elite'): boolean {
  if (!info) return false;
  return info.entitlements.active[id] !== undefined;
}
