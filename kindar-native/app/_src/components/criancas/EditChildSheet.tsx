/**
 * EditChildSheet — bottom-sheet form to edit child profile.
 *
 * Native UX upgrades over the PWA inline form (src/app/(app)/criancas/[id]/
 * ChildDetailClient.tsx TabGeral):
 *   - Avatar tap → camera or library upload (PWA has no avatar picker)
 *   - CPF mask + on-blur digit-verifier validation (PWA: placeholder only)
 *   - RG mask inline (PWA: placeholder only)
 *   - Allergy chip editor with × per chip + add field (PWA: comma string)
 *   - Sex segmented control (PWA omits sex from the form)
 *   - Blood type chips writing to child_medical_info (PWA: separate health
 *     screen, never on the child profile form)
 *   - Native date wheel via DatePickerField (PWA: <input type="date">)
 *   - Keyboard-aware bottom sheet with haptics on every meaningful action
 *
 * Writes:
 *   - children fields → updateChild service (safeWrite, RLS)
 *   - child_medical_info.blood_type → upsertChildMedicalInfo (idempotent)
 *   - children.photo_url → uploadChildAvatar (Storage path, signed at read)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import type { Child, MedicalInfo } from '../../services/children';
import { updateChild, upsertChildMedicalInfo, uploadChildAvatar, signChildAvatar } from '../../services/children';
import { supabase } from '../../lib/supabase';
import { DatePickerField } from '../ui/DateTimeField';
import { useToast } from '../ui/ToastProvider';
import PrimaryButton from '../ui/PrimaryButton';
import ModalBackdrop from '../ui/ModalBackdrop';
import { useI18n } from '../../i18n';
import { useIntl } from '../../lib/intl';
import { colors, spacing, radius, font, shadows } from '../../design-system/tokens';

// ── Masks & validation ───────────────────────────────────────────────────

export function formatCpf(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 9);
  const p4 = digits.slice(9, 11);
  let out = p1;
  if (p2) out += '.' + p2;
  if (p3) out += '.' + p3;
  if (p4) out += '-' + p4;
  return out;
}

export function formatRg(raw: string): string {
  const cleaned = raw.replace(/[^0-9Xx]/g, '').toUpperCase().slice(0, 9);
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 5) return cleaned.slice(0, 2) + '.' + cleaned.slice(2);
  if (cleaned.length <= 8) return cleaned.slice(0, 2) + '.' + cleaned.slice(2, 5) + '.' + cleaned.slice(5);
  return cleaned.slice(0, 2) + '.' + cleaned.slice(2, 5) + '.' + cleaned.slice(5, 8) + '-' + cleaned.slice(8);
}

/**
 * Validate a Brazilian CPF using the official two-digit verifier algorithm.
 * Reject 11-digit-equal sequences (000.000.000-00 etc.) which pass the
 * checksum but are well-known invalid inputs.
 */
