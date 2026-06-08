/**
 * Aceitar Convite — tela de aceite via deep link kindar://convite/{token}.
 * Mirrors PWA /convite/[token].
 */
import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { acceptInvitation } from 'src/services/invitations';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

export default function AceitarConviteScreen() {
  const t = useI18n(s => s.t);
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { userId, loadActiveGroup } = useAuth();
  const [loading, setLoading] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>('');

  useEffect(() => {
    // Mirror PWA `convite/[token]/page.tsx`: unauth users go to SIGNUP
    // (not login). Most invite recipients don't have an account yet.
    // The signup page reads `convite` and routes back here after creating
    // the account. Existing users can still tap "Já tenho conta → Entrar"
    // on the signup screen.
    if (!userId && token) {
      router.replace({ pathname: '/auth/signup', params: { convite: token } } as never);
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
      setError(res.error || t('inviteAccept.errAccept'));
    }
  }

  function handleDecline() {
    Alert.alert(
      t('inviteAccept.declineTitle'),
      t('inviteAccept.declineConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('inviteAccept.decline'),
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
          {t('inviteAccept.invalidLink')}
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
              {t('inviteAccept.welcome')}
            </Text>
            {groupName ? (
              <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center' }}>
                {t('inviteAccept.nowPartOf', { groupName })}
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
              {t('inviteAccept.gotInvite')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 20 }}>
              {t('inviteAccept.description')}
            </Text>

            {error ? (
              <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg, width: '100%' }}>
                <Text style={{ color: colors.error, fontSize: font.sizes.sm, textAlign: 'center' }}>{error}</Text>
              </View>
            ) : null}

            <View style={{ width: '100%', marginBottom: spacing.sm }}>
              <PrimaryButton
                label={t('inviteAccept.acceptAndEnter')}
                onPress={handleAccept}
                loading={loading}
                disabled={!userId}
                testID="convite-accept"
              />
            </View>

            <TouchableOpacity onPress={handleDecline} style={{ paddingVertical: spacing.sm }} accessibilityRole="button" accessibilityLabel={t('inviteAccept.notNow')}>
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>
                {t('inviteAccept.notNow')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
