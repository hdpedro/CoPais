/**
 * Nova Atividade — cria atividade extracurricular (aula, esporte, consulta recorrente).
 * Mirrors PWA /atividades/nova.
 *
 * Fields persisted to `child_activities`:
 *   group_id, child_id, name, category, recurrence_type, start_date, end_date,
 *   days_of_week (JSON array of indices, e.g. "[1,3,5]" — Sun=0..Sat=6),
 *   time_start, time_end, location, notes, responsible_id, is_active, created_by.
 *
 * Optional checklist items are inserted into `activity_checklist_items`
 * after the master row is created (mirrors PWA `createActivity` action).
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createActivity } from 'src/services/activities';
import { fetchChildren, type Child } from 'src/services/children';
import { ACTIVITY_CATEGORIES, getBrazilToday } from 'src/lib/constants';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

const CAT_LABELS: Record<string, string> = {
  sports: 'Esporte',
  arts: 'Arte',
  music: 'Música',
  education: 'Educação',
  health: 'Saúde',
  therapy: 'Terapia',
  social: 'Social',
  other: 'Outro',
};

// Days mirror PWA's DAY_NAMES order: Sun=0..Sat=6 (`["Dom","Seg","Ter","Qua","Qui","Sex","Sab"]`).
// `days_of_week` is stored as JSON array of indices, matching PWA action.
const DAYS = [
  { idx: 1, label: 'Seg' },
  { idx: 2, label: 'Ter' },
  { idx: 3, label: 'Qua' },
  { idx: 4, label: 'Qui' },
  { idx: 5, label: 'Sex' },
  { idx: 6, label: 'Sab' },
  { idx: 0, label: 'Dom' },
];

const RECURRENCE_OPTS = [
  { value: 'never', label: 'Nenhuma' },
  { value: 'daily', label: 'Diária' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quinzenal' },
  { value: 'monthly', label: 'Mensal' },
];

// Checklist defaults — mirrors PWA `DEFAULT_CHECKLIST_ITEMS` in
// `src/lib/constants.ts:105`. Native ACTIVITY_CATEGORIES uses different
// keys (sports/arts/social) — map them to PWA's keys (sport/art/school).
const DEFAULT_CHECKLIST_ITEMS: Record<string, string[]> = {
  sports: ['Uniforme', 'Tênis/Chuteira', 'Meia', 'Garrafinha de água', 'Toalha', 'Protetor solar'],
  arts: ['Materiais de arte', 'Avental', 'Toalha'],
  music: ['Instrumento', 'Partituras', 'Caderno de música'],
  education: ['Mochila', 'Material escolar', 'Lanche', 'Garrafinha de água'],
  health: ['Carteirinha do plano', 'Documentos', 'Exames anteriores'],
  therapy: ['Caderno de anotações'],
  social: [],
  other: [],
};

interface MemberOption {
  user_id: string;
  name: string;
  role: string;
}

function formatHHMM(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function validHHMM(v: string): boolean {
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const [, h, mi] = m;
  return +h >= 0 && +h <= 23 && +mi >= 0 && +mi <= 59;
}

// "DD/MM/AAAA" → "YYYY-MM-DD" (returns null if input empty or invalid).
function parseBrDate(input: string): string | null {
  if (!input.trim()) return null;
  const m = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const day = +dd, month = +mm;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function formatBrDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function NovaAtividadeScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [childId, setChildId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrence, setRecurrence] = useState('weekly');
  // selectedDays: array of weekday indices (Sun=0..Sat=6) — matches PWA storage.
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [endDateBr, setEndDateBr] = useState(''); // DD/MM/AAAA
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeGroup) return;
    fetchChildren(activeGroup.groupId).then(setChildren);
    // Load group members for the responsible-parent chip selector.
    // Exclude readonly roles (mirrors PWA — they can't be assigned).
    supabase
      .from('group_members')
      .select('user_id, role, profiles(full_name, display_name)')
      .eq('group_id', activeGroup.groupId)
      .neq('role', 'readonly')
      .then(({ data }) => {
        const rows = (data ?? []) as Array<{
          user_id: string;
          role: string;
          profiles: { full_name?: string | null; display_name?: string | null } | null;
        }>;
        setMembers(rows.map(m => ({
          user_id: m.user_id,
          role: m.role,
          name: m.profiles?.display_name
            || m.profiles?.full_name?.split(' ')[0]
            || 'Co-responsável',
        })));
      });
  }, [activeGroup]);

  // Category-change handler — replaces an effect that called setState
  // (eslint react-hooks/set-state-in-effect). Mirrors PWA `handleCategoryChange`.
  function handleCategoryChange(newCategory: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCategory(newCategory);
    setChecklistItems(prev => {
      const isUntouched = prev.length === 0
        || Object.values(DEFAULT_CHECKLIST_ITEMS).some(d =>
          d.length === prev.length && d.every((v, i) => v === prev[i])
        );
      if (!isUntouched) return prev;
      return DEFAULT_CHECKLIST_ITEMS[newCategory] ?? [];
    });
  }

  function toggleDay(idx: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDays(prev => (prev.includes(idx) ? prev.filter(x => x !== idx) : [...prev, idx].sort()));
  }

  function addChecklistItem() {
    const trimmed = newChecklistItem.trim();
    if (!trimmed || checklistItems.includes(trimmed)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setChecklistItems(prev => [...prev, trimmed]);
    setNewChecklistItem('');
  }

  function removeChecklistItem(i: number) {
    Haptics.selectionAsync();
    setChecklistItems(prev => prev.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!activeGroup || !userId) return;
    if (!name.trim()) { setError('Informe o nome da atividade'); return; }
    if (timeStart && !validHHMM(timeStart)) { setError('Horário início inválido (HH:MM)'); return; }
    if (timeEnd && !validHHMM(timeEnd)) { setError('Horário fim inválido (HH:MM)'); return; }
    const showDayPicker = recurrence === 'weekly' || recurrence === 'biweekly';
    if (showDayPicker && selectedDays.length === 0) {
      setError('Selecione ao menos um dia da semana');
      return;
    }
    const endDateIso = endDateBr ? parseBrDate(endDateBr) : null;
    if (endDateBr && !endDateIso) {
      setError('Data fim inválida (DD/MM/AAAA)');
      return;
    }

    setError('');
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Persist days_of_week as JSON array of indices (matches PWA shape).
    const daysJson = showDayPicker && selectedDays.length > 0
      ? JSON.stringify(selectedDays.slice().sort())
      : undefined;

    // createActivity ja insere TODOS os campos (incluindo responsibleId e
    // endDate) e gera calendar_occurrences pre-computadas. Trade-off: nao
    // suporta mais offline-create (perde a queue do safeWrite). Aceitavel
    // porque o cenario "criar atividade sem internet" e raro e era melhor
    // perder isso do que ter activities orfas sem occurrences (bug Hailla
    // 2026-05-07: 4 atividades criadas, nenhuma aparecia no calendario).
    const result = await createActivity({
      groupId: activeGroup.groupId,
      name,
      category,
      childId: childId || undefined,
      recurrenceType: recurrence,
      startDate: getBrazilToday(),
      endDate: endDateIso || null,
      timeStart: timeStart ? `${timeStart}:00` : undefined,
      timeEnd: timeEnd ? `${timeEnd}:00` : undefined,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      daysOfWeek: daysJson,
      responsibleId: responsibleId || null,
      createdBy: userId,
    });

    const fullSuccess = result.success;
    if (result.success && result.id) {
      // Insert checklist items — non-fatal se falhar.
      const itemsToInsert = checklistItems.map((item, i) => ({
        activity_id: result.id,
        name: item.trim(),
        sort_order: i,
      })).filter(r => r.name.length > 0);
      if (itemsToInsert.length > 0) {
        const { error: itemsErr } = await supabase
          .from('activity_checklist_items')
          .insert(itemsToInsert);
        if (itemsErr) {
          console.warn('[atividade] checklist insert failed', itemsErr.message);
        }
      }
    }

    setSaving(false);
    if (fullSuccess) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', 'Não foi possível salvar a atividade.');
    }
  }

  const showDayPicker = recurrence === 'weekly' || recurrence === 'biweekly';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Nova atividade
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={{ backgroundColor: 'rgba(229,57,53,0.06)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(229,57,53,0.2)', padding: spacing.md, marginBottom: spacing.lg }}>
            <Text style={{ color: colors.error, fontSize: font.sizes.sm }}>{error}</Text>
          </View>
        ) : null}

        {/* Name */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Nome *</Text>
        <TextInput
          value={name} onChangeText={setName}
          placeholder="Ex: Judô, Inglês, Natação"
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Category chips */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Categoria</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {ACTIVITY_CATEGORIES.map(c => {
            const active = category === c.value;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => handleCategoryChange(c.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={CAT_LABELS[c.value] || c.value}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {CAT_LABELS[c.value] || c.value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Child selector */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Criança</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          <TouchableOpacity
            onPress={() => setChildId(null)}
            accessibilityRole="radio"
            accessibilityState={{ selected: childId === null }}
            accessibilityLabel="Todas as crianças"
            style={{
              paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
              backgroundColor: childId === null ? colors.brand : colors.bgElevated,
              borderWidth: 1, borderColor: childId === null ? colors.brand : colors.borderLight,
            }}
          >
            <Text style={{ fontSize: font.sizes.sm, color: childId === null ? '#fff' : colors.text, fontWeight: childId === null ? font.weights.semibold : font.weights.normal }}>
              Todas
            </Text>
          </TouchableOpacity>
          {children.map(c => {
            const active = childId === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setChildId(c.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.full_name.split(' ')[0]}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {c.full_name.split(' ')[0]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Recurrence */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Recorrência</Text>
        <View testID="atividade-recurrence" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {RECURRENCE_OPTS.map(r => {
            const active = recurrence === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRecurrence(r.value); }}
                testID={`atividade-recurrence-${r.value}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Recorrência ${r.label}`}
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Days of week (only for weekly/biweekly) */}
        {showDayPicker ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Dias da semana</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.lg }}>
              {DAYS.map(d => {
                const active = selectedDays.includes(d.idx);
                return (
                  <TouchableOpacity
                    key={d.idx}
                    onPress={() => toggleDay(d.idx)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={d.label}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: radius.md, alignItems: 'center',
                      backgroundColor: active ? colors.brand : colors.bgElevated,
                      borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.xs, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.bold : font.weights.medium }}>
                      {d.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Times */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Início</Text>
            <TextInput
              value={timeStart}
              onChangeText={v => setTimeStart(formatHHMM(v))}
              placeholder="HH:MM"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              testID="atividade-time"
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Fim</Text>
            <TextInput
              value={timeEnd}
              onChangeText={v => setTimeEnd(formatHHMM(v))}
              placeholder="HH:MM"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text,
              }}
            />
          </View>
        </View>

        {/* End date (only for recurring activities) */}
        {recurrence !== 'never' ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Data fim (opcional)</Text>
            <TextInput
              value={endDateBr}
              onChangeText={v => setEndDateBr(formatBrDate(v))}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={10}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
              }}
            />
          </>
        ) : null}

        {/* Responsible parent */}
        {members.length > 0 ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Responsável</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync(); setResponsibleId(null); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: responsibleId === null }}
                accessibilityLabel="Sem responsável definido"
                style={{
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                  backgroundColor: responsibleId === null ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: responsibleId === null ? colors.brand : colors.borderLight,
                }}
              >
                <Text style={{ fontSize: font.sizes.sm, color: responsibleId === null ? '#fff' : colors.text, fontWeight: responsibleId === null ? font.weights.semibold : font.weights.normal }}>
                  Sem definir
                </Text>
              </TouchableOpacity>
              {members.map(m => {
                const active = responsibleId === m.user_id;
                return (
                  <TouchableOpacity
                    key={m.user_id}
                    onPress={() => { Haptics.selectionAsync(); setResponsibleId(m.user_id); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={m.name}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                      backgroundColor: active ? colors.brand : colors.bgElevated,
                      borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                      {m.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Checklist items */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Checklist da mochila</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
          Itens para preparar antes da atividade
        </Text>
        {checklistItems.length > 0 ? (
          <View style={{ marginBottom: spacing.sm, gap: 6 }}>
            {checklistItems.map((item, i) => (
              <View
                key={`${item}-${i}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  backgroundColor: colors.bgElevated,
                  borderWidth: 1, borderColor: colors.borderLight,
                  borderRadius: radius.md,
                  paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
                }}
              >
                <View style={{
                  width: 16, height: 16, borderRadius: 4,
                  borderWidth: 1.5, borderColor: colors.border,
                }} />
                <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text }}>{item}</Text>
                <TouchableOpacity onPress={() => removeChecklistItem(i)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Remover item ${item}`}>
                  <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          <TextInput
            value={newChecklistItem}
            onChangeText={setNewChecklistItem}
            onSubmitEditing={addChecklistItem}
            placeholder="Adicionar item..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            style={{
              flex: 1,
              backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
              paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
              fontSize: font.sizes.md, color: colors.text,
            }}
          />
          <TouchableOpacity
            onPress={addChecklistItem}
            disabled={!newChecklistItem.trim()}
            testID="atividade-add-checklist-item"
            accessibilityRole="button"
            accessibilityLabel="Adicionar item ao checklist"
            accessibilityState={{ disabled: !newChecklistItem.trim() }}
            style={{
              paddingHorizontal: spacing.lg, justifyContent: 'center',
              backgroundColor: newChecklistItem.trim() ? colors.brand : colors.borderLight,
              borderRadius: radius.md,
            }}
          >
            <Ionicons name="add" size={22} color={newChecklistItem.trim() ? '#fff' : colors.textDim} />
          </TouchableOpacity>
        </View>

        {/* Location */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Local</Text>
        <TextInput
          value={location} onChangeText={setLocation}
          placeholder="Ex: Clube, escola, casa"
          placeholderTextColor={colors.textMuted}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Notes */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>Observações</Text>
        <TextInput
          value={notes} onChangeText={setNotes}
          placeholder="Professor, material, regras..."
          placeholderTextColor={colors.textMuted}
          multiline
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
            marginBottom: spacing['2xl'],
          }}
        />

        <PrimaryButton
          label="Salvar atividade"
          onPress={handleSave}
          loading={saving}
          disabled={!name.trim()}
          testID="atividade-save"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
