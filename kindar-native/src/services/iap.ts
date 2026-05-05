/**
 * IAP Service — RevenueCat wrapper.
 *
 * RevenueCat abstrai StoreKit (iOS) + Google Billing (Android) + retry +
 * offline + receipt validation. O backend /api/iap/verify continua sendo
 * chamado pro nosso lado ter a subscription na tabela `subscriptions`,
 * e o /api/revenuecat/webhook reconcilia eventos server-side (renewals,
 * cancelamentos, billing issues) pra redundancia.
 *
 * SKUs (definidos em ASC/Play Console + RevenueCat dashboard).
 *   Fase 4: nova tabela de IDs alinhada com Harmonia / Premium Juridico.
 *   SKUs legados (premium_*, elite_*) ainda funcionam via /api/iap/verify
 *   que consulta plans.apple_product_id, mas sao grandfathered — novos
 *   compradores veem apenas os novos.
 *
 * Setup: ver MANUAL_OPERACIONAL.md secoes 6, 7, 8.
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

// Product IDs Fase 4 (novos) — mesmo ID no ASC e no Play Console.
// Cada plan_id no banco de dados tem apple_product_id = google_product_id
// para simplificar a resolucao no /api/iap/verify e no webhook.
export const PRODUCT_IDS = {
  harmonia_earlybird_monthly: 'com.kindar.harmonia.earlybird.monthly',
  harmonia_earlybird_annual: 'com.kindar.harmonia.earlybird.annual',
  harmonia_monthly: 'com.kindar.harmonia.monthly',
  harmonia_annual: 'com.kindar.harmonia.annual',
  premium_juridico_monthly: 'com.kindar.juridico.monthly',
  premium_juridico_annual: 'com.kindar.juridico.annual',
} as const;

/** @deprecated use PRODUCT_IDS — kept for compat with pricing screen */
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
 * Lista os packages ofertados.
 *
 * Estratégia híbrida:
 *   1. Tenta o Offering "default" do RevenueCat (caminho preferencial — permite
 *      controle remoto via dashboard sem rebuild).
 *   2. Se o offering tem menos packages que PRODUCT_IDS, complementa buscando
 *      os produtos faltantes direto no StoreKit via `Purchases.getProducts()`.
 *      Esses são embrulhados como "synthetic packages" pra manter a interface
 *      consumida pelos screens de pricing/assinatura inalterada.
 *   3. Synthetic packages são identificados pelo prefix `_synth_` em
 *      `identifier`. `purchasePackage()` detecta e roteia pra
 *      `purchaseStoreProduct()` em vez de `purchasePackage()`.
 *
 * Isso garante que o paywall mostre os 6 produtos mesmo se o RevenueCat
 * Offering só tiver 2 (cenário comum — V2 API não permite anexar product
 * a package via REST, só via dashboard).
 */
export async function getAvailablePackages(): Promise<PurchasesPackage[]> {
  if (!initialized) return [];

  const result: PurchasesPackage[] = [];
  const coveredProductIds = new Set<string>();

  // 1. Real packages from offering
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (current) {
      for (const pkg of current.availablePackages) {
        result.push(pkg);
        coveredProductIds.add(pkg.product.identifier);
      }
    }
  } catch (err) {
    console.warn('[iap] getOfferings failed:', err);
  }

  // 2. Fill gaps with synthetic packages from StoreKit products
  const missingIds = Object.values(PRODUCT_IDS).filter((id) => !coveredProductIds.has(id));
  if (missingIds.length > 0) {
    try {
      const products = await Purchases.getProducts(missingIds);
      for (const product of products) {
        const isAnnual = product.identifier.includes('annual');
        const synthetic: PurchasesPackage = {
          identifier: `_synth_${product.identifier}`,
          packageType: (isAnnual ? 'ANNUAL' : 'MONTHLY') as PurchasesPackage['packageType'],
          product,
          presentedOfferingIdentifier: 'default',
          // RC SDK adicionou `presentedOfferingContext` em versões mais novas;
          // pra cross-version compat, casteamos via unknown.
          presentedOfferingContext: {
            offeringIdentifier: 'default',
            placementIdentifier: null,
            targetingContext: null,
          },
          offeringIdentifier: 'default',
        } as unknown as PurchasesPackage;
        result.push(synthetic);
      }
    } catch (err) {
      console.warn('[iap] getProducts (synthetic fallback) failed:', err);
    }
  }

  return result;
}

function isSyntheticPackage(pkg: PurchasesPackage): boolean {
  return pkg.identifier.startsWith('_synth_');
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
    // Synthetic packages (criados pra cobrir gaps do offering) precisam ser
    // comprados via purchaseStoreProduct, não purchasePackage — Apple/RC
    // valida que o package existe no offering remoto.
    const { customerInfo, productIdentifier } = isSyntheticPackage(pkg)
      ? await Purchases.purchaseStoreProduct(pkg.product)
      : await Purchases.purchasePackage(pkg);

    // Notifica o backend pra criar/atualizar a linha em subscriptions.
    // O RevenueCat ja validou com a Apple — o verify no backend e um
    // espelho local. Em producao, RevenueCat webhooks tambem batem
    // /api/iap/webhook (se configurado) pra redundancia.
    const originalTxn = customerInfo.originalAppUserId || null;
    const platform = Platform.OS === 'android' ? 'google' : 'apple';
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
          platform,
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
      const platform = Platform.OS === 'android' ? 'google' : 'apple';
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
            platform,
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
