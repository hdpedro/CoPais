/**
 * OCR de Receita — foto da prescrição → AI extrai medicamentos → cria active_medications.
 * Mirrors PWA /saude/receita.
 */
/* eslint-disable jsx-a11y/alt-text */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Image, KeyboardAvoidingView, Platform, TextInput, Switch,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { fetchChildren, type Child } from 'src/services/children';
import ChildPicker from 'src/components/ui/ChildPicker';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ParsedMedication {
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  notes: string | null;
  include: boolean;
}

// Server response from /api/ai/parse-prescription (subset of fields native uses)
interface InferenceResponse {
  id: string;
  prescription_data?: { doctor_name?: string; crm?: string };
  medications_parsed?: Array<{
    name?: string; dosage?: string; frequency?: string;
    duration?: string; notes?: string;
  }>;
}

type Step = 'upload' | 'confirm' | 'processing' | 'preview';

export default function ReceitaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [medications, setMedications] = useState<ParsedMedication[]>([]);
  const [doctorName, setDoctorName] = useState('');
  const [crm, setCrm] = useState('');
  const [inferenceId, setInferenceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeGroup) {
      fetchChildren(activeGroup.groupId).then(list => {
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      });
    }
  }, [activeGroup]);

  // Asset capturado mas ainda não enviado pro OCR — usado no step="confirm".
  const [pendingAsset, setPendingAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);

  const pickImage = useCallback(async (mode: 'camera' | 'library') => {
    if (!selectedChildId) { toast.show({ message: t('toasts.validation.fillRequired'), variant: 'info' }); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const perm = mode === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show({ message: mode === 'camera' ? t('toasts.permissions.cameraDenied') : t('toasts.permissions.photosDenied'), variant: 'info' });
      return;
    }
    const result = mode === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });

    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    // Em vez de processar direto: vai pro step="confirm" pra usuário revisar
    // a foto antes de gastar tempo + cota de OCR.
    setImageUri(asset.uri);
    setPendingAsset(asset);
    setStep('confirm');
    setError(null);
  }, [selectedChildId, t, toast]);

  /**
   * Confirma processamento da foto capturada. Disparado pelo botão "Processar"
   * no step="confirm".
   */
  const processConfirmedImage = useCallback(async () => {
    if (!pendingAsset || !selectedChildId) return;
    const asset = pendingAsset;
    setStep('processing');
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      // Build multipart body. React Native FormData accepts the special
      // `{uri, name, type}` shape — fetch then sets the correct
      // multipart/form-data Content-Type with boundary automatically.
      const fileMime = asset.mimeType || 'image/jpeg';
      const fileName = asset.fileName || `prescription-${Date.now()}.jpg`;
      const form = new FormData();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      form.append('file', { uri: asset.uri, name: fileName, type: fileMime } as any);
      form.append('childId', selectedChildId!);

      const resp = await fetch(`${WEB_URL}/api/ai/parse-prescription`, {
        method: 'POST',
        headers: {
          // Do NOT set Content-Type manually — fetch must inject the
          // multipart boundary itself.
          Authorization: `Bearer ${session.access_token}`,
        },
        body: form,
      });

      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await resp.json().catch(() => null);
          throw new Error((j && j.error) || t('prescriptionScreen.errorProcessPhoto', { status: resp.status }));
        }
        throw new Error(t('prescriptionScreen.errorProcessPhoto', { status: resp.status }));
      }
      const data = await resp.json();

      // Response shape (from src/app/api/ai/parse-prescription/route.ts):
      //   { success: true, inference: { id, medications_parsed: [...],
      //                                  prescription_data: { doctor_name, crm },
      //                                  alerts, clinical_inferences, ... } }
      const inference: InferenceResponse = data?.inference ?? {};
      const meds: ParsedMedication[] = (inference.medications_parsed || []).map(m => ({
        name: m.name || '',
        dosage: m.dosage || null,
        frequency: m.frequency || null,
        duration: m.duration || null,
        notes: m.notes || null,
        include: true,
      }));

      if (meds.length === 0) {
        throw new Error(t('prescriptionScreen.errorNoMeds'));
      }

      setMedications(meds);
      setDoctorName(inference.prescription_data?.doctor_name || '');
      setCrm(inference.prescription_data?.crm || '');
      setInferenceId(inference.id || null);
      setStep('preview');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setError(err.message || t('health.prescription.errorParse'));
      setStep('upload');
      setImageUri(null);
      setPendingAsset(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [pendingAsset, selectedChildId, t]);

  /** Cancela o asset capturado e volta pro step upload (refotografar). */
  const retakePhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageUri(null);
    setPendingAsset(null);
    setStep('upload');
    setError(null);
  }, []);

  async function handleSave() {
    if (!activeGroup || !selectedChildId || !inferenceId) {
      toast.show({ message: t('toasts.common.fallbackError'), variant: 'error' });
      return;
    }
    // Pick which parsed medications the user marked to save.
    const selectedIndices = medications
      .map((m, i) => (m.include && m.name.trim() ? i : -1))
      .filter(i => i >= 0);
    if (selectedIndices.length === 0) {
      toast.show({ message: t('toasts.validation.fillRequired'), variant: 'info' });
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('common.sessionExpired'));

      const resp = await fetch(`${WEB_URL}/api/health/save-prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          inferenceId,
          groupId: activeGroup.groupId,
          childId: selectedChildId,
          selectedIndices,
          // Native flow goes light — no automatic episode creation by default.
          createEpisode: false,
        }),
      });
      if (!resp.ok) {
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('application/json')) {
          const j = await resp.json().catch(() => null);
          throw new Error((j && j.error) || t('prescriptionScreen.errorSaveStatus', { status: resp.status }));
        }
        throw new Error(t('prescriptionScreen.errorSaveStatus', { status: resp.status }));
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: unknown) {
      const err = e as { message?: string };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: err.message || t('toasts.common.saveFailed'), variant: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function updateMed(idx: number, field: keyof ParsedMedication, value: string | boolean) {
    setMedications(prev => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }

  function handleRetry() {
    setStep('upload');
    setImageUri(null);
    setMedications([]);
    setError(null);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('prescriptionScreen.headerTitle')}
        </Text>
      </View>

      <ChildPicker
        items={children}
        selectedId={selectedChildId}
        onSelect={(id) => setSelectedChildId(id)}
        disabled={step === 'processing'}
        containerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        testID="receita-child-picker"
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {step === 'upload' ? (
          <>
            <View style={{ alignItems: 'center', paddingVertical: spacing['2xl'], marginBottom: spacing.lg }}>
              <Text style={{ fontSize: 56, marginBottom: spacing.md }}>💊</Text>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm, textAlign: 'center' }}>
                {t('prescriptionScreen.uploadTitle')}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', maxWidth: 300, lineHeight: 20 }}>
                {t('prescriptionScreen.uploadSubtitle')}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => pickImage('camera')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('health.prescription.takePhoto')}
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.md + 2, alignItems: 'center',
                flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm,
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
              accessibilityRole="button"
              accessibilityLabel={t('health.prescription.pickFromGallery')}
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

        {step === 'confirm' && imageUri ? (
          <View style={{ marginBottom: spacing.lg }}>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm }}>
              {t('prescriptionScreen.confirmTitle')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 20 }}>
              {t('prescriptionScreen.confirmSubtitle')}
            </Text>
            <Image
              source={{ uri: imageUri }}
              accessibilityLabel={t('prescriptionScreen.photoReviewAlt')}
              style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.lg, marginBottom: spacing.lg, backgroundColor: colors.bgElevated }}
              resizeMode="contain"
            />
            <View style={{ gap: spacing.sm }}>
              <PrimaryButton
                label={t('prescriptionScreen.processButton')}
                onPress={processConfirmedImage}
                testID="receita-process-button"
                accessibilityHint={t('prescriptionScreen.processHint')}
              />
              <PrimaryButton
                label={t('vaccineCard.retakeButton')}
                onPress={retakePhoto}
                variant="secondary"
                testID="receita-retake-button"
              />
            </View>
          </View>
        ) : null}

        {step === 'processing' ? (
          <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} accessibilityLabel={t('prescriptionScreen.photoAlt')} style={{ width: 200, height: 200, borderRadius: radius.lg, marginBottom: spacing.lg }} resizeMode="cover" />
            ) : null}
            <ActivityIndicator color={colors.brand} size="large" />
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, marginTop: spacing.md }}>
              {t('health.prescription.stepReading')}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
              {t('prescriptionScreen.processingHint')}
            </Text>
          </View>
        ) : null}

        {step === 'preview' ? (
          <>
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg, ...shadows.sm, marginBottom: spacing.lg }}>
              <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.success, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                {'✓ '}{medications.length === 1
                  ? t('prescriptionScreen.medsIdentifiedOne', { count: medications.length })
                  : t('prescriptionScreen.medsIdentified', { count: medications.length })}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {t('prescriptionScreen.previewSubtitle')}
              </Text>
            </View>

            {/* Doctor info */}
            <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
              <View style={{ flex: 2 }}>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: 4 }}>{t('prescriptionScreen.doctorLabel')}</Text>
                <TextInput
                  value={doctorName} onChangeText={setDoctorName}
                  placeholder={t('prescriptionScreen.doctorPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: 4 }}>{t('health.export.crmCol')}</Text>
                <TextInput
                  value={crm} onChangeText={setCrm}
                  placeholder="12345"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                  }}
                />
              </View>
            </View>

            {/* Medications list */}
            {medications.map((m, i) => (
              <View
                key={i}
                style={{
                  backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                  padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                  opacity: m.include ? 1 : 0.5,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Switch
                    value={m.include}
                    onValueChange={v => updateMed(i, 'include', v)}
                    trackColor={{ true: colors.brand, false: colors.borderLight }}
                    thumbColor={m.include ? '#fff' : colors.textMuted}
                  />
                  <Text style={{ flex: 1, fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {m.name || t('prescriptionScreen.noName')}
                  </Text>
                </View>
                <TextInput
                  value={m.name}
                  onChangeText={v => updateMed(i, 'name', v)}
                  placeholder={t('activities.fields.name')}
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                    marginBottom: 6,
                  }}
                />
                <TextInput
                  value={m.dosage || ''}
                  onChangeText={v => updateMed(i, 'dosage', v)}
                  placeholder={t('prescriptionScreen.dosePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                    marginBottom: 6,
                  }}
                />
                <TextInput
                  value={m.frequency || ''}
                  onChangeText={v => updateMed(i, 'frequency', v)}
                  placeholder={t('prescriptionScreen.frequencyPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                    marginBottom: 6,
                  }}
                />
                <TextInput
                  value={m.duration || ''}
                  onChangeText={v => updateMed(i, 'duration', v)}
                  placeholder={t('health.prescription.durationPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  style={{
                    backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, fontSize: font.sizes.sm, color: colors.text,
                  }}
                />
              </View>
            ))}

            <View style={{ marginTop: spacing.lg, marginBottom: spacing.sm }}>
              <PrimaryButton
                label={t('prescriptionScreen.saveMedications')}
                onPress={handleSave}
                loading={saving}
                testID="saude-receita-save"
              />
            </View>
            <TouchableOpacity onPress={handleRetry} accessibilityRole="button" accessibilityLabel={t('vaccineCard.tryAnotherPhoto')} style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
              <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm }}>{t('vaccineCard.tryAnotherPhoto')}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
