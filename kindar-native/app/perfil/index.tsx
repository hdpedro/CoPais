import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform, Linking } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import { safeWrite } from 'src/services/offline';
import { useI18n } from 'src/i18n';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import WhatsAppLinkSection from 'src/components/profile/WhatsAppLinkSection';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';
const PRIVACY_URL = `${WEB_URL}/privacidade`;
const TERMS_URL = `${WEB_URL}/termos`;
const SUPPORT_URL = `${WEB_URL}/suporte`;

/**
 * Allowlist de emails que veem o link "Diagnóstico de push" no Perfil.
 * Outros users não veem (mas a tela /perfil/push-debug continua acessível
 * via deep link pra suporte remoto). Adicionar novos devs aqui — comparação
 * é lowercase. Histórico: criado 2026-05-26 após 8 bugs em série de push
 * iOS serem finalmente resolvidos; tela debug ficou utilssima e precisa
 * continuar disponível pra dev mas escondida do usuário final.
 */
const DEV_EMAIL_ALLOWLIST = [
  'henrique.de.pedro@gmail.com',
  'henrique.pedros@hotmail.com',
  // Adicionado 2026-06-07: Angelino é maior user, reporta não receber push
  // iOS apesar de backend enviar (13 notifs/7d). Precisa do Diagnóstico
  // pra disparar push de teste e ver resposta APNs raw da Apple.
  'angelino.barata@gmail.com',
];

