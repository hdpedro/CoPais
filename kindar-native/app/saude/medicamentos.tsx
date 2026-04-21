/**
 * Medicamentos — Lista de medicamentos ativos + criar novo.
 */
import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { notifyAction } from '../../src/services/notify';
import { useAuth } from '../../src/store/auth';
import { getDisplayName, getBrazilToday } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Med { id: string; name: string; dosage: string; frequency: string; status: string; start_date: string; end_date: string | null; reason: string | null; childName: string; child_id: string; }

export default function MedicamentosScreen() {
  const { userId, activeGroup } = useAuth();
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('active_medications').select('id, name, dosage, frequency, status, start_date, end_date, reason, child_id, children(full_name)')
        .eq('group_id', activeGroup.groupId).order('created_at', { ascending: false }),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);
    setMeds((m || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name) })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!name.trim() || !selectedChild || !userId || !activeGroup) return;
    setSaving(true);
    const result = await safeWrite({
      table: 'active_medications', operation: 'insert',
      payload: { group_id: activeGroup.groupId, child_id: selectedChild, name: name.trim(), dosage: dosage.trim() || 'Conforme prescricao', frequency: frequency.trim() || 'Conforme prescricao', start_date: getBrazilToday(), status: 'active', reason: reason.trim() || null, created_by: userId },
    });
    if (result.success) {
      if (!result.queued) notifyAction('health_event_created', activeGroup.groupId, { title: name, childName: children.find(c => c.id === selectedChild)?.full_name?.split(' ')[0] || '', eventType: 'medication' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); setName(''); setDosage(''); setFrequency(''); setReason('');
      load();
    } else { Alert.alert('Erro', result.error || 'Falha ao salvar'); }
    setSaving(false);
  }

  async function handleFinish(id: string) {
    Alert.alert('Finalizar', 'Marcar medicamento como finalizado?', [
      { text: 'Cancelar' },
      { text: 'Finalizar', onPress: async () => {
        await safeWrite({ table: 'active_medications', operation: 'update', payload: { id, status: 'completed', end_date: getBrazilToday() } });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        load();
      }},
    ]);
  }

  const activeMeds = meds.filter(m => m.status === 'active');
  const pastMeds = meds.filter(m => m.status !== 'active');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Medicamentos" rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {children.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
              {children.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setSelectedChild(c.id)}
                  style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: selectedChild === c.id ? colors.brand : colors.bgSurface }}>
                  <Text style={{ fontSize: font.sizes.sm, color: selectedChild === c.id ? '#fff' : colors.text }}>{c.full_name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TextInput value={name} onChangeText={setName} placeholder="Nome do medicamento" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput value={dosage} onChangeText={setDosage} placeholder="Dosagem (ex: 5ml)" placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
            <TextInput value={frequency} onChangeText={setFrequency} placeholder="Frequencia" placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
          </View>
          <TextInput value={reason} onChangeText={setReason} placeholder="Motivo (opcional)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <TouchableOpacity onPress={handleCreate} disabled={saving || !name.trim()}
            style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', opacity: saving || !name.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>{saving ? 'Salvando...' : 'Adicionar medicamento'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList data={[...activeMeds, ...pastMeds]} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>💊</Text><Text style={{ color: colors.textMuted }}>Nenhum medicamento</Text></View>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => item.status === 'active' ? handleFinish(item.id) : undefined} activeOpacity={0.7}
            style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
              flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: item.status === 'active' ? 1 : 0.5 }}>
            <Text style={{ fontSize: 20 }}>{item.status === 'active' ? '💊' : '✅'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{item.childName} · {item.dosage} · {item.frequency}</Text>
              {item.reason ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Motivo: {item.reason}</Text> : null}
            </View>
            {item.status === 'active' ? (
              <View style={{ backgroundColor: `${colors.success}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.success }}>Ativo</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
