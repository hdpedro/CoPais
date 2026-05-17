/**
 * Novo Evento — formulario nativo (substitui o WebView).
 *
 * Mirrors the "event" branch of PWA NewCompromissoForm
 * (src/app/(app)/calendario/novo/NewCompromissoForm.tsx).
 *
 * Field set ported from PWA `createEvent` action (src/actions/events.ts):
 *   title, description, event_date, end_date, event_time, all_day,
 *   location, child_id, assigned_to, created_by.
 *
 * Multi-day handled via the same expansion logic as PWA: one row per day,
 * title suffixed `(i/N)`. Single-day path preserves the existing
 * createEvent fast-path.
 *
 * Recurrence (Diaria/Semanal/Quinzenal/Mensal/Personalizada):
 *   the `events` table has NO recurrence columns (verified against
 *   migrations 00008, 00024). The PWA event branch also has no recurrence
 *   UI — it uses multi-day instead. We mirror that exactly: expose
 *   "evento de varios dias" as the recurrence-equivalent and surface a
 *   note pointing users to the activity flow (PWA-only) for true
 *   recurrence.
 *
 * Color picker:
 *   the `events` table has no color column. PWA paints events by
 *   responsavel (assigned_to → custody color). We render a read-only
 *   color preview tied to the chosen responsavel so users see how the
 *   event will look on the calendar without lying about persistence.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createEvent } from 'src/services/events';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, TimePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

interface ChildOption { id: string; full_name: string; }
interface MemberOption { user_id: string; name: string; }

// Custody colors — the PWA renders events tinted by `assigned_to`, using the
// same palette as `colors.custody` (Lar A = sage, Lar B = terracota). For the
// "outro" case we fall back to a neutral grey so the preview is still useful.
const RESPONSIBLE_COLORS = [
  colors.custody.primary,     // first parent (creator)
  colors.custody.secondary,   // co-parent
  colors.violet,              // 3rd member (rare)
  colors.accent,              // 4th
] as const;

export default function NovoEventoScreen() {
  const t = useI18n(s => s.t);
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  // Aceita ?date=YYYY-MM-DD (ex: clicar dia vazio no calendario abre
  // este form ja com a data escolhida). Default: hoje.
  const params = useLocalSearchParams<{ date?: string }>();
  const initialDateIso = (() => {
    const raw = typeof params.date === 'string' ? params.date : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dateToIso(new Date());
  })();

  // ── Form state (mirrors PWA event branch) ─────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [startDateIso, setStartDateIso] = useState<string>(initialDateIso);
  const [endDateIso, setEndDateIso] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null); // optional, kept for parity
  const [location, setLocation] = useState('');

  // Children + members loaded from Supabase
  const [children, setChildren] = useState<ChildOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [assignedToId, setAssignedToId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; date?: string; general?: string }>({});

  // ── Initial load ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeGroup || !userId) return;
    let cancelled = false;
    (async () => {
      const [{ data: childRows }, { data: memberRows }] = await Promise.all([
        supabase
          .from('children').select('id, full_name')
          .eq('group_id', activeGroup.groupId).order('birth_date'),
        supabase
          .from('group_members')
          .select('user_id, profiles(full_name, display_name)')
          .eq('group_id', activeGroup.groupId),
      ]);
      if (cancelled) return;
      setChildren(childRows ?? []);
      const memberList = ((memberRows as Array<{
        user_id: string;
        profiles: { full_name?: string | null; display_name?: string | null } | null;
      }> | null) ?? []).map(m => ({
        user_id: m.user_id,
        name: (m.profiles?.display_name
          || m.profiles?.full_name?.split(' ')[0]
          || 'Co-responsavel'),
      }));
      setMembers(memberList);
      // assignedTo começa null. UX antiga auto-selecionava o user atual, o que
      // forçava Amanda (admin) a aparecer como responsável de FÉRIAS do filho —
      // não fazia sentido. Bug Amanda 2026-05-14: agora "Quem leva" é
      // opcional. Pra eventos onde o responsável segue a escala (férias, feriados
      // recorrentes), basta deixar em branco.
    })();
    return () => { cancelled = true; };
  }, [activeGroup, userId]);

  // ── Toggle: multi-day implies all-day in PWA ──────────────────────────
  function handleMultiDayToggle(next: boolean) {
    Haptics.selectionAsync();
    setMultiDay(next);
    if (next) {
      setAllDay(true);
      if (!endDateIso) setEndDateIso(startDateIso);
    } else {
      setEndDateIso(null);
    }
  }

  function handleAllDayToggle(next: boolean) {
    Haptics.selectionAsync();
    setAllDay(next);
    if (next) {
      setStartTime(null);
      setEndTime(null);
    }
  }

  // ── Validation ────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Titulo obrigatorio';
    if (!startDateIso) next.date = 'Data obrigatoria';
    if (multiDay && endDateIso && endDateIso < startDateIso) {
      next.date = 'Data final deve ser depois da inicial';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // ── Save ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!userId || !activeGroup) return;
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      const result = await createEvent({
        groupId: activeGroup.groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        eventDate: startDateIso,
        endDate: multiDay && endDateIso ? endDateIso : undefined,
        eventTime: !allDay && startTime ? startTime : undefined,
        location: location.trim() || undefined,
        allDay,
        childId: selectedChildId || undefined,
        assignedTo: assignedToId,
        createdBy: userId,
      });
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setErrors({ general: result.error || 'Erro ao salvar evento' });
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors({ general: e instanceof Error ? e.message : 'Erro inesperado' });
    } finally {
      setSaving(false);
    }
  }

  // ── Color preview (driven by chosen responsavel) ──────────────────────
  const responsibleIndex = members.findIndex(m => m.user_id === assignedToId);
  const previewColor = responsibleIndex >= 0
    ? RESPONSIBLE_COLORS[responsibleIndex % RESPONSIBLE_COLORS.length]
    : colors.textMuted;

  const canSubmit = !!title.trim() && !!startDateIso && !saving;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScreenHeader title={t('newForm.headerTitle')} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {errors.general ? (
          <View style={{
            backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1,
            borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
            flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
          }}>
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={{ color: colors.error, fontSize: font.sizes.sm, flex: 1 }}>{errors.general}</Text>
          </View>
        ) : null}

        {/* ── Title ──────────────────────────────────────────── */}
        <FieldLabel>Titulo *</FieldLabel>
        <TextInput
          testID="event-title"
          value={title}
          onChangeText={(v) => { setTitle(v); if (errors.title) setErrors({ ...errors, title: undefined }); }}
          placeholder="Festa de aniversario, reuniao escolar..."
          placeholderTextColor={colors.textDim}
          style={fieldStyle(!!errors.title)}
        />
        {errors.title ? <FieldError>{errors.title}</FieldError> : null}

        {/* ── Description ────────────────────────────────────── */}
        <View style={{ marginTop: spacing.lg }}>
          <FieldLabel>Descricao</FieldLabel>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Detalhes do evento (opcional)"
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            style={[fieldStyle(false), { minHeight: 80, textAlignVertical: 'top' }]}
          />
        </View>

        {/* ── All-day toggle ─────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <ToggleRow
            testID="event-allday-toggle"
            label="Dia inteiro"
            description="Sem horario especifico"
            value={allDay}
            onValueChange={handleAllDayToggle}
          />
          <ToggleRow
            label="Evento de varios dias"
            description="Cria uma entrada para cada dia (1/N, 2/N...)"
            value={multiDay}
            onValueChange={handleMultiDayToggle}
          />
        </View>

        {/* ── Dates ──────────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <View testID="event-start-date">
            <DatePickerField
              label={multiDay ? 'Data inicial *' : 'Data *'}
              value={startDateIso}
              onChange={(iso) => {
                setStartDateIso(iso);
                if (errors.date) setErrors({ ...errors, date: undefined });
                // Keep end >= start
                if (multiDay && endDateIso && endDateIso < iso) setEndDateIso(iso);
              }}
            />
          </View>
          {multiDay ? (
            <DatePickerField
              label="Data final *"
              value={endDateIso}
              onChange={setEndDateIso}
              minimumDate={startDateIso ? new Date(startDateIso + 'T12:00:00') : undefined}
            />
          ) : null}
          {errors.date ? <FieldError>{errors.date}</FieldError> : null}
        </View>

        {/* ── Times (when not all-day) ───────────────────────── */}
        {!allDay ? (
          <View style={{ marginTop: spacing.xl, flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <TimePickerField label="Hora inicial" value={startTime} onChange={setStartTime} />
            </View>
            <View style={{ flex: 1 }}>
              <TimePickerField label="Hora final" value={endTime} onChange={setEndTime} />
            </View>
          </View>
        ) : null}

        {/* ── Children selector ──────────────────────────────── */}
        {children.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <FieldLabel>Para quem</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              <Chip
                selected={selectedChildId === null}
                color={colors.brand}
                label="Familia"
                onPress={() => setSelectedChildId(null)}
              />
              {children.map(c => (
                <Chip
                  key={c.id}
                  selected={selectedChildId === c.id}
                  color={colors.brand}
                  label={c.full_name.split(' ')[0]}
                  onPress={() => setSelectedChildId(c.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Responsavel selector ──────────────────────────────
             Bug Amanda 2026-05-14: o seletor era visualmente
             "obrigatório" (chips sem opção de limpar). Agora é
             explicitamente opcional: chip selecionado vira toggle off
             ao tocar de novo, e helper text explica quando deixar vazio.
             Pra férias / feriados, o responsável segue a escala vigente. */}
        {members.length > 1 ? (
          <View style={{ marginTop: spacing.xl }}>
            <FieldLabel>Quem leva / responsável (opcional)</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              {members.map((m, idx) => {
                const c = RESPONSIBLE_COLORS[idx % RESPONSIBLE_COLORS.length];
                const isSelected = assignedToId === m.user_id;
                return (
                  <Chip
                    key={m.user_id}
                    selected={isSelected}
                    color={c}
                    label={m.name}
                    onPress={() => setAssignedToId(isSelected ? null : m.user_id)}
                  />
                );
              })}
            </View>

            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 }}>
              Deixe em branco para eventos sem responsável fixo (ex: reunião
              de pais, festa). Pra <Text style={{ fontWeight: font.weights.semibold }}>férias / recesso prolongado</Text>{' '}
              use o botão <Text style={{ fontStyle: 'italic' }}>✈️ Férias</Text> no calendário —
              esse fluxo sobrepõe a escala regular automaticamente.
            </Text>

            {/* Color preview — events are tinted by responsavel on calendar */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
              backgroundColor: colors.bgElevated, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.borderLight,
            }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: previewColor }} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, flex: 1 }}>
                {assignedToId ? 'Cor no calendário (definida pelo responsável)' : 'Sem responsável fixo — cor neutra'}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Location ───────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <FieldLabel>Local</FieldLabel>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="Endereco, escola, salao..."
            placeholderTextColor={colors.textDim}
            style={fieldStyle(false)}
          />
        </View>

        {/* ── Recurrence note (events table has no recurrence columns) ── */}
        <View testID="event-recurrence" style={{
          marginTop: spacing.xl,
          backgroundColor: colors.bgElevated, borderRadius: radius.md,
          borderWidth: 1, borderColor: colors.borderLight, padding: spacing.lg,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Ionicons name="repeat-outline" size={18} color={colors.textSecondary} />
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
              Recorrencia
            </Text>
          </View>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, lineHeight: 16 }}>
            Eventos recorrentes (Diaria, Semanal, Quinzenal, Mensal, Personalizada)
            estao disponiveis apenas no PWA. Para repetir um evento por varios dias
            seguidos, ative &quot;Evento de varios dias&quot; acima.
          </Text>
        </View>

        {/* ── Save ───────────────────────────────────────────── */}
        <TouchableOpacity
          testID="event-save"
          onPress={handleSave}
          disabled={!canSubmit}
          style={{
            marginTop: spacing['2xl'],
            backgroundColor: canSubmit ? colors.brand : colors.bgElevated,
            borderRadius: radius.md, paddingVertical: spacing.lg,
            alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
            borderWidth: canSubmit ? 0 : 1, borderColor: colors.borderLight,
          }}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color={canSubmit ? '#fff' : colors.textMuted} />
              <Text style={{
                color: canSubmit ? '#fff' : colors.textMuted,
                fontSize: font.sizes.md, fontWeight: font.weights.bold,
              }}>
                Salvar evento
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Local UI helpers ───────────────────────────────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontSize: font.sizes.sm, fontWeight: font.weights.medium,
      color: colors.text, marginBottom: spacing.xs,
    }}>
      {children}
    </Text>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: font.sizes.xs, color: colors.error, marginTop: 4 }}>
      {children}
    </Text>
  );
}

function fieldStyle(hasError: boolean) {
  return {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: hasError ? colors.error : colors.borderLight,
    padding: spacing.lg,
    fontSize: font.sizes.md,
    color: colors.text,
  } as const;
}

interface ChipProps {
  selected: boolean;
  color: string;
  label: string;
  onPress: () => void;
}

function Chip({ selected, color, label, onPress }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={() => { Haptics.selectionAsync(); onPress(); }}
      style={{
        paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
        borderRadius: radius.full,
        backgroundColor: selected ? color : colors.bgElevated,
        borderWidth: 1, borderColor: selected ? color : colors.borderLight,
      }}
    >
      <Text style={{
        fontSize: font.sizes.sm,
        color: selected ? '#fff' : colors.text,
        fontWeight: selected ? font.weights.semibold : font.weights.normal,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  testID?: string;
}

function ToggleRow({ label, description, value, onValueChange, testID }: ToggleRowProps) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      paddingVertical: spacing.sm,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: font.weights.medium }}>
          {label}
        </Text>
        {description ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.brand, false: colors.borderLight }}
        thumbColor="#fff"
      />
    </View>
  );
}
