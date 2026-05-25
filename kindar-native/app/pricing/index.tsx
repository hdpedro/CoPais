/**
 * Pricing Screen — compra real via RevenueCat.
 *
 * Fluxo:
 *   1. Carrega offerings do RevenueCat (getAvailablePackages)
 *   2. Usuario toca em um plano → purchasePackage → StoreKit sheet
 *   3. Em sucesso: backend sync + refetch subscription + UI premium
 *   4. Botao "Restaurar compras" pra quem reinstalou/trocou de device
 *
 * Compliance Apple:
 *   - Mostra claramente preco + periodo + auto-renovacao
 *   - Link pra Termos/Privacidade (exigido Guideline 3.1.2)
 *   - Info sobre cancelamento via Ajustes > Apple ID > Assinaturas
 */

import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import { getUserSubscription, type UserSubscription } from 'src/services/payments';
import { getAvailablePackages, purchasePackage, restore } from 'src/services/iap';
import type { PurchasesPackage } from 'react-native-purchases';
import { supabase } from 'src/lib/supabase';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { track, EVENTS } from 'src/lib/analytics';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

const FEATURES = [
  { icon: 'calendar-outline', text: 'Calendário de guarda ilimitado' },
  { icon: 'chatbubbles-outline', text: 'Chat sem limites' },
  { icon: 'heart-outline', text: 'Saúde completa (consultas, vacinas, alergias)' },
  { icon: 'document-text-outline', text: 'Documentos ilimitados' },
  { icon: 'sparkles-outline', text: 'Assistente IA (Kindar AI)' },
  { icon: 'pie-chart-outline', text: 'Relatórios financeiros' },
  { icon: 'people-outline', text: 'Crianças e responsáveis ilimitados' },
];

