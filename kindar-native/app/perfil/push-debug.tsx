/**
 * /perfil/push-debug — Diagnóstico de push iOS/Android.
 *
 * Por que existe: o registro de token APNs falha silenciosamente em iOS
 * em algumas situações (race condition, permission undetermined, env vars
 * ausentes, etc). Essa tela é o "voltímetro" do pipeline de push — mostra
 * cada camada e permite agir em cada uma.
 *
 * Não depende de `/api/notifications/prefs` (que tem bug separado de
 * middleware). Funciona até em build que tem outros endpoints quebrados.
 *
 * Camadas verificadas:
 *  1. Permission iOS (granted/denied/undetermined)
 *  2. Device token (raw APNs/FCM token)
 *  3. Token registrado no backend
 *  4. Server config (env vars APNs setadas)
 *  5. Apple delivery (envia push real e mostra resposta)
 */

import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from 'src/lib/api-fetch';
import { registerForPushNotificationsAsync } from 'src/services/push-setup';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useIntl } from 'src/lib/intl';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

interface DebugStatus {
  userId?: string;
  email?: string;
  serverConfig?: {
    apns_key_id_set: boolean;
    apns_team_id_set: boolean;
    apns_key_p8_set: boolean;
    apns_bundle_id: string;
  };
  counts?: { apns_tokens: number; fcm_tokens: number; web_subscriptions: number };
  apnsTokens?: Array<{ suffix: string; length: number; created_at: string }>;
}

interface SendResult {
  ok: boolean;
  reason?: string;
  hint?: string;
  totalTokens?: number;
  delivered?: number;
  attempts?: Array<{
    tokenSuffix: string;
    delivered: boolean;
    status: number | null;
    reason: string | null;
    errorMessage: string | null;
  }>;
}

