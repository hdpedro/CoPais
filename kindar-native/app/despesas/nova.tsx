import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/store/auth';
import { createExpense } from '../../src/services/expenses';
import { EXPENSE_CATEGORIES, getBrazilToday } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

export default function NovaExpenseScreen() {
  const { userId, activeGroup } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!description.trim() || !amount || !userId || !activeGroup) return;
    const val = parseFloat(amount.replace(',', '.'));
    if (isNaN(val) || val <= 0) { setError('Valor invalido'); return; }

    setSaving(true);
    const result = await createExpense({
      groupId: activeGroup.groupId,
      category,
      description,
      amount: val,
      paidBy: userId,
      expenseDate: getBrazilToday(),
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

        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Categoria</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing['2xl'] }}>
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

        <TouchableOpacity onPress={handleSave} disabled={saving || !description.trim() || !amount}
          style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Salvar</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
