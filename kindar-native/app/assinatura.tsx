/**
 * Assinatura Screen — Kindar Native (Fase 4).
 *
 * Diferente de /pricing (marketing-like list of plans), esta tela mostra:
 *   - Estado atual da assinatura do GRUPO familiar (vindo de /api/billing/status)
 *   - Banner "X dias de trial restantes" se em degustação
 *   - Counter Early Bird ao vivo (slots remaining)
 *   - Botao para comprar via RevenueCat (StoreKit / Google Billing)
 *   - Botao "Restaurar Compra" (requisito Apple Guideline 3.1.1)
 *   - Copy "gerenciado por X" para membros que nao sao o pagador
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';

import {
  getAvailablePackages,
  purchasePackage,
  restore,
  PRODUCT_IDS,
} from 'src/services/iap';
import {
  getBillingStatus,
  enableSubscriptionSplit,
  disableSubscriptionSplit,
  type BillingStatus,
  FREE_BILLING,
} from 'src/services/billing';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { withTimeout, TimeoutError } from 'src/lib/with-timeout';
import { reportError } from 'src/lib/error-reporter';

interface SplitMember {
  user_id: string;
  full_name: string;
  short_name: string;
}

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface PackageView {
  pkg: PurchasesPackage;
  planId: keyof typeof PRODUCT_IDS | null;
  title: string;
  subtitle: string;
  tier: 'harmonia' | 'premium_juridico';
  isEarlyBird: boolean;
}

/** Map a RevenueCat product ID back to our plan ID for UI decisions. */
function mapProductToPlan(productId: string): keyof typeof PRODUCT_IDS | null {
  const entry = (Object.entries(PRODUCT_IDS) as Array<[keyof typeof PRODUCT_IDS, string]>).find(
    ([, id]) => id === productId
  );
  return entry?.[0] ?? null;
}

function classifyPackage(pkg: PurchasesPackage, t: (key: string) => string): PackageView {
  const productId = pkg.product.identifier;
  const planId = mapProductToPlan(productId);
  const isEarlyBird = productId.includes('earlybird');
  const isJuridico = productId.includes('juridico');
  return {
    pkg,
    planId,
    title: isJuridico
      ? t('subscription.planJuridicoLabel')
      : isEarlyBird
      ? t('subscription.earlyBirdTitle')
      : 'Harmonia',
    subtitle: isJuridico
      ? t('subscription.subtitleJuridico')
      : isEarlyBird
      ? t('subscription.subtitleEarlyBird')
      : t('subscription.subtitleHarmonia'),
    tier: isJuridico ? 'premium_juridico' : 'harmonia',
    isEarlyBird,
  };
}

