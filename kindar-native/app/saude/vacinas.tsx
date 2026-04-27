/**
 * Vacinas — Lista de vacinacao + registrar nova.
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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from '../../src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface Vaccine { id: string; vaccine_name: string; dose_label: string | null; administered_date: string; location: string | null; childName: string; }

export default function VacinasScreen() {
  const { userId, activeGroup } = useAuth();
  const [vaccines, setVaccines] = useState<Vaccine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: v }, { data: c }] = await Promise.all([
      supabase.from('vaccination_records').select('id, vaccine_name, dose_label, administered_date, location, children(full_name)')
        .eq('group_id', activeGroup.groupId).order('administered_date', { ascending: false }),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);
    setVaccines((v || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name) })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleCreate() {
    if (!name.trim() || !selectedChild || !userId || !activeGroup) return;
    setSaving(true);
    const result = await safeWrite({
      table: 'vaccination_records', operation: 'insert',
      payload: { group_id: activeGroup.groupId, child_id: selectedChild, vaccine_name: name.trim(), dose_label: dose.trim() || null, administered_date: dateIso, location: location.trim() || null, created_by: userId },
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); setName(''); setDose(''); setDateIso(dateToIso(new Date())); setLocation('');
      load();
    } else { Alert.alert('Erro', result.error || 'Falha'); }
    setSaving(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Vacinas" rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

      {/* OCR carteirinha CTA — atalho para o flow Foto-de-carteirinha */}
      {!showForm ? (
        <TouchableOpacity
          onPress={() => router.push('/saude/vacinas/carteirinha')}
          activeOpacity={0.85}
          style={{
            margin: spacing.lg, marginBottom: 0,
            backgroundColor: colors.brandLight,
            borderRadius: radius.md,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            borderWidth: 1, borderColor: colors.brand + '40',
          }}
        >
          <Ionicons name="camera-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
              Importar da carteirinha
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
              Tire foto da carteirinha — IA preenche tudo
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
        </TouchableOpacity>
      ) : null}

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {children.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
              {children.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setSelectedChild(c.id)} style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: selectedChild === c.id ? colors.brand : colors.bgSurface }}>
                  <Text style={{ fontSize: font.sizes.sm, color: selectedChild === c.id ? '#fff' : colors.text }}>{c.full_name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          <TextInput value={name} onChangeText={setName} placeholder="Nome da vacina" placeholderTextColor={colors.textDim} style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={dose} onChangeText={setDose} placeholder="Dose (ex: 1a dose, reforco)" placeholderTextColor={colors.textDim} style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md }}>
            <View style={{ flex: 1 }}><DatePickerField value={dateIso} onChange={setDateIso} placeholder="Data" maximumDate={new Date()} /></View>
            <TextInput value={location} onChangeText={setLocation} placeholder="Local (opcional)" placeholderTextColor={colors.textDim}
              style={{ flex: 1.2, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
          </View>
          <TouchableOpacity onPress={handleCreate} disabled={saving || !name.trim()} style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', opacity: saving || !name.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>{saving ? 'Salvando...' : 'Registrar vacina'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList data={vaccines} keyExtractor={item => item.id} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (<View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>💉</Text><Text style={{ color: colors.textMuted }}>Nenhuma vacina registrada</Text></View>)}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={{ fontSize: 20 }}>💉</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.vaccine_name}</Text>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{item.childName} · {item.administered_date?.split('-').reverse().join('/')}{item.dose_label ? ` · ${item.dose_label}` : ''}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
