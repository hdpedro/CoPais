/**
 * WhatsAppLinkSection — OTP-based WhatsApp account link.
 * Mirrors PWA /perfil/WhatsAppLinkSection.
 */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import {
  getWhatsAppStatus, requestWhatsAppLink, verifyWhatsAppOTP, unlinkWhatsApp,
  type WhatsAppStatus,
} from '../../services/whatsapp';
import { useToast } from '../ui/ToastProvider';
import { useI18n } from '../../i18n';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

type LinkState = 'unlinked' | 'pending' | 'linked';

export default function WhatsAppLinkSection() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [state, setState] = useState<LinkState>('unlinked');
  const [phone, setPhone] = useState<string>('');
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [loading, setLoading] = useState<'initial' | 'request' | 'verify' | 'unlink' | null>('initial');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');

  async function refresh() {
    const res = await getWhatsAppStatus();
    if ('error' in res) {
      // Silently skip — may be offline or PWA endpoint unreachable
      setLoading(null);
      return;
    }
    const wrapped = res as WhatsAppStatus;
    setState(wrapped.status);
    if (wrapped.status !== 'unlinked') setPhone(wrapped.phone || '');
    setLoading(null);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleRequest() {
    setError('');
    if (!phoneInput.trim()) { setError(t('whatsappLink.errPhoneRequired')); return; }
    setLoading('request');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await requestWhatsAppLink(phoneInput.trim());
    setLoading(null);
    if ('error' in res) {
      setError(res.error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSuccess(t('whatsappLink.codeSentShort'));
    setPhone(res.phone);
    setState('pending');
    setPhoneInput('');
    setTimeout(() => setSuccess(''), 3000);
  }

  async function handleVerify() {
    setError('');
    if (otpInput.trim().length !== 6) { setError(t('whatsappLink.errOtpLength')); return; }
    setLoading('verify');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await verifyWhatsAppOTP(otpInput.trim());
    setLoading(null);
    if ('error' in res) {
      setError(res.error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSuccess(t('whatsappLink.linkedSuccess'));
    setState('linked');
    setOtpInput('');
    setTimeout(() => setSuccess(''), 3000);
  }

  function handleUnlink() {
    Alert.alert(
      t('whatsapp.unlink'),
      t('whatsappLink.unlinkConfirm', { phone }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('whatsappLink.unlinkShort'),
          style: 'destructive',
          onPress: async () => {
            setLoading('unlink');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await unlinkWhatsApp();
            setLoading(null);
            if ('error' in res) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setState('unlinked');
            setPhone('');
          },
        },
      ]
    );
  }

  if (loading === 'initial') {
    return (
      <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm, alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
        <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
        <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
          WhatsApp
        </Text>
      </View>

      {success ? (
        <View style={{ backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md }}>
          <Text style={{ fontSize: font.sizes.sm, color: '#15803d' }}>{success}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md }}>
          <Text style={{ fontSize: font.sizes.sm, color: '#b91c1c' }}>{error}</Text>
        </View>
      ) : null}

      {state === 'linked' ? (
        <View>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: 2 }}>{t('whatsappLink.linkedNumber')}</Text>
          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.md }}>
            {phone}
          </Text>
          <TouchableOpacity
            onPress={handleUnlink}
            disabled={loading === 'unlink'}
            style={{
              alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
              borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
              opacity: loading === 'unlink' ? 0.5 : 1,
            }}
          >
            {loading === 'unlink'
              ? <ActivityIndicator size="small" color={colors.error} />
              : <Text style={{ fontSize: font.sizes.sm, color: colors.error, fontWeight: font.weights.medium }}>{t('whatsappLink.unlinkShort')}</Text>}
          </TouchableOpacity>
        </View>
      ) : state === 'pending' ? (
        <View>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: 2 }}>{t('whatsapp.codeSentTo')}</Text>
          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.md }}>
            {phone}
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 6 }}>{t('whatsappLink.otpHint')}</Text>
          <TextInput
            value={otpInput}
            onChangeText={v => setOtpInput(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            style={{
              backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
              paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
              fontSize: font.sizes.lg, color: colors.text, letterSpacing: 4,
              marginBottom: spacing.sm, textAlign: 'center',
            }}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity
              onPress={() => { setState('unlinked'); setOtpInput(''); setError(''); }}
              style={{
                flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, fontWeight: font.weights.medium }}>
                {t('whatsappLink.changeNumber')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleVerify}
              disabled={loading === 'verify' || otpInput.length !== 6}
              style={{
                flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                backgroundColor: '#25D366', alignItems: 'center',
                opacity: loading === 'verify' || otpInput.length !== 6 ? 0.5 : 1,
              }}
            >
              {loading === 'verify'
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>{t('whatsapp.verify')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
            {t('whatsappLink.intro')}
          </Text>
          <TextInput
            value={phoneInput}
            onChangeText={setPhoneInput}
            placeholder="+55 11 99999-9999"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            style={{
              backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
              paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
              fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm,
            }}
          />
          <TouchableOpacity
            onPress={handleRequest}
            disabled={loading === 'request' || !phoneInput.trim()}
            style={{
              paddingVertical: spacing.md, borderRadius: radius.md,
              backgroundColor: '#25D366', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
              opacity: loading === 'request' || !phoneInput.trim() ? 0.5 : 1,
            }}
          >
            {loading === 'request' ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                  {t('whatsappLink.sendCode')}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
