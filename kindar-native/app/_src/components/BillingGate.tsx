/**
 * BillingGate — bloqueio total pós-trial (modelo de plano único, jun/2026).
 *
 * Quando o grupo da coorte nova fica sem assinatura ativa (trial de 30 dias
 * expirou), `/api/billing/status` retorna `locked=true` e este gate cobre o
 * app inteiro com o paywall do Harmonia. Espelha o padrão de overlay do
 * LockGate: children sempre renderizam por baixo (preserva nav state), o
 * paywall vive por cima via absoluteFill.
 *
 * Decisões alinhadas com o gate do PWA (src/app/(app)/layout.tsx):
 *   - billing é server-side autoritativo — nunca inferimos lock do RevenueCat.
 *   - fail-open: erro/timeout ao ler o status NUNCA tranca o usuário.
 *   - só a coorte enforced é trancável; onboarding (sem grupo) passa direto.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  AppState,
  Linking,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { PurchasesPackage } from 'react-native-purchases';

import { useAuth } from '../store/auth';
import { getBillingStatus, invalidateBillingCache } from '../services/billing';
import { getAvailablePackages, purchasePackage, restore } from '../services/iap';
import { supabase } from '../lib/supabase';
import { colors, spacing, radius, font, shadows } from '../design-system/tokens';
import { useToast } from './ui/ToastProvider';
import { withTimeout, TimeoutError } from '../lib/with-timeout';
import { reportError } from '../lib/error-reporter';
import { useI18n } from '../i18n';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface Props {
  children: ReactNode;
}

/** Só o Harmonia é vendável agora — descarta Early Bird e Jurídico do paywall. */
function isHarmoniaPackage(pkg: PurchasesPackage): boolean {
  const id = pkg.product.identifier;
  return id.includes('harmonia') && !id.includes('earlybird');
}

export default function BillingGate({ children }: Props) {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const activeGroup = useAuth((s) => s.activeGroup);
  const groupId = activeGroup?.groupId;

  const [checked, setChecked] = useState(false);
  const [locked, setLocked] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setLocked(false);
      setChecked(true);
      return;
    }
    try {
      const status = await withTimeout(
        getBillingStatus(groupId, { skipCache: true }),
        12_000,
        'billing-gate:refresh',
      );
      setLocked(Boolean(status.locked));
    } catch (e) {
      // Fail-open: nunca tranca por erro/timeout de rede.
      setLocked(false);
      if (!(e instanceof TimeoutError)) {
        reportError(e, { severity: 'warning', filePath: 'BillingGate.refresh' }).catch(() => {});
      }
    } finally {
      setChecked(true);
    }
  }, [isAuthenticated, groupId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-checa ao voltar pro foreground — cobre trial que expirou enquanto o
  // app estava em background e renovação/cancelamento feitos na loja.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {checked && locked ? (
        <View style={StyleSheet.absoluteFill}>
          <BillingPaywall onUnlocked={refresh} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Paywall não dispensável — Harmonia via RevenueCat. Saídas: assinar,
 * restaurar compra (requisito Apple) ou sair da conta.
 */
function BillingPaywall({ onUnlocked }: { onUnlocked: () => void }) {
  const t = useI18n((s) => s.t);
  const toast = useToast();
  const signOut = useAuth((s) => s.signOut);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    try {
      const pkgs = await withTimeout(getAvailablePackages(), 12_000, 'billing-gate:packages');
      setPackages(pkgs.filter(isHarmoniaPackage));
    } catch (e) {
      if (!(e instanceof TimeoutError)) {
        reportError(e, { severity: 'warning', filePath: 'BillingGate.load' }).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function getAccessToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    const token = await getAccessToken();
    if (!token) {
      toast.show({ message: t('common.sessionExpired'), variant: 'error' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPurchasingId(pkg.identifier);
    try {
      const res = await purchasePackage(pkg, token, WEB_URL);
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateBillingCache();
        onUnlocked();
      } else if (res.error && !/cancel/i.test(res.error)) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.show({ message: res.error, variant: 'error' });
      }
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestore() {
    const token = await getAccessToken();
    if (!token) {
      toast.show({ message: t('common.sessionExpired'), variant: 'error' });
      return;
    }
    setRestoring(true);
    try {
      const res = await restore(token, WEB_URL);
      if (res.success && res.hasActive) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateBillingCache();
        onUnlocked();
      } else if (res.success) {
        toast.show({ message: t('toasts.subscription.restoreFailedNoSubscription'), variant: 'info' });
      } else {
        toast.show({ message: res.error || t('toasts.subscription.restoreFailed'), variant: 'error' });
      }
    } finally {
      setRestoring(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: spacing.xl }}
    >
      <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
        <Text style={styles.brand}>Kindar</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('billing.trialEndedBadge')}</Text>
        </View>
        <Text style={styles.title}>{t('billing.accessPausedTitle')}</Text>
        <Text style={styles.body}>
          {t('billing.accessPausedBody')}
        </Text>

        {loading ? (
          <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : packages.length === 0 ? (
          <Text style={[styles.body, { marginTop: spacing.md }]}>
            {t('billing.planLoadFailed', { url: WEB_URL.replace('https://', '') })}
          </Text>
        ) : (
          packages.map((pkg) => {
            const busy = purchasingId === pkg.identifier;
            const isAnnual = pkg.packageType === 'ANNUAL' || pkg.product.identifier.includes('annual');
            return (
              <View key={pkg.identifier} style={styles.planBox}>
                <Text style={styles.planName}>{isAnnual ? t('billing.planNameAnnual') : t('subscription.planHarmonia')}</Text>
                <Text style={styles.planPrice}>
                  {pkg.product.priceString}
                  <Text style={styles.planInterval}>{isAnnual ? ` ${t('billing.perYear')}` : ` ${t('billing.perMonth')}`}</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => handlePurchase(pkg)}
                  disabled={busy}
                  style={[styles.cta, busy && { opacity: 0.6 }]}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.ctaText}>{t('subscription.harmoniaCta')}</Text>
                  )}
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      {/* Saídas: restaurar (requisito Apple) + sair */}
      <View style={{ alignItems: 'center', marginTop: spacing.xl, gap: spacing.md }}>
        <TouchableOpacity onPress={handleRestore} disabled={restoring} style={{ padding: spacing.md }}>
          <Text style={styles.link}>{restoring ? t('billing.restoring') : t('subscription.restorePurchase')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => Linking.openURL(`${WEB_URL}/suporte`)} style={{ padding: spacing.sm }}>
          <Text style={styles.muted}>{t('billing.supportPrompt')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => signOut()} style={{ padding: spacing.sm }}>
          <Text style={styles.muted}>{t('billing.signOut')}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.xl,
    ...shadows.md,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FDF0DC',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  badgeText: { fontSize: font.sizes.xs, color: '#92651C', fontWeight: '700' },
  title: { fontSize: font.sizes.xl, fontWeight: '800', color: colors.text },
  body: { fontSize: font.sizes.md, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 22 },
  planBox: {
    marginTop: spacing.lg,
    borderWidth: 2,
    borderColor: colors.brand,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  planName: { fontSize: font.sizes.lg, fontWeight: '700', color: colors.text },
  planPrice: { fontSize: font.sizes['2xl'], fontWeight: '800', color: colors.text, marginTop: 4 },
  planInterval: { fontSize: font.sizes.sm, fontWeight: '500', color: colors.textSecondary },
  cta: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: { fontSize: font.sizes.md, fontWeight: '700', color: '#fff' },
  link: { fontSize: font.sizes.sm, color: colors.brand, fontWeight: '600' },
  muted: { fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'center' },
});