export function isValidCpf(formatted: string): boolean {
  const digits = formatted.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcDigit = (slice: string, startWeight: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += parseInt(slice[i], 10) * (startWeight - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d10 = calcDigit(digits.slice(0, 9), 10);
  if (d10 !== parseInt(digits[9], 10)) return false;
  const d11 = calcDigit(digits.slice(0, 10), 11);
  if (d11 !== parseInt(digits[10], 10)) return false;
  return true;
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  child: Child;
  medicalInfo: MedicalInfo | null;
  groupId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function EditChildSheet(props: Props) {
  // The form lives in a child component keyed by `${child.id}-${visible}` so
  // it remounts (with fresh state) every time the sheet opens — avoids the
  // setState-in-effect anti-pattern.
  return (
    <Modal visible={props.visible} transparent animationType="slide" onRequestClose={props.onClose}>
      <SheetBody key={`${props.child.id}-${props.visible ? 'open' : 'closed'}`} {...props} />
    </Modal>
  );
}

function SheetBody({ child, medicalInfo, groupId, onClose, onSaved }: Props) {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();

  // Idade humanizada — math numérico preservado; unidade localizada via as
  // chaves `onboardingForm.age*` (paridade com o PWA onboarding/_lib/format.ts).
  const ageHint = useCallback(
    (iso: string): string => {
      const [y, m, d] = iso.split('-').map(Number);
      if (!y || !m || !d) return '';
      const birth = new Date(y, m - 1, d);
      const now = new Date();
      const months =
        (now.getFullYear() - birth.getFullYear()) * 12 +
        (now.getMonth() - birth.getMonth()) -
        (now.getDate() < birth.getDate() ? 1 : 0);
      if (months < 1) return t('onboardingForm.ageNewborn');
      if (months < 12) {
        return months === 1
          ? t('onboardingForm.ageMonthOne')
          : t('onboardingForm.ageMonths', { count: months });
      }
      const years = Math.floor(months / 12);
      return years === 1
        ? t('onboardingForm.ageYearOne')
        : t('onboardingForm.ageYears', { count: years });
    },
    [t],
  );

  // Rótulo de mês (parte de DATA do growthInsight) — locale-aware. Mantém o
  // sufixo de ano (mai/24) quando a medida é de um ano diferente do atual.
  const monthFromIso = useCallback(
    (iso: string): string => {
      const [y, m] = iso.split('-').map(Number);
      if (!y || !m) return '';
      const label = intl.formatMonthShort(iso);
      const now = new Date();
      return now.getFullYear() === y ? label : `${label}/${String(y).slice(2)}`;
    },
    [intl],
  );

  // Insight derivado das duas ultimas medidas. A lógica numérica (delta de peso,
  // tempo relativo) é preservada; só a PARTE DE DATA (rótulo do mês) é localizada.
  const growthInsight = useCallback(
    (
      latest: { weight_kg: number | null; measured_date: string },
      previous: { weight_kg: number | null; measured_date: string } | null,
    ): string => {
      const days = daysSince(latest.measured_date);
      const relative =
        days === 0 ? 'Atualizada hoje'
        : days === 1 ? 'Atualizada ontem'
        : days < 7 ? `Atualizada há ${days} dias`
        : days < 30 ? `Atualizada há ${Math.round(days / 7)} sem.`
        : days < 365 ? `Atualizada há ${Math.round(days / 30)} meses`
        : `Atualizada há ${Math.round(days / 365)} anos`;

      if (latest.weight_kg != null && previous?.weight_kg != null) {
        const delta = latest.weight_kg - previous.weight_kg;
        if (Math.abs(delta) >= 0.1) {
          const sign = delta > 0 ? '+' : '';
          const monthLabel = monthFromIso(previous.measured_date);
          return `${sign}${delta.toFixed(1)}kg desde ${monthLabel} · ${relative}`;
        }
      }
      return relative;
    },
    [monthFromIso],
  );
  const [fullName, setFullName] = useState(child.full_name);
  const [birthDate, setBirthDate] = useState<string>(child.birth_date);
  const [sex, setSex] = useState<'M' | 'F' | null>(child.sex);
  const [cpf, setCpf] = useState<string>(child.cpf || '');
  const [rg, setRg] = useState<string>(child.rg || '');
  const [allergies, setAllergies] = useState<string[]>(child.allergies || []);
  const [allergyDraft, setAllergyDraft] = useState('');
  const [notes, setNotes] = useState<string>(child.notes || '');
  const [bloodType, setBloodType] = useState<string | null>(medicalInfo?.blood_type ?? null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(child.photo_url);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  // Ultima medida (peso/altura) — read-only nesta tela; fonte unica em
  // growth_records via /saude/crescimento. Buscamos as duas ultimas para
  // mostrar tendencia (delta + tempo desde a ultima atualizacao).
  type GrowthRow = { weight_kg: number | null; height_cm: number | null; measured_date: string };
  const [growthRows, setGrowthRows] = useState<GrowthRow[]>([]);
  const latestGrowth = growthRows[0] || null;
  const previousGrowth = growthRows[1] || null;

  // Realtime: refetch ao detectar INSERT/UPDATE/DELETE em growth_records
  // do child atual. Evita o "ainda parece beta" de precisar reabrir a tela.
  useEffect(() => {
    let cancelled = false;
    const fetchGrowth = async () => {
      const { data } = await supabase
        .from('growth_records')
        .select('weight_kg, height_cm, measured_date')
        .eq('child_id', child.id)
        .order('measured_date', { ascending: false })
        .limit(2);
      if (!cancelled) setGrowthRows((data || []) as GrowthRow[]);
    };
    fetchGrowth();

    const channel = supabase
      // sufixo aleatorio: nome unico por mount evita "after subscribe()" se o
      // sheet montar 2x (mesma classe do chat, PR #95). Cleanup abaixo remove.
      .channel(`growth:${child.id}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'growth_records', filter: `child_id=eq.${child.id}` },
        () => fetchGrowth(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [child.id]);
  const [saving, setSaving] = useState(false);

  const cpfValid = useMemo(() => cpf.trim().length === 0 || isValidCpf(cpf), [cpf]);
  // CPF (opcional) NÃO desabilita o botão: se inválido, o handleSave dá toast
  // "CPF inválido" no toque. Antes o botão ficava desabilitado em silêncio →
  // o tester tocava em Salvar, nada acontecia e não associava ao CPF
  // (mecoelho 2026-06-03). A borda vermelha + mensagem inline continuam.
  const canSave = useMemo(
    () => fullName.trim().length > 0 && !!birthDate && !saving && !uploadingPhoto,
    [fullName, birthDate, saving, uploadingPhoto]
  );

  function addAllergy() {
    const next = allergyDraft.trim();
    if (!next) return;
    if (allergies.some(a => a.toLowerCase() === next.toLowerCase())) {
      setAllergyDraft('');
      return;
    }
    setAllergies([...allergies, next]);
    setAllergyDraft('');
    Haptics.selectionAsync();
  }

  function removeAllergy(idx: number) {
    setAllergies(allergies.filter((_, i) => i !== idx));
    Haptics.selectionAsync();
  }

  function toggleBloodType(bt: string) {
    Haptics.selectionAsync();
    setBloodType(prev => (prev === bt ? null : bt));
  }

  async function pickAvatarFromCamera() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast.show({ message: t('toasts.permissions.cameraBlocked'), variant: 'info' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    await doUpload(result.assets[0]);
  }

  async function pickAvatarFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show({ message: t('toasts.permissions.photosBlocked'), variant: 'info' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    await doUpload(result.assets[0]);
  }

  async function doUpload(asset: ImagePicker.ImagePickerAsset) {
    setUploadingPhoto(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await uploadChildAvatar({
      childId: child.id,
      groupId,
      uri: asset.uri,
      mimeType: asset.mimeType,
    });
    if (!res.success) {
      setUploadingPhoto(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
      return;
    }
    // Sign the freshly-uploaded path so the preview shows the new image.
    const signed = await signChildAvatar(res.path);
    setPhotoUrl(signed);
    setUploadingPhoto(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function openAvatarPicker() {
    if (uploadingPhoto) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      t('editChild.photoTitle'),
      t('editChild.photoPrompt'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('editChild.photoLibrary'), onPress: pickAvatarFromLibrary },
        { text: t('editChild.photoCamera'), onPress: pickAvatarFromCamera },
      ],
      { cancelable: true }
    );
  }

  async function handleSave() {
    if (!canSave) return;
    if (!cpfValid) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: t('editChild.cpfInvalid'), variant: 'error' });
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const childResult = await updateChild(child.id, {
      full_name: fullName.trim(),
      birth_date: birthDate,
      sex,
      cpf: cpf.trim() || null,
      rg: rg.trim() || null,
      allergies: allergies.length > 0 ? allergies : null,
      notes: notes.trim() || null,
    });
    if (!childResult.success) {
      setSaving(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: childResult.error || t('toasts.common.saveFailed'), variant: 'error' });
      return;
    }

    // Only touch child_medical_info when blood type actually changed —
    // the upsert sets group_id which we don't want to overwrite needlessly.
    const initialBlood = medicalInfo?.blood_type ?? null;
    if (bloodType !== initialBlood) {
      const medResult = await upsertChildMedicalInfo({
        childId: child.id,
        groupId,
        blood_type: bloodType,
      });
      if (!medResult.success) {
        setSaving(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        toast.show({ message: medResult.error || t('toasts.common.saveFailed'), variant: 'warning' });
        await onSaved();
        return;
      }
    }

    setSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await onSaved();
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose} align="bottom" dim={0.5} padding={0}>
      <View
        style={{
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: radius['2xl'],
          borderTopRightRadius: radius['2xl'],
          paddingTop: spacing.md,
          paddingBottom: 40,
          maxHeight: '94%',
        }}
      >
        <View
          style={{
            width: 36, height: 4, borderRadius: 2,
            backgroundColor: colors.borderLight,
            alignSelf: 'center', marginBottom: spacing.md,
          }}
        />

        <View
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: spacing.xl, marginBottom: spacing.md,
          }}
        >
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
            {t('childDetail.editInfo')}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={24} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xl }}
        >
          {/* Avatar — tap to upload */}
          <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
            <TouchableOpacity
              onPress={openAvatarPicker}
              activeOpacity={0.85}
              testID="edit-child-avatar"
              disabled={uploadingPhoto}
              style={{ position: 'relative' }}
            >
              {photoUrl ? (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  source={{ uri: photoUrl }}
                  accessibilityLabel={t('editChild.photoTitle')}
                  style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.bgSurface }}
                />
              ) : (
                <View
                  style={{
                    width: 96, height: 96, borderRadius: 48,
                    backgroundColor: colors.brand,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: font.sizes['2xl'], fontWeight: '700' }}>
                    {(fullName || child.full_name).split(' ').filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase()).join('')}
                  </Text>
                </View>
              )}
              <View
                style={{
                  position: 'absolute', right: -2, bottom: -2,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: colors.brand,
                  borderWidth: 3, borderColor: colors.bgElevated,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {uploadingPhoto ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="camera" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
            <Text style={{ marginTop: 6, fontSize: font.sizes.xs, color: colors.textSecondary }}>
              {uploadingPhoto ? t('editChild.photoUploading') : t('editChild.photoTapToChange')}
            </Text>
          </View>

          {/* Nome completo */}
          <Label>{t('children.fullName')}</Label>
          <TextInput
            testID="edit-child-name"
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('children.fullName')}
            placeholderTextColor={colors.textDim}
            style={inputStyle}
          />

          {/* Data de nascimento */}
          <Label>{t('children.birthDate')}</Label>
          <DatePickerField
            value={birthDate || null}
            onChange={(iso) => setBirthDate(iso || '')}
            placeholder={t('editChild.datePlaceholder')}
          />
          {birthDate ? (
            <Text style={hintStyle}>
              {ageHint(birthDate)} · {intl.formatDate(birthDate)}
            </Text>
          ) : null}

          {/* Sexo */}
          <Label>{t('children.sex')}</Label>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {(
              [
                { v: 'M' as const, label: t('onboardingForm.sexMale') },
                { v: 'F' as const, label: t('onboardingForm.sexFemale') },
                { v: null as 'M' | 'F' | null, label: t('editChild.sexNone') },
              ]
            ).map((opt) => {
              const active = sex === opt.v;
              return (
                <TouchableOpacity
                  key={String(opt.v)}
                  onPress={() => { Haptics.selectionAsync(); setSex(opt.v); }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: active ? colors.brand : colors.borderLight,
                    backgroundColor: active ? `${colors.brand}10` : colors.bg,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: font.sizes.sm,
                      fontWeight: active ? font.weights.semibold : font.weights.medium,
                      color: active ? colors.brand : colors.textSecondary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* CPF / RG */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Label>{t('childGeneral.cpf')}</Label>
              <TextInput
                testID="edit-child-cpf"
                value={cpf}
                onChangeText={(v) => setCpf(formatCpf(v))}
                placeholder={t('editChild.cpfPlaceholder')}
                placeholderTextColor={colors.textDim}
                keyboardType="number-pad"
                maxLength={14}
                style={[
                  inputStyle,
                  !cpfValid ? { borderColor: colors.error } : null,
                ]}
              />
              {!cpfValid ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.error, marginTop: 4 }}>
                  {t('editChild.cpfInvalid')}
                </Text>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Label>{t('childGeneral.rg')}</Label>
              <TextInput
                testID="edit-child-rg"
                value={rg}
                onChangeText={(v) => setRg(formatRg(v))}
                placeholder={t('childProfile.rgPlaceholder')}
                placeholderTextColor={colors.textDim}
                maxLength={12}
                style={inputStyle}
              />
            </View>
          </View>

          {/* Tipo sanguíneo */}
          <Label>{t('editChild.bloodType')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {BLOOD_TYPES.map((bt) => {
              const active = bloodType === bt;
              return (
                <TouchableOpacity
                  key={bt}
                  onPress={() => toggleBloodType(bt)}
                  testID={`edit-child-blood-${bt}`}
                  style={{
                    paddingHorizontal: spacing.md,
                    paddingVertical: 8,
                    borderRadius: radius.full,
                    borderWidth: 1,
                    borderColor: active ? '#C62828' : colors.borderLight,
                    backgroundColor: active ? '#FFE4E1' : colors.bg,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <Ionicons name="water" size={12} color={active ? '#C62828' : colors.textMuted} />
                  <Text
                    style={{
                      fontSize: font.sizes.sm,
                      fontWeight: active ? font.weights.bold : font.weights.medium,
                      color: active ? '#C62828' : colors.textSecondary,
                    }}
                  >
                    {bt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {bloodType ? (
            <TouchableOpacity onPress={() => toggleBloodType(bloodType)} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{t('editChild.clearSelection')}</Text>
            </TouchableOpacity>
          ) : null}

          {/* Alergias */}
          <Label>{t('childProfile.allergiesTitle')}</Label>
          {allergies.length > 0 ? (
            <View
              style={{
                flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs,
                marginBottom: spacing.sm,
              }}
            >
              {allergies.map((a, i) => (
                <TouchableOpacity
                  key={`${a}-${i}`}
                  onPress={() => removeAllergy(i)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: spacing.sm,
                    paddingVertical: 6,
                    backgroundColor: 'rgba(229,57,53,0.1)',
                    borderRadius: radius.full,
                  }}
                >
                  <Text style={{ fontSize: font.sizes.xs, color: colors.error, fontWeight: font.weights.semibold }}>
                    {a}
                  </Text>
                  <Ionicons name="close-circle" size={14} color={colors.error} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              testID="edit-child-allergy-draft"
              value={allergyDraft}
              onChangeText={setAllergyDraft}
              onSubmitEditing={addAllergy}
              placeholder={t('editChild.allergyPlaceholder')}
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
              style={[inputStyle, { flex: 1, marginBottom: 0 }]}
            />
            <TouchableOpacity
              onPress={addAllergy}
              disabled={allergyDraft.trim().length === 0}
              style={{
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                backgroundColor: colors.brand,
                justifyContent: 'center',
                opacity: allergyDraft.trim().length === 0 ? 0.4 : 1,
              }}
            >
              <Ionicons name="add" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Crescimento — read-only com link pra /saude/crescimento.
              Resolve o paradoxo "preenchi peso/altura mas nao apareceu":
              o dado vive em growth_records (historico datado), nao em
              children. Mostramos a ultima medida + tendencia aqui (visao
              derivada). Realtime channel garante atualizacao automatica. */}
          <Label>{t('childProfile.latestGrowth')}</Label>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onClose();
              router.push('/saude/crescimento' as never);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              backgroundColor: pressed ? colors.brandLight : colors.bgSurface,
              borderRadius: radius.md,
              padding: spacing.md, marginBottom: spacing.lg,
              opacity: pressed ? 0.92 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <View style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: colors.brandLight,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="fitness-outline" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              {latestGrowth ? (
                <>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {[
                      latestGrowth.weight_kg ? `${latestGrowth.weight_kg}kg` : null,
                      latestGrowth.height_cm ? `${latestGrowth.height_cm}cm` : null,
                    ].filter(Boolean).join(' · ') || '—'}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {growthInsight(latestGrowth, previousGrowth)}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {t('editChild.growthEmptyTitle')}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {t('editChild.growthEmptySubtitle')}
                  </Text>
                </>
              )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>

          {/* Anotações */}
          <Label>{t('childGeneral.notesTitle')}</Label>
          <TextInput
            testID="edit-child-notes"
            value={notes}
            onChangeText={setNotes}
            placeholder={t('children.notesPlaceholder')}
            placeholderTextColor={colors.textDim}
            multiline
            style={[inputStyle, { minHeight: 88, textAlignVertical: 'top' }]}
          />

          {/* Save button */}
          <View style={{ marginTop: spacing.xl }}>
            <PrimaryButton
              label={t('childDetail.saveChanges')}
              onPress={handleSave}
              loading={saving}
              disabled={!canSave && !saving}
              style={shadows.sm}
              testID="edit-child-save"
            />
          </View>
        </ScrollView>
      </View>
    </ModalBackdrop>
  );
}

// Dias decorridos desde uma data ISO (numérico puro — usado pelo growthInsight
// component-scoped, que localiza o rótulo de mês via intl).
function daysSince(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return 0;
  const past = new Date(y, m - 1, d).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - past) / 86400000));
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        fontSize: font.sizes.xs,
        fontWeight: font.weights.semibold,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: spacing.lg,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

const inputStyle = {
  backgroundColor: colors.bg,
  borderWidth: 1,
  borderColor: colors.borderLight,
  borderRadius: radius.md,
  paddingHorizontal: spacing.md,
  paddingVertical: 10,
  fontSize: font.sizes.md,
  color: colors.text,
} as const;

const hintStyle = {
  fontSize: font.sizes.xs,
  color: colors.textMuted,
  marginTop: 4,
} as const;
