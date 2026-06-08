/**
 * Deletar Conta — Apple Guideline 5.1.1(v).
 *
 * Fluxo em 2 etapas:
 *   1. Tela de aviso listando o que sera apagado + aviso sobre Apple IAP
 *   2. Input exigindo que o usuario digite DELETAR (case-sensitive) +
 *      checkbox de consentimento
 *
 * Chama POST /api/auth/delete-account com Bearer token — o endpoint cancela
 * subscriptions Stripe, deleta de auth.users (cascata pra profiles + tudo),
 * entao o native faz signOut e redireciona pra /login.
 */

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from 'src/lib/supabase';
import { useAuth } from 'src/store/auth';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const CONFIRM_WORD = 'DELETAR';

const WHAT_GETS_DELETED_KEYS = [
  'deleteAccount.item1',
  'deleteAccount.item2',
  'deleteAccount.item3',
  'deleteAccount.item4',
  'deleteAccount.item5',
  'deleteAccount.item6',
  'deleteAccount.item7',
  'deleteAccount.item8',
];

export default function DeletarContaScreen() {
  const insets = useSafeAreaInsets();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [confirmText, setConfirmText] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = confirmText === CONFIRM_WORD && acknowledged && !submitting;

  async function handleDelete() {
    if (!canSubmit) return;

    Alert.alert(
      t('deleteAccount.confirmAlertTitle'),
      t('deleteAccount.confirmAlertMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('deleteAccount.confirmAlertConfirm'),
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  }

  async function confirmDelete() {
    setSubmitting(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        toast.show({ message: t('toasts.common.sessionExpired'), variant: 'error' });
        setSubmitting(false);
        return;
      }

      const res = await fetch(`${WEB_URL}/api/auth/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmation: CONFIRM_WORD }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || t('profile.deleteAccount.errorHttp', { status: res.status }));
      }

      // Sucesso: limpa sessao local e vai pro login
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAuth.getState().signOut();
      Alert.alert(
        t('deleteAccount.successTitle'),
        t('deleteAccount.successMessage'),
        [{ text: t('deleteAccount.successOk'), onPress: () => router.replace('/auth/login') }]
      );
    } catch (err: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = (err as { message?: string })?.message || t('toasts.common.fallbackError');
      toast.show({ message: msg, variant: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
          {t('deleteAccount.headerTitle')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Warning icon + headline */}
        <View style={{ alignItems: 'center', marginBottom: spacing.xl }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: 'rgba(229,57,53,0.12)',
            alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
          }}>
            <Ionicons name="warning-outline" size={32} color={colors.error} />
          </View>
          <Text style={{
            fontSize: font.sizes.xl, fontWeight: font.weights.bold,
            color: colors.text, textAlign: 'center', marginBottom: spacing.sm,
          }}>
            {t('deleteAccount.headline')}
          </Text>
          <Text style={{
            fontSize: font.sizes.sm, color: colors.textSecondary,
            textAlign: 'center', lineHeight: 20,
          }}>
            {t('deleteAccount.exportHint')}
          </Text>
        </View>

        {/* What gets deleted */}
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.lg,
          padding: spacing.lg, marginBottom: spacing.lg,
        }}>
          <Text style={{
            fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
            color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1,
            marginBottom: spacing.md,
          }}>
            {t('deleteAccount.whatWillBeDeleted')}
          </Text>
          {WHAT_GETS_DELETED_KEYS.map((key) => (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs }}>
              <Ionicons name="close-circle" size={16} color={colors.error} style={{ marginTop: 2 }} />
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1, lineHeight: 20 }}>
                {t(key)}
              </Text>
            </View>
          ))}
        </View>

        {/* Apple subscription warning */}
        {Platform.OS === 'ios' ? (
          <View style={{
            backgroundColor: 'rgba(59,130,246,0.06)',
            borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg,
            borderWidth: 1, borderColor: 'rgba(59,130,246,0.18)',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
              <Ionicons name="information-circle-outline" size={18} color="#3B82F6" style={{ marginTop: 1 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 4 }}>
                  {t('deleteAccount.appleSubTitle')}
                </Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, lineHeight: 18 }}>
                  {t('deleteAccount.appleSubBody')}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Typed confirmation */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.sm }}>
          {t('deleteAccount.typeToConfirm', { word: CONFIRM_WORD })}
        </Text>
        <TextInput
          value={confirmText}
          onChangeText={setConfirmText}
          placeholder={CONFIRM_WORD}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!submitting}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md,
            borderWidth: 1, borderColor: confirmText === CONFIRM_WORD ? colors.error : colors.borderLight,
            paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
            letterSpacing: 2,
          }}
        />

        {/* Acknowledgement checkbox */}
        <TouchableOpacity
          onPress={() => setAcknowledged(!acknowledged)}
          activeOpacity={0.7}
          disabled={submitting}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          accessibilityLabel={t('deleteAccount.acknowledge')}
          style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xl }}
        >
          <View style={{
            width: 18, height: 18, borderRadius: 4, marginTop: 2,
            borderWidth: 1.5,
            borderColor: acknowledged ? colors.error : colors.border,
            backgroundColor: acknowledged ? colors.error : 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {acknowledged ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
          </View>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, flex: 1, lineHeight: 18 }}>
            {t('deleteAccount.acknowledge')}
          </Text>
        </TouchableOpacity>

        {/* Delete button */}
        <PrimaryButton
          label={t('profile.deleteAccount.deletePermanent')}
          onPress={handleDelete}
          loading={submitting}
          disabled={!(confirmText === CONFIRM_WORD && acknowledged)}
          variant="destructive"
          testID="deletar-conta-submit"
        />

        {/* Cancel */}
        <TouchableOpacity
          onPress={() => router.back()}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel={t('deleteAccount.cancelAndBack')}
          style={{ alignItems: 'center', paddingVertical: spacing.lg, marginTop: spacing.sm }}
        >
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
            {t('deleteAccount.cancelAndBack')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
