/**
 * Aceitar Convite — tela de aceite via deep link kindar://convite/{token}.
 * Mirrors PWA /convite/[token].
 */
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/store/auth';
import { acceptInvitation } from '../../src/services/invitations';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

export default function AceitarConviteScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { userId, loadActiveGroup } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>('');

  useEffect(() => {
    // If not logged in, send to login with convite param (login redirects back)
    if (!userId && token) {
      router.replace({ pathname: '/auth/login', params: { convite: token } } as never);
    }
  }, [userId, token]);

  async function handleAccept() {
    if (!token || !userId) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await acceptInvitation(token, userId);
    setLoading(false);

    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGroupName(res.groupName || '');
      setAccepted(true);
      // Refresh auth state so new group becomes active
      await loadActiveGroup?.();
      setTimeout(() => router.replace('/(tabs)'), 1500);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError(res.error || 'Nao foi possivel aceitar o convite');
    }
  }

  function handleDecline() {
    Alert.alert(
      'Recusar convite',
      'Voce pode aceitar depois se receber o link novamente. Recusar agora?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(tabs)');
          },
        },
      ]
    );
  }

  if (!token) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, textAlign: 'center' }}>
          Link invalido
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing.xl }}>
        {accepted ? (
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 40 }}>🎉</Text>
            </View>
            <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
              Bem-vindo(a)!
            </Text>
            {groupName ? (
              <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center' }}>
                Voce agora faz parte de {groupName}
              </Text>
            ) : null}
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
          </View>
        ) : (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md, alignItems: 'center' }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${colors.brand}15`, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 36 }}>📨</Text>
            </View>

            <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.sm }}>
              Voce recebeu um convite!
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 }}>
              Um responsavel te convidou pra compartilhar um grupo no Kindar. Aceitando, voce tera acesso ao calendario, decisoes, despesas e saude das criancas.
            </Text>

            {error ? (
              <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg, width: '100%' }}>
                <Text style={{ color: colors.error, fontSize: font.sizes.sm, textAlign: 'center' }}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              disabled={loading || !userId}
              onPress={handleAccept}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.md + 2, paddingHorizontal: spacing['2xl'],
                alignItems: 'center', width: '100%',
                opacity: loading || !userId ? 0.5 : 1, marginBottom: spacing.sm,
              }}
            >
              {loading ? <ActivityIndicator color="#fff" /> : (
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  Aceitar e entrar
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={handleDecline} style={{ paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>
                Agora nao
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