export default function PerfilScreen() {
  const { userId, profile, activeGroup } = useAuth();
  const { locale, setLocale, t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!userId || !fullName.trim()) return;
    setSaving(true);
    const result = await safeWrite({
      table: 'profiles', operation: 'update',
      payload: {
        id: userId,
        full_name: fullName.trim(),
        display_name: displayName.trim() || null,
        phone: phone.trim() || null,
      },
    });
    if (result.success) useAuth.getState().loadProfile();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditing(false);
    setSaving(false);
  }

  async function handleSignOut() {
    if (Platform.OS === 'web') {
      await useAuth.getState().signOut();
      router.replace('/login');
      return;
    }

    Alert.alert(t('auth.logout'), t('profileScreen.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('auth.logout'), style: 'destructive', onPress: async () => {
        await useAuth.getState().signOut();
        router.replace('/login');
      }},
    ]);
  }

  const LANGUAGES = [
    { code: 'pt', label: 'Português' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('profile.title')} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 28, color: '#fff', fontWeight: font.weights.bold }}>
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            {profile?.full_name || t('profileScreen.defaultUserName')}
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>{profile?.email}</Text>
          {activeGroup ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>{activeGroup.groupName}</Text> : null}
        </View>

        {/* Profile edit */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('profileScreen.personalData')}
            </Text>
            <TouchableOpacity
              testID={editing ? 'perfil-save' : 'perfil-edit'}
              accessibilityRole="button"
              accessibilityLabel={editing ? t('common.save') : t('profile.editProfile')}
              hitSlop={8}
              onPress={() => {
              if (editing) { handleSave(); } else {
                setFullName(profile?.full_name || '');
                setDisplayName(profile?.display_name || '');
                setPhone(profile?.phone || '');
                setEditing(true);
              }
            }}>
              {editing ? (
                saving ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={{ color: colors.brand, fontWeight: font.weights.bold, fontSize: font.sizes.sm }}>{t('common.save')}</Text>
              ) : (
                <Ionicons name="create-outline" size={18} color={colors.brand} />
              )}
            </TouchableOpacity>
          </View>

          {editing ? (
            <View style={{ gap: spacing.sm }}>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>{t('profile.fullName')}</Text>
                <TextInput value={fullName} onChangeText={setFullName}
                  style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
              </View>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>{t('profileScreen.nicknameFieldLabel')}</Text>
                <TextInput value={displayName} onChangeText={setDisplayName} placeholder={t('profileScreen.nicknamePlaceholder')}
                  placeholderTextColor={colors.textDim}
                  style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
              </View>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>{t('profile.phone')}</Text>
                <TextInput value={phone} onChangeText={setPhone} placeholder={t('profileScreen.phonePlaceholder')}
                  placeholderTextColor={colors.textDim} keyboardType="phone-pad"
                  style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{t('profileScreen.nameLabel')}</Text>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile?.full_name || '-'}</Text>
              </View>
              {profile?.display_name ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{t('profileScreen.nicknameLabel')}</Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile.display_name}</Text>
                </View>
              ) : null}
              {profile?.phone ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{t('profile.phone')}</Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile.phone}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{t('auth.email')}</Text>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile?.email || '-'}</Text>
              </View>
            </View>
          )}
        </View>

        {/* WhatsApp link */}
        <WhatsAppLinkSection />

        {/* Language */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm }}>
          <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
            {t('profile.language')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity key={lang.code} onPress={() => setLocale(lang.code)}
                testID={`perfil-locale-${lang.code}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: locale === lang.code }}
                accessibilityLabel={lang.label}
                style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full,
                  backgroundColor: locale === lang.code ? colors.brand : colors.bgSurface }}>
                <Text style={{ fontSize: font.sizes.sm, color: locale === lang.code ? '#fff' : colors.text, fontWeight: font.weights.medium }}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Seguranca (Face ID / Touch ID) — padrao WhatsApp/apps bancarios.
            Protege o app inteiro com biometria do dispositivo. */}
        <TouchableOpacity onPress={() => router.push('/perfil/seguranca')}
          testID="perfil-seguranca"
          accessibilityRole="button"
          accessibilityLabel={t('profileScreen.securityA11y')}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.md, color: colors.text }}>{t('profile.security')}</Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
              {t('profileScreen.securitySubtitle')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>

        {/* Notificações — Fase C controle granular */}
        <TouchableOpacity onPress={() => router.push('/perfil/notificacoes')}
          testID="perfil-notificacoes"
          accessibilityRole="button"
          accessibilityLabel={t('notifPrefs.title')}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="notifications-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.md, color: colors.text }}>{t('notifPrefs.title')}</Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
              {t('notifPrefs.subtitle')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>

        {/* Diagnóstico de push — tela técnica pra debug do pipeline APNs.
            Tela em si permanece acessível via deep link kindar://perfil/push-debug
            (útil pra suporte remoto), mas link só renderiza pra emails da
            allowlist DEV pra não confundir usuário real. Resultado de 6h de
            debug em 2026-05-26 que finalmente fez push iOS funcionar — vide
            project_kindar_push_ios_history.md. */}
        {DEV_EMAIL_ALLOWLIST.includes((profile?.email ?? '').toLowerCase()) && (
          <TouchableOpacity onPress={() => router.push('/perfil/push-debug')}
            testID="perfil-push-debug"
            accessibilityRole="button"
            accessibilityLabel={t('profileScreen.pushDebug')}
            style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm,
              flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: '#F59E0B' }}>
            <Ionicons name="bug-outline" size={20} color="#F59E0B" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, color: colors.text }}>{t('profileScreen.pushDebug')}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                {t('profileScreen.pushDebugSubtitle')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        )}

        {/* Subscription */}
        <TouchableOpacity onPress={() => router.push('/pricing')}
          accessibilityRole="button"
          accessibilityLabel={t('subscription.headerTitle')}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="diamond-outline" size={20} color={colors.accent} />
          <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>{t('subscription.headerTitle')}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>

        {/* Legal + Suporte — links exigidos por Apple Guideline 5.1.1
            (privacidade acessivel in-app) + pre-requisito ASC (Support URL) */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, marginBottom: spacing.lg, ...shadows.sm, overflow: 'hidden' }}>
          <TouchableOpacity
            onPress={() => Linking.openURL(PRIVACY_URL)}
            testID="perfil-privacy"
            accessibilityRole="link"
            accessibilityLabel={t('profileScreen.privacyPolicy')}
            style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} />
            <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>{t('profileScreen.privacyPolicy')}</Text>
            <Ionicons name="open-outline" size={16} color={colors.textDim} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL(TERMS_URL)}
            testID="perfil-terms"
            accessibilityRole="link"
            accessibilityLabel={t('profileScreen.termsOfUse')}
            style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} />
            <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>{t('profileScreen.termsOfUse')}</Text>
            <Ionicons name="open-outline" size={16} color={colors.textDim} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => Linking.openURL(SUPPORT_URL)}
            testID="perfil-support"
            accessibilityRole="link"
            accessibilityLabel={t('profileScreen.support')}
            style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}
          >
            <Ionicons name="help-circle-outline" size={20} color={colors.textSecondary} />
            <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>{t('profileScreen.support')}</Text>
            <Ionicons name="open-outline" size={16} color={colors.textDim} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/perfil/deletar-conta')}
            testID="perfil-delete-account"
            accessibilityRole="button"
            accessibilityLabel={t('profileScreen.deleteAccount')}
            style={{ padding: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={{ fontSize: font.sizes.md, color: colors.error, flex: 1 }}>{t('profileScreen.deleteAccount')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        </View>

        {/* Sign out */}
        <TouchableOpacity onPress={handleSignOut}
          testID="perfil-signout"
          accessibilityRole="button"
          accessibilityLabel={t('auth.logout')}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.sm,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={{ fontSize: font.sizes.md, color: colors.error }}>{t('auth.logout')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
