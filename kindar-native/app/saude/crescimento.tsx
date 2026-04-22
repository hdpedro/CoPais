/**
 * Crescimento — Registros de peso/altura/perimetro cefalico.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, react-hooks/preserve-manual-memoization */
import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from '../../src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface GrowthRecord { id: string; measured_date: string; weight_kg: number | null; height_cm: number | null; head_cm: number | null; childName: string; }

export default function CrescimentoScreen() {
  const { userId, activeGroup } = useAuth();
  const [records, setRecords] = useState<GrowthRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCm, setHeadCm] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('growth_records').select('id, measured_date, weight_kg, height_cm, head_cm, children(full_name)')
        .eq('group_id', activeGroup.groupId).order('measured_date', { ascending: false }),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);
    setRecords((r || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name) })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if ((!weight && !height && !headCm) || !selectedChild || !userId || !activeGroup) { Alert.alert('Preencha ao menos um campo', 'Peso, altura ou perimetro cefalico'); return; }
    setSaving(true);
    const result = await safeWrite({
      table: 'growth_records', operation: 'insert',
      payload: {
        group_id: activeGroup.groupId, child_id: selectedChild, measured_date: dateIso,
        weight_kg: weight ? parseFloat(weight.replace(',', '.')) : null,
        height_cm: height ? parseFloat(height.replace(',', '.')) : null,
        head_cm: headCm ? parseFloat(headCm.replace(',', '.')) : null,
        created_by: userId,
      },
    });
    if (result.success) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setShowForm(false); setWeight(''); setHeight(''); setHeadCm(''); setDateIso(dateToIso(new Date())); load(); }
    else { Alert.alert('Erro', result.error || 'Falha'); }
    setSaving(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Crescimento" rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />
      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {children.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
              {children.map(c => (<TouchableOpacity key={c.id} onPress={() => setSelectedChild(c.id)} style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: selectedChild === c.id ? colors.brand : colors.bgSurface }}><Text style={{ fontSize: font.sizes.sm, color: selectedChild === c.id ? '#fff' : colors.text }}>{c.full_name.split(' ')[0]}</Text></TouchableOpacity>))}
            </View>
          ) : null}
          <View style={{ marginBottom: spacing.sm }}>
            <DatePickerField value={dateIso} onChange={setDateIso} placeholder="Data da medida" maximumDate={new Date()} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput value={weight} onChangeText={setWeight} placeholder="Peso (kg)" keyboardType="decimal-pad" placeholderTextColor={colors.textDim} style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
            <TextInput value={height} onChangeText={setHeight} placeholder="Altura (cm)" keyboardType="decimal-pad" placeholderTextColor={colors.textDim} style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
          </View>
          <TextInput value={headCm} onChangeText={setHeadCm} placeholder="Perimetro cefalico (cm) — opcional" keyboardType="decimal-pad" placeholderTextColor={colors.textDim} style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <TouchableOpacity onPress={handleCreate} disabled={saving} style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', opacity: saving ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>{saving ? 'Salvando...' : 'Registrar medida'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList data={records} keyExtractor={item => item.id} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (<View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>📏</Text><Text style={{ color: colors.textMuted }}>Nenhuma medida</Text></View>)}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 20 }}>📏</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.childName} — {item.measured_date?.split('-').reverse().join('/')}</Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {item.weight_kg ? `${item.weight_kg}kg` : ''}{item.weight_kg && item.height_cm ? ' · ' : ''}{item.height_cm ? `${item.height_cm}cm` : ''}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