export default function AssinaturaScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [billing, setBilling] = useState<BillingStatus>(FREE_BILLING);
  const [packages, setPackages] = useState<PackageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [splitMembers, setSplitMembers] = useState<SplitMember[]>([]);
  const [splitBusy, setSplitBusy] = useState(false);

  const loadAll = useCallback(async () => {
    const [status, pkgs] = await withTimeout(
      Promise.all([getBillingStatus(), getAvailablePackages()]),
      15_000,
      'assinatura:loadAll',
    );
    setBilling(status);
    // Plano único (jun/2026): só Harmonia é vendável. Early Bird e Premium
    // Jurídico ficam ocultos pra novos compradores (grandfathered no servidor).
    setPackages(
      pkgs
        .filter(
          (p) =>
            p.product.identifier.includes('harmonia') &&
            !p.product.identifier.includes('earlybird'),
        )
        .map((p) => classifyPackage(p, t)),
    );

    // Load eligible co-payers (parent role, not self) for the split picker.
    if (status.canPay && status.isActive && !status.isTrial && activeGroup?.groupId && userId) {
      const { data } = await supabase
        .from('group_members')
        .select('user_id, profiles!group_members_user_id_fkey(full_name, role)')
        .eq('group_id', activeGroup.groupId)
        .neq('user_id', userId);
      const members: SplitMember[] = (data || [])
        .map((m) => {
          const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          if (!p || p.role !== 'parent') return null;
          const full = p.full_name || t('subscription.memberFallback');
          return {
            user_id: m.user_id as string,
            full_name: full,
            short_name: full.split(' ')[0],
          };
        })
        .filter((m): m is SplitMember => m !== null);
      setSplitMembers(members);
    } else {
      setSplitMembers([]);
    }
  }, [activeGroup, userId, t]);

  async function handleEnableSplit(coUserId: string) {
    if (!activeGroup?.groupId) return;
    setSplitBusy(true);
    const r = await enableSubscriptionSplit({
      groupId: activeGroup.groupId,
      coUserId,
      coSharePercent: 50,
    });
    setSplitBusy(false);
    if (r.success) {
      await loadAll();
      toast.show({ message: t('toasts.subscription.splitEnabled'), variant: 'success' });
    } else {
      toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  async function handleDisableSplit() {
    if (!activeGroup?.groupId) return;
    Alert.alert(
      t('subscription.disableSplitTitle'),
      t('subscription.disableSplitMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('subscription.deactivate'),
          style: 'destructive',
          onPress: async () => {
            setSplitBusy(true);
            const r = await disableSubscriptionSplit(activeGroup.groupId);
            setSplitBusy(false);
            if (r.success) {
              await loadAll();
            } else {
              toast.show({ message: r.error || t('toasts.common.fallbackError'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        await loadAll();
      } catch (e) {
        if (!(e instanceof TimeoutError)) {
          reportError(e, { severity: 'error', filePath: 'assinatura.loadAll' }).catch(() => {});
        }
      } finally {
        // Invariante: spinner SEMPRE termina mesmo em timeout/erro.
        setLoading(false);
      }
    })();
  }, [loadAll]);

  async function onRefresh() {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function handlePurchase(view: PackageView) {
    const token = await getAccessToken();
    if (!token) {
      toast.show({ message: t('toasts.common.sessionExpired'), variant: 'error' });
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPurchasingId(view.pkg.identifier);
    try {
      const res = await purchasePackage(view.pkg, token, WEB_URL);
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show({ message: t('toasts.subscription.purchaseSuccess', { plan: view.title }), variant: 'success' });
        await loadAll();
      } else if (res.error && !/cancel/i.test(res.error)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.show({ message: res.error || t('toasts.subscription.purchaseFailed'), variant: 'error' });
      }
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestore() {
    const token = await getAccessToken();
    if (!token) {
      toast.show({ message: t('toasts.common.sessionExpired'), variant: 'error' });
      return;
    }
    setRestoring(true);
    try {
      const res = await restore(token, WEB_URL);
      if (!res.success) {
        toast.show({ message: res.error || t('toasts.subscription.restoreFailed'), variant: 'error' });
      } else if (!res.hasActive) {
        toast.show({ message: t('toasts.subscription.restoreNotFound'), variant: 'info' });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show({ message: t('toasts.subscription.restoreSuccess'), variant: 'success' });
        await loadAll();
      }
    } finally {
      setRestoring(false);
    }
  }

  function openAppleSubscriptions() {
    Linking.openURL('https://apps.apple.com/account/subscriptions');
  }

  function openGoogleSubscriptions() {
    Linking.openURL('https://play.google.com/store/account/subscriptions');
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  // Non-payer view: grandparent, caregiver, lawyer, mediator
  if (!billing.canPay) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <ScreenHeader title={t('subscription.headerTitle')} />
        <View style={{ padding: spacing.xl }}>
          <View
            style={{
              backgroundColor: colors.bgElevated,
              borderRadius: radius.lg,
              padding: spacing.xl,
              ...shadows.md,
            }}
          >
            <Ionicons name="heart-outline" size={32} color={colors.brand} />
            <Text
              style={{
                fontSize: font.sizes.lg,
                fontWeight: '700',
                color: colors.text,
                marginTop: spacing.md,
              }}
            >
              {t('subscription.familyPlanTitle')}
            </Text>
            <Text
              style={{
                fontSize: font.sizes.md,
                color: colors.textSecondary,
                marginTop: spacing.xs,
                lineHeight: 22,
              }}
            >
              {billing.isActive
                ? t('subscription.nonPayerActive', { tier: tierLabel(billing.tier, t) })
                : t('subscription.nonPayerInactive')}
            </Text>
            {billing.payerReason === 'not_legal_guardian' && (
              <Text
                style={{
                  fontSize: font.sizes.sm,
                  color: colors.textMuted,
                  marginTop: spacing.md,
                  lineHeight: 18,
                }}
              >
                {t('subscription.nonPayerGuestNote')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring}
            style={{
              marginTop: spacing.xl,
              padding: spacing.lg,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: '600' }}>
              {restoring ? t('subscription.restoring') : t('subscription.restorePurchase')}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      contentContainerStyle={{ paddingBottom: spacing['3xl'] }}
    >
      <ScreenHeader title={t('subscription.headerTitle')} />

      <View style={{ padding: spacing.xl, gap: spacing.lg }}>
        {/* Status card */}
        {billing.isActive && (
          <View
            style={{
              backgroundColor: billing.isTrial ? '#E8F4ED' : colors.brandLight,
              borderRadius: radius.lg,
              padding: spacing.lg,
              borderWidth: 1,
              borderColor: billing.isTrial ? '#9CD3B5' : colors.brand + '44',
            }}
          >
            <Text style={{ fontSize: font.sizes.sm, color: colors.brandDark, fontWeight: '700' }}>
              {billing.isTrial
                ? `🎁 ${billing.trialDaysRemaining === 1
                    ? t('subscription.trialDayRemaining', { days: billing.trialDaysRemaining })
                    : t('subscription.trialDaysRemaining', { days: billing.trialDaysRemaining ?? 0 })}`
                : `✓ ${t('subscription.tierActive', { tier: tierLabel(billing.tier, t) })}`}
            </Text>
            {billing.cancelAtPeriodEnd && billing.currentPeriodEnd && (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 4 }}>
                {t('subscription.cancelScheduled', { date: new Date(billing.currentPeriodEnd).toLocaleDateString('pt-BR') })}
              </Text>
            )}
          </View>
        )}

        {/* Manage subscription — for active paid subs, point to Apple/Google */}
        {billing.isActive && !billing.isTrial && billing.paymentProvider !== 'trial' && (
          <TouchableOpacity
            onPress={Platform.OS === 'ios' ? openAppleSubscriptions : openGoogleSubscriptions}
            style={{
              backgroundColor: colors.bgElevated,
              borderRadius: radius.lg,
              padding: spacing.lg,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderWidth: 1,
              borderColor: colors.borderLight,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: '600', color: colors.text }}>
                {t('subscription.manageSubscription')}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                {Platform.OS === 'ios'
                  ? t('subscription.manageHintIos')
                  : t('subscription.manageHintAndroid')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {/* Plan cards */}
        {packages.length === 0 && !billing.isActive && (
          <View style={{ padding: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brand} />
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.md }}>
              {t('subscription.loadingPlans')}
            </Text>
          </View>
        )}

        {packages.map((view) => {
          const busy = purchasingId === view.pkg.identifier;
          const isCurrentTier = billing.tier === view.tier && billing.isActive && !billing.isTrial;
          const priceString = view.pkg.product.priceString;

          return (
            <View
              key={view.pkg.identifier}
              style={{
                backgroundColor: colors.bgElevated,
                borderRadius: radius.lg,
                padding: spacing.lg,
                borderWidth: view.isEarlyBird ? 2 : 1,
                borderColor: view.isEarlyBird ? colors.brand : colors.borderLight,
                ...shadows.md,
              }}
            >
              <Text style={{ fontSize: font.sizes.lg, fontWeight: '700', color: colors.text }}>
                {view.title}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
                {view.subtitle}
              </Text>
              <Text
                style={{
                  fontSize: font.sizes['2xl'],
                  fontWeight: '800',
                  color: colors.text,
                  marginTop: spacing.md,
                }}
              >
                {priceString}
                <Text style={{ fontSize: font.sizes.sm, fontWeight: '500', color: colors.textSecondary }}>
                  {' '}
                  {view.pkg.packageType === 'ANNUAL' ? t('billing.perYear') : t('billing.perMonth')}
                </Text>
              </Text>

              <TouchableOpacity
                onPress={() => handlePurchase(view)}
                disabled={busy || isCurrentTier}
                style={{
                  marginTop: spacing.md,
                  backgroundColor: isCurrentTier
                    ? colors.borderLight
                    : view.isEarlyBird
                    ? colors.brand
                    : colors.text,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  alignItems: 'center',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={{ fontSize: font.sizes.md, fontWeight: '700', color: 'white' }}>
                    {isCurrentTier
                      ? t('subscription.currentPlan')
                      : view.isEarlyBird
                      ? t('subscription.earlyBirdCta')
                      : t('subscription.subscribePlan', { plan: view.title })}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Auto-split toggle (only for the active payer on a paid sub) */}
        {billing.canPay && billing.isActive && !billing.isTrial && billing.payerUserId === userId && (
          <View style={{
            marginTop: spacing.xl,
            backgroundColor: colors.bgElevated,
            borderRadius: radius.lg,
            padding: spacing.xl,
            ...shadows.sm,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Ionicons name="people-outline" size={20} color={colors.brand} />
              <Text style={{ fontSize: font.sizes.md, fontWeight: '700', color: colors.text }}>
                {t('subscription.splitTitle')}
              </Text>
            </View>

            {billing.autoSplit ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 }}>
                  {billing.autoSplitCoShare
                    ? t('subscription.splitActiveShare', { percent: billing.autoSplitCoShare })
                    : t('subscription.splitActive')}
                </Text>
                <TouchableOpacity
                  disabled={splitBusy}
                  onPress={handleDisableSplit}
                  style={{
                    marginTop: spacing.md,
                    backgroundColor: colors.bgSurface,
                    borderRadius: radius.md,
                    paddingVertical: spacing.md,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: colors.borderLight,
                    opacity: splitBusy ? 0.5 : 1,
                  }}
                >
                  {splitBusy ? <ActivityIndicator color={colors.text} /> : (
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: font.sizes.sm }}>
                      {t('subscription.disableSplit')}
                    </Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 }}>
                  {t('subscription.splitPayingAlone')}
                </Text>
                {splitMembers.length === 0 ? (
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' }}>
                    {t('subscription.splitNoCoParent')}
                  </Text>
                ) : (
                  <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                    {splitMembers.map((m) => (
                      <TouchableOpacity
                        key={m.user_id}
                        disabled={splitBusy}
                        onPress={() => handleEnableSplit(m.user_id)}
                        style={{
                          backgroundColor: colors.brand,
                          borderRadius: radius.md,
                          paddingVertical: spacing.md,
                          paddingHorizontal: spacing.lg,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          opacity: splitBusy ? 0.5 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: font.sizes.sm }}>
                          {t('subscription.splitWith', { name: m.short_name })}
                        </Text>
                        {splitBusy ? <ActivityIndicator color="#fff" /> : <Ionicons name="arrow-forward" size={16} color="#fff" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Restore + legal (Apple requires both) */}
        <View style={{ marginTop: spacing.md, alignItems: 'center', gap: spacing.md }}>
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring}
            style={{ padding: spacing.md }}
          >
            <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: '600' }}>
              {restoring ? t('subscription.restoring') : t('subscription.restorePurchase')}
            </Text>
          </TouchableOpacity>

          <Text
            style={{
              fontSize: font.sizes.xs,
              color: colors.textMuted,
              textAlign: 'center',
              paddingHorizontal: spacing.xl,
              lineHeight: 16,
            }}
          >
            {t('subscription.autoRenewNotice', {
              location: Platform.OS === 'ios'
                ? t('subscription.cancelLocationIos')
                : t('subscription.cancelLocationAndroid'),
            })}
            {'\n\n'}
            {t('subscription.legalPrefix')}{' '}
            <Text
              style={{ color: colors.brand }}
              onPress={() => Linking.openURL(`${WEB_URL}/termos`)}
            >
              {t('subscription.legalTerms')}
            </Text>{' '}
            {t('subscription.legalAnd')}{' '}
            <Text
              style={{ color: colors.brand }}
              onPress={() => Linking.openURL(`${WEB_URL}/privacidade`)}
            >
              {t('subscription.legalPrivacy')}
            </Text>
            {t('subscription.legalSuffix')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function tierLabel(tier: BillingStatus['tier'], t: (key: string) => string): string {
  if (tier === 'premium_juridico') return t('subscription.planJuridicoLabel');
  if (tier === 'harmonia') return 'Harmonia';
  return t('subscription.planFree');
}
