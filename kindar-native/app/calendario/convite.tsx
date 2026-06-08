/**
 * Parser de Convite — foto de convite → AI extrai dados → cria evento.
 * Mirrors PWA /calendario/convite (InviteParserClient).
 */
/* eslint-disable jsx-a11y/alt-text */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createEvent } from 'src/services/events';
import { fetchChildren, type Child } from 'src/services/children';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ParsedEvent {
  title: string | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

type Step = 'upload' | 'processing' | 'preview';

function displayDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseDateFromInput(display: string): string | null {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export default function InviteParserScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [children, setChildren] = useState<Child[]>([]);
  const [step, setStep] = useState<Step>('upload');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedEvent | null>(null);
  const [title, setTitle] = useState('');
  const [dateDisplay, setDateDisplay] = useState('');
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [childId, setChildId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeGroup) fetchChildren(activeGroup.groupId).then(setChildren);
  }, [activeGroup]);

  function fillFromParsed(p: ParsedEvent) {
    setTitle(p.title || '');
    setDateDisplay(p.date ? displayDate(p.date) : '');
    setStartTime(p.start_time || '');
    setLocation(p.location || '');
    setNotes(p.notes || '');
  }

  const pickImage = useCallback(async (mode: 'camera' | 'library') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = mode === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show({ message: mode === 'camera' ? t('toasts.permissions.cameraDenied') : t('toasts.permissions.photosDenied'), variant: 'info' });
      return;
    }
    const result = mode === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });

    if (result.canceled || !result.assets || !result.assets[0]) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setStep('processing');
    setError(null);

    // Upload to PWA for AI parsing
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      const base64 = asset.base64;
      if (!base64) throw new Error(t('calendarInvite.errorNoImage'));

      const resp = await fetch(`${WEB_URL}/api/ai/parse-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image: `data:image/jpeg;base64,${base64}`,
        }),
      });

      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await resp.json().catch(() => null);
          throw new Error((j && j.error) || t('calendarInvite.errorStatus', { status: resp.status }));
        }
        throw new Error(t('calendarInvite.errorProcessing', { status: resp.status }));
      }
      const data = await resp.json();

      const parsedData: ParsedEvent = {
        title: data.title || null,
        date: data.date || null,
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        location: data.location || null,
        notes: data.notes || null,
      };
      setParsed(parsedData);
      fillFromParsed(parsedData);
      setStep('preview');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || t('calendarInvite.errorImageGeneric'));
      setStep('upload');
      setImageUri(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [t, toast]);

  async function handleSave() {
    if (!activeGroup || !userId) return;
    if (!title.trim()) { setError(t('calendarInvite.errorTitleRequired')); return; }
    const iso = parseDateFromInput(dateDisplay);
    if (!iso) { setError(t('calendarInvite.errorDateInvalid')); return; }

    setError(null);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createEvent({
      groupId: activeGroup.groupId,
      title,
      eventDate: iso,
      eventTime: startTime || undefined,
      endDate: iso,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      childId: childId || undefined,
      createdBy: userId,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  function handleRetry() {
    setStep('upload');
    setImageUri(null);
    setParsed(null);
    setError(null);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('calendarInvite.headerTitle')}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {step === 'upload' ? (
          <>
            <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'], marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 56, marginBottom: spacing.md }}>📸</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
                {t('calendarInvite.uploadTitle')}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 280 }}>
                {t('calendarInvite.uploadHint')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => pickImage('camera')}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.md + 2, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                {t('health.prescription.takePhoto')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => pickImage('library')}
              activeOpacity={0.85}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md,
                borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md + 2, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
              }}
            >
              <Ionicons name="images-outline" size={20} color={colors.text} />
              <Text style={{ color: colors.text, fontSize: font.sizes.md, fontWeight: font.weights.medium }}>
                {t('health.prescription.pickFromGallery')}
              </Text>
            </TouchableOpacity>
          </>
        ) : null}

        {step === 'processing' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} accessibilityLabel={t('calendarInvite.previewA11y')} style={{ width: 200, height: 200, borderRadius: radius.lg, marginBottom: spacing.lg }} resizeMode="cover" />
            ) : null}
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, marginTop: spacing.md }}>
              {t('inviteParser.processing')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
              {t('calendarInvite.processingHint')}
            </Text>
          </View>
        ) : null}

        {step === 'preview' && parsed ? (
          <>
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg, ...shadows.sm, marginBottom: spacing.lg }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.success, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                ✓ {t('calendarInvite.readBadge')}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {t('calendarInvite.reviewHint')}
              </Text>
            </View>

            {imageUri ? (
              <Image source={{ uri: imageUri }} accessibilityLabel={t('calendarInvite.previewA11y')} style={{ width: '100%', height: 180, borderRadius: radius.md, marginBottom: spacing.lg }} resizeMode="cover" />
            ) : null}

            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('calendarInvite.fieldTitleRequired')}</Text>
            <TextInput
              value={title} onChangeText={setTitle}
              placeholder={t('calendarInvite.titlePlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
              }}
            />

            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('calendarInvite.fieldDateRequired')}</Text>
                <TextInput
                  value={dateDisplay} onChangeText={setDateDisplay}
                  placeholder={t('calendarInvite.datePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad" maxLength={10}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: font.sizes.md, color: colors.text,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('calendarInvite.fieldTime')}</Text>
                <TextInput
                  value={startTime} onChangeText={setStartTime}
                  placeholder={t('calendarInvite.timePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  maxLength={5}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: font.sizes.md, color: colors.text,
                  }}
                />
              </View>
            </View>

            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('newForm.location')}</Text>
            <TextInput
              value={location} onChangeText={setLocation}
              placeholder={t('calendarInvite.locationPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md,
              }}
            />

            {children.length > 0 ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>{t('newForm.child')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
                  <TouchableOpacity
                    onPress={() => setChildId(null)}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                      backgroundColor: childId === null ? colors.brand : colors.bgElevated,
                      borderWidth: 1, borderColor: childId === null ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: childId === null ? '#fff' : colors.text }}>{t('newForm.allChildren')}</Text>
                  </TouchableOpacity>
                  {children.map(c => {
                    const active = childId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setChildId(c.id)}
                        style={{
                          paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                          backgroundColor: active ? colors.brand : colors.bgElevated,
                          borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                        }}
                      >
                        <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text }}>
                          {c.full_name.split(' ')[0]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('newForm.notes')}</Text>
            <TextInput
              value={notes} onChangeText={setNotes}
              placeholder={t('calendarInvite.notesPlaceholder')}
              placeholderTextColor={colors.textMuted}
              multiline
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg, fontSize: font.sizes.md, color: colors.text,
                minHeight: 80, textAlignVertical: 'top', marginBottom: spacing['2xl'],
              }}
            />

            <View style={{ marginBottom: spacing.sm }}>
              <PrimaryButton
                label={t('calendarInvite.createEvent')}
                onPress={handleSave}
                loading={saving}
                disabled={!title.trim()}
                testID="convite-save-button"
              />
            </View>
            <TouchableOpacity onPress={handleRetry} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>{t('vaccineCard.tryAnotherPhoto')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
