import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/auth';
import { getBrazilToday } from '../../src/lib/constants';
import { colors, spacing, radius, font } from '../../src/design-system/tokens';

export default function OnboardingScreen() {
  const { userId } = useAuth();
  const [step, setStep] = useState(1);
  const [groupName, setGroupName] = useState('');
  const [childName, setChildName] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleFinish() {
    if (!userId || !groupName.trim()) return;
    setSaving(true);
    try {
      // Create group (requires online — can't queue this)
      const { data: group, error: groupErr } = await supabase.from('coparenting_groups').insert({ name: groupName.trim(), created_by: userId }).select('id').single();
      if (groupErr || !group) throw new Error(groupErr?.message || 'Erro ao criar grupo');

      // Add member
      const { error: memberErr } = await supabase.from('group_members').insert({ group_id: group.id, user_id: userId, role: 'admin' });
      if (memberErr) throw new Error(memberErr.message);

      // Add child if provided
      if (childName.trim()) {
        const { error: childErr } = await supabase.from('children').insert({
          group_id: group.id, full_name: childName.trim(),
          birth_date: childBirthDate || getBrazilToday(),
        });
        if (childErr) console.warn('Child creation failed:', childErr.message);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await useAuth.getState().loadActiveGroup();
      router.replace('/(tabs)');
    } catch (e: any) {
      Alert.alert('Erro', e.message || 'Nao foi possivel criar o grupo');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setSaving(false);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: spacing['3xl'] }}>
        {step === 1 ? (
          <>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: spacing.xl }}>🏠</Text>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center' }}>
              Bem-vindo ao Kindar!
            </Text>
            <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing['3xl'] }}>
              Vamos configurar seu grupo familiar
            </Text>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Nome do grupo</Text>
            <TextInput value={groupName} onChangeText={setGroupName} placeholder="Ex: Familia Silva" placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.xl }} />
            <TouchableOpacity onPress={() => { if (groupName.trim()) setStep(2); }} disabled={!groupName.trim()}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', opacity: groupName.trim() ? 1 : 0.4 }}>
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Continuar</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ fontSize: 40, textAlign: 'center', marginBottom: spacing.xl }}>👶</Text>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, textAlign: 'center' }}>
              Adicione uma crianca
            </Text>
            <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing['3xl'] }}>
              Opcional — pode adicionar depois
            </Text>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Nome da crianca</Text>
            <TextInput value={childName} onChangeText={setChildName} placeholder="Nome completo" placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Data de nascimento</Text>
            <TextInput value={childBirthDate} onChangeText={setChildBirthDate} placeholder="AAAA-MM-DD" placeholderTextColor={colors.textDim}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.xl }} />
            <TouchableOpacity onPress={handleFinish} disabled={saving}
              style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.lg, alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>Finalizar</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleFinish} disabled={saving} style={{ alignItems: 'center', marginTop: spacing.lg }}>
              <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>Pular por agora</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
