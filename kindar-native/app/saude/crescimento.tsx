/**
 * Crescimento — Registros de peso/altura/perimetro cefalico.
 *
 * 2026-05-05: hardening pós-bug report
 *   - synchronous ref guard contra double-tap duplicando registro
 *   - tap pra editar (carrega no form), long-press pra excluir
 *   - chave de FlatList agora estavel via id (era spread perigoso antes)
 */
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../src/lib/supabase';
import { safeWrite } from '../../src/services/offline';
import { useAuth } from '../../src/store/auth';
import { getDisplayName } from '../../src/lib/constants';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import Toast from '../../src/components/ui/Toast';
import { DatePickerField, dateToIso } from '../../src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface GrowthRecord {
  id: string;
  child_id: string;
  measured_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
  childName: string;
}

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; variant?: 'success' | 'error' } | null>(null);

  // Synchronous guard against double-tap duplication. setState is async,
  // so disabled={saving} alone allows ~2-3 taps to slip through before
  // React rerenders the disabled state. A ref blocks the second call
  // immediately. Cleared after the network round-trip.
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('growth_records').select('id, child_id, measured_date, weight_kg, height_cm, head_cm, children(full_name)')
        .eq('group_id', activeGroup.groupId).order('measured_date', { ascending: false }),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);
    setRecords((r || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name) })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime: refletir mudancas vindas de outro dispositivo (ou do
  // co-pai) sem precisar refresh manual. Filtra por group_id pra nao
  // receber broadcast de outros grupos.
  useEffect(() => {
    if (!activeGroup) return;
    const ch = supabase
      .channel(`growth:list:${activeGroup.groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'growth_records', filter: `group_id=eq.${activeGroup.groupId}` },
        () => load(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeGroup?.groupId, load]);

  function resetForm() {
    setEditingId(null);
    setWeight('');
    setHeight('');
    setHeadCm('');
    setDateIso(dateToIso(new Date()));
  }

  function startEdit(record: GrowthRecord) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(record.id);
    setSelectedChild(record.child_id);
    setWeight(record.weight_kg?.toString().replace('.', ',') || '');
    setHeight(record.height_cm?.toString().replace('.', ',') || '');
    setHeadCm(record.head_cm?.toString().replace('.', ',') || '');
    setDateIso(record.measured_date);
    setShowForm(true);
  }

  async function handleSubmit() {
    // Sync guard — kicks in BEFORE state propagation so a 2nd rapid tap
    // is dropped immediately.
    if (submittingRef.current) return;
    if ((!weight && !height && !headCm) || !selectedChild || !userId || !activeGroup) {
      Alert.alert('Preencha ao menos um campo', 'Peso, altura ou perimetro cefalico');
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const payload = {
        group_id: activeGroup.groupId,
        child_id: selectedChild,
        measured_date: dateIso,
        weight_kg: weight ? parseFloat(weight.replace(',', '.')) : null,
        height_cm: height ? parseFloat(height.replace(',', '.')) : null,
        head_cm: headCm ? parseFloat(headCm.replace(',', '.')) : null,
        created_by: userId,
      };
      const result = editingId
        ? await safeWrite({ table: 'growth_records', operation: 'update', payload: { id: editingId, ...payload } })
        : await safeWrite({ table: 'growth_records', operation: 'insert', payload });
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowForm(false);
        resetForm();
        await load();
      } else {
        Alert.alert('Erro', result.error || 'Falha');
      }
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  function handleDelete(record: GrowthRecord) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const summary = [
      record.weight_kg ? `${record.weight_kg}kg` : null,
      record.height_cm ? `${record.height_cm}cm` : null,
      record.head_cm ? `PC ${record.head_cm}cm` : null,
    ].filter(Boolean).join(' · ');
    const dateBr = record.measured_date.split('-').reverse().join('/');
    Alert.alert(
      'Excluir registro de crescimento?',
      `${record.childName} · ${dateBr}${summary ? `\n${summary}` : ''}\n\nEsta acao nao pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const r = await safeWrite({ table: 'growth_records', operation: 'delete', payload: { id: record.id } });
            if (r.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setToast({ msg: `Registro de ${dateBr} removido`, variant: 'success' });
              await load();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              setToast({ msg: r.error || 'Nao consegui excluir. Tente de novo.', variant: 'error' });
            }
          },
        },
      ],
    );
  }

  function toggleForm() {
    if (showForm) {
      resetForm();
    }
    setShowForm(!showForm);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Crescimento" rightAction={{ icon: showForm ? 'close' : 'add', onPress: toggleForm }} />
      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {editingId ? (
            <View style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="create-outline" size={14} color={colors.brand} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Editando medida
              </Text>
            </View>
          ) : null}
          {children.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
              {children.map(c => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedChild(c.id)}
                  style={{
                    paddingVertical: spacing.xs, paddingHorizontal: spacing.md,
                    borderRadius: radius.full,
                    backgroundColor: selectedChild === c.id ? colors.brand : colors.bgSurface,
                  }}
                >
                  <Text style={{ fontSize: font.sizes.sm, color: selectedChild === c.id ? '#fff' : colors.text }}>
                    {c.full_name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <View style={{ marginBottom: spacing.sm }}>
            <DatePickerField value={dateIso} onChange={setDateIso} placeholder="Data da medida" maximumDate={new Date()} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput value={weight} onChangeText={setWeight} placeholder="Peso (kg)" keyboardType="decimal-pad" placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
            <TextInput value={height} onChangeText={setHeight} placeholder="Altura (cm)" keyboardType="decimal-pad" placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
          </View>
          <TextInput value={headCm} onChangeText={setHeadCm} placeholder="Perímetro cefálico (cm) — opcional" keyboardType="decimal-pad" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={saving}
            style={{
              backgroundColor: colors.brand, borderRadius: radius.md,
              paddingVertical: spacing.md, alignItems: 'center',
              opacity: saving ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>
              {saving ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Registrar medida')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        data={records}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.md }}>📏</Text>
            <Text style={{ color: colors.textMuted }}>Nenhuma medida</Text>
          </View>
        )}
        ListHeaderComponent={records.length > 0 ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm, textAlign: 'center' }}>
            Toque para editar · Pressione e segure para excluir
          </Text>
        ) : null}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => startEdit(item)}
            onLongPress={() => handleDelete(item)}
            delayLongPress={400}
            activeOpacity={0.7}
            style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg,
              marginBottom: spacing.sm, ...shadows.sm,
              flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              borderWidth: editingId === item.id ? 2 : 0,
              borderColor: editingId === item.id ? colors.brand : 'transparent',
            }}
          >
            <Text style={{ fontSize: 20 }}>📏</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>
                {item.childName} — {item.measured_date?.split('-').reverse().join('/')}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>
                {item.weight_kg ? `${item.weight_kg}kg` : ''}
                {item.weight_kg && item.height_cm ? ' · ' : ''}
                {item.height_cm ? `${item.height_cm}cm` : ''}
                {item.head_cm ? `${(item.weight_kg || item.height_cm) ? ' · ' : ''}PC ${item.head_cm}cm` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
          </TouchableOpacity>
        )}
      />
      <Toast value={toast} onClear={() => setToast(null)} />
    </View>
  );
}
