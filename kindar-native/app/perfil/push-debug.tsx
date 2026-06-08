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
        setError(r.error ?? 'Falha ao carregar diagnóstico');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleForceRegister() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy('register');
    setLastRegister('rodando...');
    try {
      const token = await registerForPushNotificationsAsync({ forceRequest: true });
      setLastRegister(token ? `OK · token ${token.slice(0, 12)}…${token.slice(-8)} (${token.length} chars)` : 'NULL — getDevicePushTokenAsync sem retorno');
      await load();
    } catch (e) {
      setLastRegister(`ERRO · ${e instanceof Error ? e.message : String(e)}`);
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
      else setLastSend({ ok: false, reason: r.error ?? 'Falha desconhecida' });
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
      <ScreenHeader title="Diagnóstico de push" />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, marginBottom: spacing.md }}>
          Tela técnica para validar cada camada do pipeline de notificação push. Use somente quando o time pedir.
        </Text>

        {/* Camada 1: Permission iOS */}
        <Card title="1. Permissão iOS" hint="iOS Settings → Notificações → Kindar">
          <Row label="Status" value={permission} valueColor={permColor} />
          {permission !== 'granted' ? (
            <Button label="Abrir Ajustes do iPhone" onPress={handleOpenSettings} icon="open-outline" variant="ghost" />
          ) : null}
        </Card>

        {/* Camada 2: Device token + Backend register */}
        <Card title="2. Token registrado no backend" hint="POST /api/push/register-apns">
          {loading ? <Row label="Carregando..." value="" /> : null}
          {error ? <Row label="Erro" value={error} valueColor="#DC2626" /> : null}
          {status && (
            <>
              <Row label="APNs tokens" value={String(status.counts?.apns_tokens ?? 0)} valueColor={status.counts?.apns_tokens ? '#16A34A' : '#DC2626'} />
              <Row label="FCM tokens" value={String(status.counts?.fcm_tokens ?? 0)} />
              <Row label="Web subs" value={String(status.counts?.web_subscriptions ?? 0)} />
              {status.apnsTokens?.map((tok, i) => (
                <Row key={i} label={`Token ${i + 1}`} value={`${tok.suffix} (${tok.length} chars · ${intl.formatDateTime(tok.created_at)})`} small />
              ))}
            </>
          )}
          <Row label="Último registro" value={lastRegister} small />
          <Button
            label={busy === 'register' ? 'Registrando...' : 'Forçar registro agora'}
            onPress={handleForceRegister}
            icon="refresh-outline"
            disabled={busy !== null}
          />
        </Card>

        {/* Camada 3: Server config */}
        <Card title="3. Configuração do servidor" hint="Env vars APNS no Vercel">
          {status?.serverConfig && (
            <>
              <Row label="APNS_KEY_ID" value={status.serverConfig.apns_key_id_set ? '✓ setado' : '✗ FALTANDO'} valueColor={status.serverConfig.apns_key_id_set ? '#16A34A' : '#DC2626'} />
              <Row label="APNS_TEAM_ID" value={status.serverConfig.apns_team_id_set ? '✓ setado' : '✗ FALTANDO'} valueColor={status.serverConfig.apns_team_id_set ? '#16A34A' : '#DC2626'} />
              <Row label="APNS_KEY_P8" value={status.serverConfig.apns_key_p8_set ? '✓ setado' : '✗ FALTANDO'} valueColor={status.serverConfig.apns_key_p8_set ? '#16A34A' : '#DC2626'} />
              <Row label="APNS_BUNDLE_ID" value={status.serverConfig.apns_bundle_id} small />
            </>
          )}
        </Card>

        {/* Camada 4: Apple delivery */}
        <Card title="4. Envio real pela Apple" hint="Envia push pra TODOS apns_token do user">
          {lastSend && (
            <>
              <Row label="Resultado" value={lastSend.ok ? '✓ DELIVERED' : '✗ FALHOU'} valueColor={lastSend.ok ? '#16A34A' : '#DC2626'} />
              {lastSend.reason && <Row label="Reason" value={lastSend.reason} small />}
              {lastSend.hint && <Row label="Dica" value={lastSend.hint} small />}
              {lastSend.attempts?.map((a, i) => (
                <View key={i} style={{ marginTop: spacing.xs, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Row label={`#${i + 1} ${a.tokenSuffix}`} value={a.delivered ? '✓' : '✗'} valueColor={a.delivered ? '#16A34A' : '#DC2626'} small />
                  <Row label="  status" value={String(a.status ?? '—')} small />
                  <Row label="  reason" value={a.reason ?? '—'} small />
                  {a.errorMessage && <Row label="  erro" value={a.errorMessage} small />}
                </View>
              ))}
            </>
          )}
          <Button
            label={busy === 'send' ? 'Enviando...' : 'Enviar push de teste'}
            onPress={handleSendTest}
            icon="paper-plane-outline"
            disabled={busy !== null}
          />
        </Card>

        {/* User info */}
        {status && (
          <Card title="Identidade" hint="Quem o servidor enxerga">
            <Row label="userId" value={status.userId ?? '—'} small />
            <Row label="email" value={status.email ?? '—'} small />
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