export default function PricingScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { userId } = useAuth();
  const [sub, setSub] = useState<UserSubscription | null>(null);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const loadSub = useCallback(async () => {
    if (userId) setSub(await getUserSubscription(userId));
  }, [userId]);

  useEffect(() => {
    // Async wrapper so the setState happens inside a callback, not directly
    // in the effect body (satisfies react-hooks/set-state-in-effect).
    (async () => {
      if (userId) setSub(await getUserSubscription(userId));
    })();
  }, [userId]);

  useEffect(() => {
    (async () => {
      setLoadingPkgs(true);
      const pkgs = await getAvailablePackages();
      setPackages(pkgs);
      setLoadingPkgs(false);
      // Telemetria — dispara depois que packages carregam pra anexar
      // `packages_offered` (quando 0, sinaliza problema RevenueCat).
      track(EVENTS.PRICING_VIEWED, {
        source: 'native_paywall',
        platform: Platform.OS,
        packages_offered: pkgs.length,
        current_tier: sub?.tier ?? null,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    const provider = Platform.OS === 'ios' ? 'apple_iap' : 'google_iap';
    // Captura intent ANTES do gate de auth — assim "tentei comprar mas não
    // estava logado" também conta no funil. Padrão simétrico ao PWA.
    track(EVENTS.CHECKOUT_STARTED, {
      plan_id: pkg.product.identifier,
      provider,
      price: pkg.product.price,
      currency: pkg.product.currencyCode,
      package_type: pkg.packageType,
      source: 'native_paywall',
    });

    const token = await getAccessToken();
    if (!token) {
      toast.show({ message: t('toasts.common.sessionExpired'), variant: 'error' });
      return;
    }
    setPurchasingId(pkg.identifier);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await purchasePackage(pkg, token, WEB_URL);
    setPurchasingId(null);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // checkout_completed = StoreKit confirmou compra. subscription_started
      // ainda é emitido server-side pelo revenuecat webhook (canonical), mas
      // este client-side fica como sinal rápido pra atribuição (UTMs, etc).
      track(EVENTS.CHECKOUT_COMPLETED, {
        plan_id: pkg.product.identifier,
        provider,
        price: pkg.product.price,
        currency: pkg.product.currencyCode,
        source: 'native_paywall',
      });
      await loadSub();
      toast.show({ message: t('toasts.subscription.premiumWelcome'), variant: 'success' });
    } else if (result.error === 'Compra cancelada') {
      track(EVENTS.CHECKOUT_CANCELED, {
        plan_id: pkg.product.identifier,
        provider,
        source: 'native_paywall',
      });
    } else {
      track(EVENTS.CHECKOUT_FAILED, {
        plan_id: pkg.product.identifier,
        provider,
        error_message: result.error,
        source: 'native_paywall',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.subscription.purchaseFailed'), variant: 'error' });
    }
  }

  async function handleRestore() {
    track(EVENTS.RESTORE_ATTEMPTED, { platform: Platform.OS, source: 'native_paywall' });

    const token = await getAccessToken();
    if (!token) {
      toast.show({ message: t('toasts.common.sessionExpired'), variant: 'error' });
      return;
    }
    setRestoring(true);
    const result = await restore(token, WEB_URL);
    setRestoring(false);

    if (result.success && result.hasActive) {
      track(EVENTS.RESTORE_SUCCEEDED, { platform: Platform.OS, has_active: true });
      await loadSub();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: t('toasts.subscription.restoreSuccess'), variant: 'success' });
    } else if (result.success) {
      track(EVENTS.RESTORE_SUCCEEDED, { platform: Platform.OS, has_active: false });
      toast.show({ message: t('toasts.subscription.restoreFailedNoSubscription'), variant: 'info' });
    } else {
      toast.show({ message: result.error || t('toasts.subscription.restoreFailed'), variant: 'error' });
    }
  }

  const isPremium = sub?.tier === 'premium' || sub?.tier === 'elite';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('subscription.headerTitle')} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        {/* Hero */}
        <View style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}>
          <Text style={{ fontSize: 44, marginBottom: spacing.md }}>{isPremium ? '👑' : '✨'}</Text>
          <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center' }}>
            {isPremium ? 'Você é Premium' : 'Kindar Premium'}
          </Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 22 }}>
            {isPremium
              ? 'Aproveite todos os recursos da rede de apoio e colaboração.'
              : 'Desbloqueie a organização completa da família.'}
          </Text>
        </View>

        {/* Features */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.xl, ...shadows.md }}>
          {FEATURES.map((f, i) => (
            <View key={i} style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm,
              borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
            }}>
              <Ionicons
                name={f.icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={isPremium ? colors.brand : colors.textSecondary}
              />
              <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>{f.text}</Text>
              <Ionicons name="checkmark-circle" size={18} color={isPremium ? colors.success : colors.textDim} />
            </View>
          ))}
        </View>

        {/* Active sub info */}
        {isPremium ? (
          <View style={{
            backgroundColor: `${colors.success}10`, borderRadius: radius.lg,
            padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg,
          }}>
            <Ionicons name="checkmark-circle" size={32} color={colors.success} />
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.success, marginTop: spacing.sm }}>
              Assinatura ativa
            </Text>
            {sub?.currentPeriodEnd ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.xs }}>
                Renova em {new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR')}
              </Text>
            ) : null}
            {Platform.OS === 'ios' ? (
              <TouchableOpacity
                onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
                accessibilityRole="link"
                accessibilityLabel="Gerenciar assinatura nas configurações da Apple"
                style={{ marginTop: spacing.md }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: colors.brand, textDecorationLine: 'underline' }}>
                  Gerenciar assinatura
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : loadingPkgs ? (
          <View style={{ paddingVertical: spacing['2xl'], alignItems: 'center' }}>
            <ActivityIndicator color={colors.brand} />
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.md }}>
              Carregando planos...
            </Text>
          </View>
        ) : packages.length === 0 ? (
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.lg,
            padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg,
          }}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.textMuted} />
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, lineHeight: 20 }}>
              Planos indisponiveis no momento. Tente novamente em alguns instantes ou assine em kindar.com.br.
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md, marginBottom: spacing.lg }}>
            {packages.map(pkg => {
              const isAnnual = pkg.packageType === 'ANNUAL';
              const product = pkg.product;
              const buying = purchasingId === pkg.identifier;
              return (
                <TouchableOpacity
                  key={pkg.identifier}
                  onPress={() => handlePurchase(pkg)}
                  disabled={!!purchasingId}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Assinar plano ${product.title.replace(' (Kindar)', '')} por ${product.priceString} ${isAnnual ? 'por ano' : 'por mês'}`}
                  accessibilityState={{ disabled: !!purchasingId, busy: buying }}
                  style={{
                    backgroundColor: colors.bgElevated,
                    borderRadius: radius.lg,
                    padding: spacing.xl,
                    borderWidth: isAnnual ? 2 : 1,
                    borderColor: isAnnual ? colors.brand : colors.borderLight,
                    opacity: purchasingId && !buying ? 0.4 : 1,
                    ...shadows.sm,
                  }}
                >
                  {isAnnual ? (
                    <View style={{
                      position: 'absolute', top: -10, right: 16,
                      backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 3,
                      borderRadius: radius.full,
                    }}>
                      <Text style={{ fontSize: 10, color: '#fff', fontWeight: font.weights.bold, letterSpacing: 1 }}>
                        MELHOR VALOR
                      </Text>
                    </View>
                  ) : null}
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
                    {product.title.replace(' (Kindar)', '')}
                  </Text>
                  <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2, lineHeight: 18 }}>
                    {product.description}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.md, gap: 4 }}>
                    <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.extrabold, color: colors.text }}>
                      {product.priceString}
                    </Text>
                    <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>
                      / {isAnnual ? 'ano' : 'mes'}
                    </Text>
                  </View>
                  {buying ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md }}>
                      <ActivityIndicator size="small" color={colors.brand} />
                      <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>Processando...</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Apple App Store Review Guideline 3.1.2(c) — auto-renewal disclosure
            MUST be adjacent to the subscribe buttons. Previously this text
            lived in the legal footer below the Restore button; Apple requires
            it "in the same view as, and immediately visible to, the user
            before they initiate the auto-renewable subscription purchase,
            without scrolling". Moved here on 2026-05-25 to comply.

            i18n-ignore: copy financeira/legal segue Regra Canônica 14 —
            PT-BR é a fonte autorizada, sem tradução por LLM. */}
        {!isPremium && packages.length > 0 ? (
          <View
            style={{
              marginBottom: spacing.lg,
              paddingHorizontal: spacing.sm,
            }}
            accessible
            accessibilityRole="text"
          >
            <Text
              style={{
                fontSize: 12,
                color: colors.textSecondary,
                lineHeight: 17,
                textAlign: 'center',
              }}
            >
              {Platform.OS === 'ios'
                ? 'Assinatura autorrenovável. A cobrança ocorre na sua conta Apple ID a cada período até que você cancele em Ajustes > Apple ID > Assinaturas, pelo menos 24h antes do fim do período.'
                : 'Assinatura autorrenovável. A cobrança ocorre na sua conta Google Play a cada período até que você cancele em Play Store > Pagamentos > Assinaturas, pelo menos 24h antes do fim do período.'}
            </Text>
          </View>
        ) : null}

        {/* Restore + legal */}
        {!isPremium ? (
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring || !!purchasingId}
            accessibilityRole="button"
            accessibilityLabel="Restaurar compras"
            accessibilityState={{ disabled: restoring || !!purchasingId, busy: restoring }}
            style={{ alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
              {restoring ? 'Restaurando...' : 'Restaurar compras'}
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={{
          padding: spacing.lg, backgroundColor: colors.bgSurface,
          borderRadius: radius.md, marginTop: spacing.md,
        }}>
          <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16, textAlign: 'center' }}>
            A assinatura renova automaticamente ate voce cancelar. Cancele a qualquer momento em Ajustes &gt;
            Apple ID &gt; Assinaturas. O pagamento sera cobrado na conta Apple ID na confirmacao da compra.
          </Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
            <TouchableOpacity
              onPress={() => Linking.openURL(`${WEB_URL}/termos`)}
              accessibilityRole="link"
              accessibilityLabel="Termos de Uso"
            >
              <Text style={{ fontSize: 11, color: colors.brand, textDecorationLine: 'underline' }}>
                Termos de Uso
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openURL(`${WEB_URL}/privacidade`)}
              accessibilityRole="link"
              accessibilityLabel="Política de Privacidade"
            >
              <Text style={{ fontSize: 11, color: colors.brand, textDecorationLine: 'underline' }}>
                Privacidade
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