export default function PushDebugScreen() {
  const intl = useIntl();
  const t = useI18n((s) => s.t);
  const [permission, setPermission] = useState<string>('—');
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastRegister, setLastRegister] = useState<string>('—');
  const [lastSend, setLastSend] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const perm = await Notifications.getPermissionsAsync();
      setPermission(perm.status);
      const r = await apiFetch<DebugStatus>('/api/push/debug-self');
      if (r.ok && r.data) {
        setStatus(r.data);
      } else {
        setError(r.error ?? t('pushDebug.loadFailed'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('pushDebug.unexpectedError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleForceRegister() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy('register');
    setLastRegister(t('pushDebug.registerRunning'));
    try {
      const token = await registerForPushNotificationsAsync({ forceRequest: true });
      setLastRegister(token
        ? t('pushDebug.registerOk', { token: `${token.slice(0, 12)}…${token.slice(-8)}`, length: token.length })
        : t('pushDebug.registerNull'));
      await load();
    } catch (e) {
      setLastRegister(t('pushDebug.registerError', { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  }

  async function handleSendTest() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy('send');
    setLastSend(null);
    try {
      const r = await apiFetch<SendResult>('/api/push/debug-self', { method: 'POST' });
      if (r.ok && r.data) setLastSend(r.data);
      else setLastSend({ ok: false, reason: r.error ?? t('pushDebug.sendUnknownError') });
    } catch (e) {
      setLastSend({ ok: false, reason: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  function handleOpenSettings() {
    Linking.openURL('app-settings:').catch(() => Linking.openSettings());
  }

  const permColor = permission === 'granted' ? '#16A34A' : permission === 'denied' ? '#DC2626' : '#F59E0B';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('pushDebug.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.md }}>
          {t('pushDebug.intro')}
        </Text>

        {/* Camada 1: Permission iOS */}
        <Card title={t('pushDebug.card1Title')} hint={t('pushDebug.card1Hint')}>
          <Row label={t('pushDebug.statusLabel')} value={permission} valueColor={permColor} />
          {permission !== 'granted' ? (
            <Button label={t('pushDebug.openSettings')} onPress={handleOpenSettings} icon="open-outline" variant="ghost" />
          ) : null}
        </Card>

        {/* Camada 2: Device token + Backend register */}
        <Card title={t('pushDebug.card2Title')} hint={t('pushDebug.card2Hint')}>
          {loading ? <Row label={t('pushDebug.loading')} value="" /> : null}
          {error ? <Row label={t('pushDebug.errorLabel')} value={error} valueColor="#DC2626" /> : null}
          {status && (
            <>
              <Row label={t('pushDebug.apnsTokens')} value={String(status.counts?.apns_tokens ?? 0)} valueColor={status.counts?.apns_tokens ? '#16A34A' : '#DC2626'} />
              <Row label={t('pushDebug.fcmTokens')} value={String(status.counts?.fcm_tokens ?? 0)} />
              <Row label={t('pushDebug.webSubs')} value={String(status.counts?.web_subscriptions ?? 0)} />
              {status.apnsTokens?.map((tok, i) => (
                <Row key={i} label={t('pushDebug.tokenLabel', { n: i + 1 })} value={t('pushDebug.tokenValue', { suffix: tok.suffix, length: tok.length, date: intl.formatDateTime(tok.created_at) })} small />
              ))}
            </>
          )}
          <Row label={t('pushDebug.lastRegister')} value={lastRegister} small />
          <Button
            label={busy === 'register' ? t('pushDebug.registering') : t('pushDebug.forceRegister')}
            onPress={handleForceRegister}
            icon="refresh-outline"
            disabled={busy !== null}
          />
        </Card>

        {/* Camada 3: Server config */}
        <Card title={t('pushDebug.card3Title')} hint={t('pushDebug.card3Hint')}>
          {status?.serverConfig && (
            <>
              <Row label="APNS_KEY_ID" value={status.serverConfig.apns_key_id_set ? t('pushDebug.set') : t('pushDebug.missing')} valueColor={status.serverConfig.apns_key_id_set ? '#16A34A' : '#DC2626'} />
              <Row label="APNS_TEAM_ID" value={status.serverConfig.apns_team_id_set ? t('pushDebug.set') : t('pushDebug.missing')} valueColor={status.serverConfig.apns_team_id_set ? '#16A34A' : '#DC2626'} />
              <Row label="APNS_KEY_P8" value={status.serverConfig.apns_key_p8_set ? t('pushDebug.set') : t('pushDebug.missing')} valueColor={status.serverConfig.apns_key_p8_set ? '#16A34A' : '#DC2626'} />
              <Row label="APNS_BUNDLE_ID" value={status.serverConfig.apns_bundle_id} small />
            </>
          )}
        </Card>

        {/* Camada 4: Apple delivery */}
        <Card title={t('pushDebug.card4Title')} hint={t('pushDebug.card4Hint')}>
          {lastSend && (
            <>
              <Row label={t('pushDebug.resultLabel')} value={lastSend.ok ? t('pushDebug.delivered') : t('pushDebug.failed')} valueColor={lastSend.ok ? '#16A34A' : '#DC2626'} />
              {lastSend.reason && <Row label={t('pushDebug.reasonLabel')} value={lastSend.reason} small />}
              {lastSend.hint && <Row label={t('pushDebug.hintLabel')} value={lastSend.hint} small />}
              {lastSend.attempts?.map((a, i) => (
                <View key={i} style={{ marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Row label={`#${i + 1} ${a.tokenSuffix}`} value={a.delivered ? '✓' : '✗'} valueColor={a.delivered ? '#16A34A' : '#DC2626'} small />
                  <Row label={t('pushDebug.attemptStatusLabel')} value={String(a.status ?? '—')} small />
                  <Row label={t('pushDebug.attemptReasonLabel')} value={a.reason ?? '—'} small />
                  {a.errorMessage && <Row label={t('pushDebug.attemptErrorLabel')} value={a.errorMessage} small />}
                </View>
              ))}
            </>
          )}
          <Button
            label={busy === 'send' ? t('pushDebug.sending') : t('pushDebug.sendTest')}
            onPress={handleSendTest}
            icon="paper-plane-outline"
            disabled={busy !== null}
          />
        </Card>

        {/* User info */}
        {status && (
          <Card title={t('pushDebug.identityTitle')} hint={t('pushDebug.identityHint')}>
            <Row label={t('pushDebug.userId')} value={status.userId ?? '—'} small />
            <Row label={t('pushDebug.email')} value={status.email ?? '—'} small />
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border }}>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>{title}</Text>
      {hint ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Row({ label, value, valueColor, small }: { label: string; value: string; valueColor?: string; small?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.sm }}>
      <Text style={{ fontSize: small ? font.sizes.xs : font.sizes.sm, color: colors.textMuted, flexShrink: 1 }}>{label}</Text>
      <Text style={{ fontSize: small ? font.sizes.xs : font.sizes.sm, color: valueColor ?? colors.text, fontWeight: font.weights.medium, flexShrink: 1, textAlign: 'right' }} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function Button({ label, onPress, icon, disabled, variant }: { label: string; onPress: () => void; icon?: string; disabled?: boolean; variant?: 'ghost' }) {
  const isGhost = variant === 'ghost';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        marginTop: spacing.sm,
        paddingVertical: 12,
        paddingHorizontal: spacing.md,
        backgroundColor: isGhost ? 'transparent' : (disabled ? colors.border : colors.brand),
        borderRadius: radius.md,
        borderWidth: isGhost ? 1 : 0,
        borderColor: isGhost ? colors.border : 'transparent',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon ? <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={isGhost ? colors.text : '#fff'} /> : null}
      <Text style={{ color: isGhost ? colors.text : '#fff', fontWeight: font.weights.semibold, fontSize: font.sizes.sm }}>{label}</Text>
    </TouchableOpacity>
  );
}
