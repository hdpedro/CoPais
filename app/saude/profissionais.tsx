/**
 * Profissionais de Saude — Lista + criar.
 */
import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { useAuth } from '../../src/store/auth';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Professional { id: string; name: string; specialty: string; phone: string | null; address: string | null; crm: string | null; }

export default function ProfissionaisScreen() {
  const { userId, activeGroup } = useAuth();
  const [profs, setProfs] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase.from('medical_professionals').select('id, name, specialty, phone, address, crm').eq('group_id', activeGroup.groupId).order('name');
    setProfs(data || []);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!name.trim() || !specialty.trim() || !userId || !activeGroup) return;
    setSaving(true);
    const result = await safeWrite({
      table: 'medical_professionals', operation: 'insert',
      payload: { group_id: activeGroup.groupId, name: name.trim(), specialty: specialty.trim(), phone: phone.trim() || null, created_by: userId },
    });
    if (result.success) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setShowForm(false); setName(''); setSpecialty(''); setPhone(''); load(); }
    else { Alert.alert('Erro', result.error || 'Falha'); }
    setSaving(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Profissionais" rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />
      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          <TextInput value={name} onChangeText={setName} placeholder="Nome do profissional" placeholderTextColor={colors.textDim} style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={specialty} onChangeText={setSpecialty} placeholder="Especialidade" placeholderTextColor={colors.textDim} style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={phone} onChangeText={setPhone} placeholder="Telefone (opcional)" keyboardType="phone-pad" placeholderTextColor={colors.textDim} style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <TouchableOpacity onPress={handleCreate} disabled={saving || !name.trim() || !specialty.trim()} style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', opacity: saving || !name.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>{saving ? 'Salvando...' : 'Adicionar profissional'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList data={profs} keyExtractor={item => item.id} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (<View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>👨‍⚕️</Text><Text style={{ color: colors.textMuted }}>Nenhum profissional</Text></View>)}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 20 }}>👨‍⚕️</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{item.specialty}{item.phone ? ` · ${item.phone}` : ''}{item.crm ? ` · CRM ${item.crm}` : ''}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
