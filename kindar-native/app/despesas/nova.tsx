/* eslint-disable jsx-a11y/alt-text */
import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createExpense, uploadExpenseReceipt } from 'src/services/expenses';
import { EXPENSE_CATEGORIES } from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { CurrencyInput } from 'src/components/ui/MaskedInputs';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

interface ChildOption { id: string; full_name: string; }
interface MemberOption { user_id: string; name: string; }

// `labelKey` resolvido no render via t() — presets numéricos (50% / 50%) são
// universais, mas "Eu pago tudo" / "Personalizado" precisam de tradução.
const SPLIT_PRESETS: { id: '50-50' | '70-30' | '30-70' | '100-0' | 'custom'; labelKey: string; ratios: { me: number; other: number } | null }[] = [
  { id: '50-50', labelKey: 'expenses.split.5050', ratios: { me: 50, other: 50 } },
  { id: '70-30', labelKey: 'expenses.split.7030', ratios: { me: 70, other: 30 } },
  { id: '30-70', labelKey: 'expenses.split.3070', ratios: { me: 30, other: 70 } },
  { id: '100-0', labelKey: 'expenses.split.payAll', ratios: { me: 100, other: 0 } },
  { id: 'custom', labelKey: 'expenseForm.custom', ratios: null },
];

export default function NovaExpenseScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [category, setCategory] = useState('other');
  const [dateIso, setDateIso] = useState(dateToIso(new Date()));
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<string>('image/jpeg');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // onBlur validation — feedback inline antes do submit (padrão premium).
  function validateDescriptionField(value: string): string | null {
    if (!value.trim()) return t('validation.field.descriptionRequired');
    return null;
  }
  function validateAmountField(value: string): string | null {
    if (!value || !value.trim()) return t('validation.field.amountRequired');
    const val = parseFloat(value.replace(',', '.'));
    if (isNaN(val)) return t('validation.field.amountInvalid');
    if (val <= 0) return t('validation.field.amountMustBePositive');
    return null;
  }

  // Child + split ratio (P0 fields previously missing on native)
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [splitPreset, setSplitPreset] = useState<'50-50' | '70-30' | '30-70' | '100-0' | 'custom'>('50-50');
  const [customMyShare, setCustomMyShare] = useState<string>('50');

  useEffect(() => {
    if (!activeGroup || !userId) return;
    let cancelled = false;
    (async () => {
      const [{ data: childRows }, { data: memberRows }] = await Promise.all([
        supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId).order('birth_date'),
        supabase
          .from('group_members')
          .select('user_id, profiles(full_name, display_name)')
          .eq('group_id', activeGroup.groupId),
      ]);
      if (cancelled) return;
      setChildren(childRows ?? []);
      setMembers(
        ((memberRows as Array<{ user_id: string; profiles: { full_name?: string | null; display_name?: string | null } | null }> | null) ?? []).map(m => ({
          user_id: m.user_id,
          name: (m.profiles?.display_name || m.profiles?.full_name?.split(' ')[0] || t('expenses.coparentFallback')),
        }))
      );
    })();
    return () => { cancelled = true; };
  }, [activeGroup, userId, t]);

  const otherMember = members.find(m => m.user_id !== userId);

  async function pickReceipt(source: 'camera' | 'library') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { toast.show({ message: t('toasts.permissions.cameraDenied'), variant: 'info' }); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
      if (!r.canceled && r.assets?.[0]) {
        setReceiptUri(r.assets[0].uri);
        setReceiptMime(r.assets[0].mimeType || 'image/jpeg');
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { toast.show({ message: t('toasts.permissions.photosDenied'), variant: 'info' }); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
      if (!r.canceled && r.assets?.[0]) {
        setReceiptUri(r.assets[0].uri);
        setReceiptMime(r.assets[0].mimeType || 'image/jpeg');
      }
    }
  }

  function buildSplitRatio(): Record<string, number> | undefined {
    if (!userId || !otherMember) return undefined; // single-member group → leave default
    if (splitPreset === 'custom') {
      const myShare = Math.max(0, Math.min(100, parseFloat(customMyShare.replace(',', '.')) || 50));
      const otherShare = Math.round((100 - myShare) * 100) / 100;
      return { [userId]: myShare, [otherMember.user_id]: otherShare };
    }
    const preset = SPLIT_PRESETS.find(p => p.id === splitPreset);
    if (!preset?.ratios) return undefined;
    return { [userId]: preset.ratios.me, [otherMember.user_id]: preset.ratios.other };
  }

  async function handleSave() {
    if (!description.trim() || !amount || !userId || !activeGroup) return;
    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val) || val <= 0) { setError(t('validation.field.amountInvalid')); return; }

    setSaving(true);

    // 1. Upload receipt if provided
    let receiptUrl: string | null = null;
    if (receiptUri) {
      const up = await uploadExpenseReceipt({ uri: receiptUri, mimeType: receiptMime, groupId: activeGroup.groupId });
      if (!up.success) {
        setError(t('expenses.uploadFailed', { error: up.error ?? '' }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSaving(false);
        return;
      }
      receiptUrl = up.url;
    }

    // 2. Create expense with childId + splitRatio (parity with PWA)
    const result = await createExpense({
      groupId: activeGroup.groupId,
      childId: selectedChildId || undefined,
      category,
      description,
      amount: val,
      paidBy: userId,
      splitRatio: buildSplitRatio(),
      expenseDate: dateIso,
      receiptUrl,
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      setError(result.error || t('expenses.saveError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSaving(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('expensesPage.newExpenseTitle')} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        {error ? <Text style={{ color: colors.error, marginBottom: spacing.md }}>{error}</Text> : null}

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('expenses.description')}</Text>
        <TextInput
          value={description}
          onChangeText={(v) => { setDescription(v); if (descriptionError) setDescriptionError(null); }}
          onBlur={() => setDescriptionError(validateDescriptionField(description))}
          accessibilityLabel={descriptionError ?? t('expenses.description')}
          placeholder={t('expenses.descriptionPlaceholder')}
          placeholderTextColor={colors.textDim}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md,
            borderWidth: 1, borderColor: descriptionError ? colors.error : colors.borderLight,
            padding: spacing.lg, fontSize: font.sizes.md, color: colors.text,
            marginBottom: descriptionError ? spacing.xs : spacing.lg,
          }}
        />
        {descriptionError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {descriptionError}
          </Text>
        ) : null}

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>{t('expenses.amount')}</Text>
        <CurrencyInput
          accessibilityLabel={amountError ?? t('expenses.amount')}
          value={parseFloat(amount.replace(',', '.')) || 0}
          onChangeText={(reais) => {
            setAmount(reais === 0 ? '' : String(reais).replace('.', ','));
            if (amountError) setAmountError(null);
          }}
          onBlur={() => setAmountError(validateAmountField(amount))}
          style={{
            marginBottom: amountError ? spacing.xs : spacing.lg,
            fontSize: font.sizes.xl, fontWeight: font.weights.bold,
            borderColor: amountError ? colors.error : undefined,
          }}
        />
        {amountError ? (
          <Text style={{ color: colors.error, fontSize: font.sizes.xs, marginTop: 2, marginBottom: spacing.lg }}>
            {amountError}
          </Text>
        ) : null}

        <View style={{ marginBottom: spacing.lg }}>
          <DatePickerField label={t('expenses.expenseDate')} value={dateIso} onChange={setDateIso} maximumDate={new Date()} />
        </View>

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>{t('expenses.category')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {EXPENSE_CATEGORIES.map(cat => {
            const catLabel = t(cat.labelKey);
            return (
            <TouchableOpacity key={cat.value} onPress={() => setCategory(cat.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: category === cat.value }}
              accessibilityLabel={catLabel}
              style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full,
                backgroundColor: category === cat.value ? colors.brand : colors.bgElevated,
                borderWidth: 1, borderColor: category === cat.value ? colors.brand : colors.borderLight }}>
              <Text style={{ fontSize: font.sizes.sm, color: category === cat.value ? '#fff' : colors.text }}>
                {cat.icon} {catLabel}
              </Text>
            </TouchableOpacity>
            );
          })}
        </View>

        {/* Child (optional) — pairs the expense with a specific child */}
        {children.length > 0 ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>
              {t('expenseForm.childOptional')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              <TouchableOpacity onPress={() => setSelectedChildId(null)}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedChildId === null }}
                accessibilityLabel={t('expenses.family')}
                style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full,
                  backgroundColor: selectedChildId === null ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: selectedChildId === null ? colors.brand : colors.borderLight }}>
                <Text style={{ fontSize: font.sizes.sm, color: selectedChildId === null ? '#fff' : colors.text }}>
                  {t('expenses.family')}
                </Text>
              </TouchableOpacity>
              {children.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setSelectedChildId(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: selectedChildId === c.id }}
                  accessibilityLabel={c.full_name.split(' ')[0]}
                  style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full,
                    backgroundColor: selectedChildId === c.id ? colors.brand : colors.bgElevated,
                    borderWidth: 1, borderColor: selectedChildId === c.id ? colors.brand : colors.borderLight }}>
                  <Text style={{ fontSize: font.sizes.sm, color: selectedChildId === c.id ? '#fff' : colors.text }}>
                    👶 {c.full_name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {/* Split ratio — only when there are 2+ members */}
        {otherMember ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
              {t('expenseForm.splitLabel')}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: spacing.sm }}>
              {t('expenses.splitHint')}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
              {SPLIT_PRESETS.map(p => {
                const presetLabel = t(p.labelKey);
                return (
                <TouchableOpacity key={p.id} onPress={() => setSplitPreset(p.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: splitPreset === p.id }}
                  accessibilityLabel={t('expenses.splitOptionA11y', { label: presetLabel })}
                  style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md,
                    backgroundColor: splitPreset === p.id ? colors.brand : colors.bgElevated,
                    borderWidth: 1, borderColor: splitPreset === p.id ? colors.brand : colors.borderLight }}>
                  <Text style={{ fontSize: font.sizes.sm, color: splitPreset === p.id ? '#fff' : colors.text }}>
                    {presetLabel}
                  </Text>
                </TouchableOpacity>
                );
              })}
            </View>
            {splitPreset === 'custom' ? (
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.lg }}>
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>{t('expenseForm.you')}</Text>
                <TextInput
                  value={customMyShare}
                  onChangeText={setCustomMyShare}
                  placeholder="50"
                  placeholderTextColor={colors.textDim}
                  keyboardType="decimal-pad"
                  style={{
                    width: 70,
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    padding: spacing.sm, fontSize: font.sizes.md, color: colors.text, textAlign: 'right',
                  }}
                />
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>%</Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, flex: 1 }}>
                  {otherMember.name}: {Math.max(0, 100 - (parseFloat(customMyShare.replace(',', '.')) || 0))}%
                </Text>
              </View>
            ) : (
              <View style={{ marginBottom: spacing.lg }} />
            )}
          </>
        ) : null}

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>{t('expenseForm.receiptOptional')}</Text>
        {receiptUri ? (
          <View style={{ position: 'relative', marginBottom: spacing.lg }}>
            <Image source={{ uri: receiptUri }} style={{ width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.bgElevated }} />
            <TouchableOpacity onPress={() => setReceiptUri(null)}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.removeReceipt')}
              style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing['2xl'] }}>
            <TouchableOpacity onPress={() => pickReceipt('camera')}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.takeReceiptPhoto')}
              style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderLight, paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{t('editChild.photoCamera')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => pickReceipt('library')}
              accessibilityRole="button"
              accessibilityLabel={t('expenses.pickReceiptFromGallery')}
              style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderLight, paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{t('editChild.photoLibrary')}</Text>
            </TouchableOpacity>
          </View>
        )}

        <PrimaryButton
          label={t('expenses.saveExpense')}
          onPress={handleSave}
          loading={saving}
          disabled={!description.trim() || !amount}
          testID="despesa-save-button"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
