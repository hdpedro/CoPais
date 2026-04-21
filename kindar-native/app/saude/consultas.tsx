/**
 * Consultas — Lista de consultas + criar nova.
 */
import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { notifyAction } from '../../src/services/notify';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Appt { id: string; title: string; appointment_date: string; location: string | null; status: string; notes: string | null; childName: string; profName: string | null; child_id: string; }

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: '#3b82f6' }, completed: { label: 'Realizada', color: '#4CAF50' }, cancelled: { label: 'Cancelada', color: '#8A8A8A' },
};

export default function ConsultasScreen() {
  const { userId, activeGroup } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from('medical_appointments').select('id, title, appointment_date, location, status, notes, child_id, children(full_name), medical_professionals(name)')
        .eq('group_id', activeGroup.groupId).order('appointment_date', { ascending: false }).limit(50),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);
    setAppts((a || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name), profName: x.medical_professionals?.name || null })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!title.trim() || !selectedChild || !userId || !activeGroup) return;
    setSaving(true);
    const result = await safeWrite({
      table: 'medical_appointments', operation: 'insert',
      payload: { group_id: activeGroup.groupId, child_id: selectedChild, title: title.trim(), appointment_date: new Date().toISOString(), location: location.trim() || null, status: 'scheduled', notes: notes.trim() || null, created_by: userId },
    });
    if (result.success) {
      if (!result.queued) notifyAction('health_event_created', activeGroup.groupId, { title: title, childName: children.find(c => c.id === selectedChild)?.full_name?.split(' ')[0] || '', eventType: 'appointment' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); setTitle(''); setLocation(''); setNotes('');
      load();
    } else { Alert.alert('Erro', result.error || 'Falha'); }
    setSaving(false);
  }

  async function handleComplete(id: string) {
    await safeWrite({ table: 'medical_appointments', operation: 'update', payload: { id, status: 'completed' } });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Consultas" rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

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
          <TextInput value={title} onChangeText={setTitle} placeholder="Tipo (Pediatra, Dentista...)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={location} onChangeText={setLocation} placeholder="Local (opcional)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={notes} onChangeText={setNotes} placeholder="Observacoes (opcional)" placeholderTextColor={colors.textDim} multiline
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md, minHeight: 60 }} />
          <TouchableOpacity onPress={handleCreate} disabled={saving || !title.trim()}
            style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', opacity: saving || !title.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>{saving ? 'Salvando...' : 'Registrar consulta'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList data={appts} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>🏥</Text><Text style={{ color: colors.textMuted }}>Nenhuma consulta</Text></View>
        )}
        renderItem={({ item }) => {
          const st = STATUS_COLORS[item.status] || STATUS_COLORS.scheduled;
          const date = new Date(item.appointment_date);
          return (
            <TouchableOpacity onPress={() => item.status === 'scheduled' ? handleComplete(item.id) : undefined} activeOpacity={0.7}
              style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Text style={{ fontSize: 20 }}>🏥</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.title}</Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                  {item.childName} · {date.toLocaleDateString('pt-BR')}{item.location ? ` · ${item.location}` : ''}{item.profName ? ` · ${item.profName}` : ''}
                </Text>
              </View>
              <View style={{ backgroundColor: `${st.color}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                <Text style={{ fontSize: font.sizes.xs, color: st.color, fontWeight: font.weights.medium }}>{st.label}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
