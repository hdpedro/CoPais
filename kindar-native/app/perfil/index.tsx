import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/store/auth';
import { safeWrite } from '../../src/services/offline';
import { useI18n } from '../../src/i18n';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import WhatsAppLinkSection from '../../src/components/profile/WhatsAppLinkSection';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

export default function PerfilScreen() {
  const { userId, profile, activeGroup } = useAuth();
  const { locale, setLocale } = useI18n();
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

    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: async () => {
        await useAuth.getState().signOut();
        router.replace('/login');
      }},
    ]);
  }

  const LANGUAGES = [
    { code: 'pt', label: 'Portugues' },
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Espanol' },
    { code: 'fr', label: 'Francais' },
    { code: 'de', label: 'Deutsch' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Perfil" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        {/* Avatar */}
        <View style={{ alignItems: 'center', marginBottom: spacing['2xl'] }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: 28, color: '#fff', fontWeight: font.weights.bold }}>
              {(profile?.full_name || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            {profile?.full_name || 'Usuario'}
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>{profile?.email}</Text>
          {activeGroup ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>{activeGroup.groupName}</Text> : null}
        </View>

        {/* Profile edit */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
              Dados Pessoais
            </Text>
            <TouchableOpacity onPress={() => {
              if (editing) { handleSave(); } else {
                setFullName(profile?.full_name || '');
                setDisplayName(profile?.display_name || '');
                setPhone(profile?.phone || '');
                setEditing(true);
              }
            }}>
              {editing ? (
                saving ? <ActivityIndicator color={colors.brand} size="small" /> : <Text style={{ color: colors.brand, fontWeight: font.weights.bold, fontSize: font.sizes.sm }}>Salvar</Text>
              ) : (
                <Ionicons name="create-outline" size={18} color={colors.brand} />
              )}
            </TouchableOpacity>
          </View>

          {editing ? (
            <View style={{ gap: spacing.sm }}>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>Nome completo</Text>
                <TextInput value={fullName} onChangeText={setFullName}
                  style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
              </View>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>Apelido (como aparece para outros)</Text>
                <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Ex: Ana"
                  placeholderTextColor={colors.textDim}
                  style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
              </View>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>Telefone</Text>
                <TextInput value={phone} onChangeText={setPhone} placeholder="(11) 99999-9999"
                  placeholderTextColor={colors.textDim} keyboardType="phone-pad"
                  style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
              </View>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Nome</Text>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile?.full_name || '-'}</Text>
              </View>
              {profile?.display_name ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Apelido</Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile.display_name}</Text>
                </View>
              ) : null}
              {profile?.phone ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Telefone</Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{profile.phone}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Email</Text>
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
            Idioma
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {LANGUAGES.map(lang => (
              <TouchableOpacity key={lang.code} onPress={() => setLocale(lang.code)}
                style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full,
                  backgroundColor: locale === lang.code ? colors.brand : colors.bgSurface }}>
                <Text style={{ fontSize: font.sizes.sm, color: locale === lang.code ? '#fff' : colors.text, fontWeight: font.weights.medium }}>
                  {lang.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Subscription */}
        <TouchableOpacity onPress={() => router.push('/pricing')}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.sm,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="diamond-outline" size={20} color={colors.accent} />
          <Text style={{ fontSize: font.sizes.md, color: colors.text, flex: 1 }}>Assinatura</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
        </TouchableOpacity>

        {/* Sign out */}
        <TouchableOpacity onPress={handleSignOut}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.sm,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={{ fontSize: font.sizes.md, color: colors.error }}>Sair</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
