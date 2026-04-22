/* eslint-disable jsx-a11y/alt-text */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { createExpense, uploadExpenseReceipt } from '../../src/services/expenses';
import { EXPENSE_CATEGORIES } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from '../../src/components/ui/DateTimeField';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

export default function NovaExpenseScreen() {
  const { userId, activeGroup } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [dateIso, setDateIso] = useState(dateToIso(new Date()));
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptMime, setReceiptMime] = useState<string>('image/jpeg');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function pickReceipt(source: 'camera' | 'library') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permissao necessaria', 'Precisamos da camera para fotografar o comprovante'); return; }
      const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
      if (!r.canceled && r.assets?.[0]) {
        setReceiptUri(r.assets[0].uri);
        setReceiptMime(r.assets[0].mimeType || 'image/jpeg');
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Permissao necessaria', 'Precisamos acesso as fotos'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
      if (!r.canceled && r.assets?.[0]) {
        setReceiptUri(r.assets[0].uri);
        setReceiptMime(r.assets[0].mimeType || 'image/jpeg');
      }
    }
  }

  async function handleSave() {
    if (!description.trim() || !amount || !userId || !activeGroup) return;
    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val) || val <= 0) { setError('Valor invalido'); return; }

    setSaving(true);

    // 1. Upload receipt if provided
    let receiptUrl: string | null = null;
    if (receiptUri) {
      const up = await uploadExpenseReceipt({ uri: receiptUri, mimeType: receiptMime, groupId: activeGroup.groupId });
      if (!up.success) {
        setError(`Falha no upload: ${up.error}`);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setSaving(false);
        return;
      }
      receiptUrl = up.url;
    }

    // 2. Create expense with optional receipt URL
    const result = await createExpense({
      groupId: activeGroup.groupId,
      category,
      description,
      amount: val,
      paidBy: userId,
      expenseDate: dateIso,
      receiptUrl,
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      setError(result.error || 'Erro ao salvar despesa');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSaving(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Nova Despesa" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
        {error ? <Text style={{ color: colors.error, marginBottom: spacing.md }}>{error}</Text> : null}

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Descricao</Text>
        <TextInput value={description} onChangeText={setDescription} placeholder="O que foi comprado?" placeholderTextColor={colors.textDim}
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }} />

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Valor (R$)</Text>
        <TextInput value={amount} onChangeText={setAmount} placeholder="0,00" placeholderTextColor={colors.textDim} keyboardType="decimal-pad"
          style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.lg }} />

        <View style={{ marginBottom: spacing.lg }}>
          <DatePickerField label="Data da despesa" value={dateIso} onChange={setDateIso} maximumDate={new Date()} />
        </View>

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Categoria</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {EXPENSE_CATEGORIES.map(cat => (
            <TouchableOpacity key={cat.value} onPress={() => setCategory(cat.value)}
              style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full,
                backgroundColor: category === cat.value ? colors.brand : colors.bgElevated,
                borderWidth: 1, borderColor: category === cat.value ? colors.brand : colors.borderLight }}>
              <Text style={{ fontSize: font.sizes.sm, color: category === cat.value ? '#fff' : colors.text }}>
                {cat.icon} {cat.value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Comprovante (opcional)</Text>
        {receiptUri ? (
          <View style={{ position: 'relative', marginBottom: spacing.lg }}>
            <Image source={{ uri: receiptUri }} style={{ width: '100%', height: 200, borderRadius: radius.md, backgroundColor: colors.bgElevated }} />
            <TouchableOpacity onPress={() => setReceiptUri(null)}
              style={{ position: 'absolute', top: 8, right: 8, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing['2xl'] }}>
            <TouchableOpacity onPress={() => pickReceipt('camera')}
              style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderLight, paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="camera-outline" size={24} color={colors.textSecondary} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => pickReceipt('library')}
              style={{ flex: 1, backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderLight, paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.xs }}>
              <Ionicons name="image-outline" size={24} color={colors.textSecondary} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>Galeria</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={handleSave} disabled={saving || !description.trim() || !amount}
          style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Salvar</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
