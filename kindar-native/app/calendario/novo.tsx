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
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createEvent, MULTI_DAY_EVENT_CAP } from 'src/services/events';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, TimePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font } from 'src/design-system/tokens';

interface ChildOption { id: string; full_name: string; }
interface MemberOption { user_id: string; name: string; }

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

/** Campos extraídos de uma foto de convite (form-fill do Brain, C3). */
interface InvitePlanFields {
  title?: unknown;
  description?: unknown;
  eventDate?: unknown;
  endDate?: unknown;
  timeStart?: unknown;
  timeEnd?: unknown;
  location?: unknown;
  childId?: unknown;
}

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
          || t('calendarTab.coResponsible')),
      }));
      setMembers(memberList);
      // assignedTo começa null. UX antiga auto-selecionava o user atual, o que
      // forçava Amanda (admin) a aparecer como responsável de FÉRIAS do filho —
      // não fazia sentido. Bug Amanda 2026-05-14: agora "Quem leva" é
      // opcional. Pra eventos onde o responsável segue a escala (férias, feriados
      // recorrentes), basta deixar em branco.
    })();
    return () => { cancelled = true; };
  }, [activeGroup, userId, t]);

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

  // ── Preencher com convite (form-fill do Brain, C3) ────────────────────
  // O servidor decide se o botão aparece (flag própria + beta do grupo).
  // Extração é PURA: nada é criado — o usuário revisa e salva pelo form.
  const [inviteEnabled, setInviteEnabled] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteNote, setInviteNote] = useState<'done' | 'fail' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) return;
        const res = await fetch(`${WEB_URL}/api/ai/assistant/invite-extract`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const d = await res.json().catch(() => null);
        if (!cancelled && d?.enabled === true) setInviteEnabled(true);
      } catch {
        // Sem rede/flag → o botão simplesmente não aparece.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function fillFromInvite() {
    if (inviteBusy) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const a = picked.assets[0];
    setInviteBusy(true);
    setInviteNote(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('sessão expirada');
      const fd = new FormData();
      // RN FormData: {uri, name, type} vira o arquivo no multipart.
      fd.append('file', {
        uri: a.uri,
        name: a.fileName || `convite-${Date.now()}.jpg`,
        type: a.mimeType || 'image/jpeg',
      } as unknown as Blob);
      const res = await fetch(`${WEB_URL}/api/ai/assistant/invite-extract`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }, // sem Content-Type manual: o RN põe o boundary
        body: fd,
      });
      const data = await res.json().catch(() => null);
      const plan: InvitePlanFields | null = data?.found === true && data.plan ? data.plan : null;
      if (plan && typeof plan.title === 'string' && typeof plan.eventDate === 'string') {
        setTitle(plan.title);
        setDescription(typeof plan.description === 'string' ? plan.description : '');
        setStartDateIso(plan.eventDate);
        if (typeof plan.endDate === 'string' && plan.endDate) {
          // Espelha o form: vários dias força dia inteiro.
          setMultiDay(true);
          setAllDay(true);
          setEndDateIso(plan.endDate);
          setStartTime(null);
          setEndTime(null);
        } else {
          setMultiDay(false);
          setEndDateIso(null);
          if (typeof plan.timeStart === 'string' && plan.timeStart) {
            setAllDay(false);
            setStartTime(plan.timeStart);
            setEndTime(typeof plan.timeEnd === 'string' ? plan.timeEnd : null);
          } else {
            setAllDay(true);
            setStartTime(null);
            setEndTime(null);
          }
        }
        setLocation(typeof plan.location === 'string' ? plan.location : '');
        if (typeof plan.childId === 'string' && children.some(c => c.id === plan.childId)) {
          setSelectedChildId(plan.childId);
        }
        setErrors({});
        setInviteNote('done');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setInviteNote('fail');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } catch {
      setInviteNote('fail');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setInviteBusy(false);
    }
  }

  // ── Validation ────────────────────────────────────────────────────────
  function validate(): boolean {
    const next: typeof errors = {};
    if (!title.trim()) next.title = t('validation.field.titleRequired');
    if (!startDateIso) {
      next.date = t('calendarNew.errorDateRequired');
    } else if (startDateIso < dateToIso(new Date())) {
      // Evento e' prospectivo: nao deixa criar numa data que ja passou
      // (bug 2026-06-04: deu pra salvar 04/06/2003). Comparacao de strings
      // YYYY-MM-DD == comparacao cronologica. O minimumDate do picker ja
      // previne na UI; este guard cobre o ?date= vindo de tocar num dia
      // passado do calendario.
      next.date = t('calendarNew.errorDatePast');
    }
    if (multiDay && endDateIso && endDateIso < startDateIso) {
      next.date = t('calendar.vacations.formInvalidRange');
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
        setErrors({ general: result.error || t('calendarNew.errorSave') });
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors({ general: e instanceof Error ? e.message : t('calendarNew.errorUnexpected') });
    } finally {
      setSaving(false);
    }
  }

  // ── Color preview (driven by chosen responsavel) ──────────────────────
  const responsibleIndex = members.findIndex(m => m.user_id === assignedToId);
  const previewColor = responsibleIndex >= 0
    ? RESPONSIBLE_COLORS[responsibleIndex % RESPONSIBLE_COLORS.length]
    : colors.textMuted;

  // Evento de vários dias cria 1 linha por dia, até MULTI_DAY_EVENT_CAP. Se o
  // range escolhido passa disso, avisamos em vez de truncar calado (decisão
  // 2026-06-03, grupo Android). dayCount inclusivo, igual ao service.
  const multiDayRange = (() => {
    if (!multiDay || !startDateIso || !endDateIso || endDateIso < startDateIso) return 0;
    const s = new Date(startDateIso + 'T12:00:00');
    const e = new Date(endDateIso + 'T12:00:00');
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  })();
  const exceedsMultiDayCap = multiDayRange > MULTI_DAY_EVENT_CAP;

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

        {/* ── Preencher com convite (form-fill do Brain, C3) ──── */}
        {inviteEnabled ? (
          <View style={{
            backgroundColor: '#FBEFEC', borderColor: '#F3D9D2', borderWidth: 1,
            borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
          }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: '700', color: '#2C2C2C', marginBottom: 2 }}>
              🎉 {t('newForm.inviteFillTitle')}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
              {t('newForm.inviteFillHint')}
            </Text>
            <TouchableOpacity
              testID="invite-fill-button"
              onPress={fillFromInvite}
              disabled={inviteBusy}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                backgroundColor: inviteBusy ? colors.bg : '#D4735A',
                borderRadius: radius.md, paddingVertical: spacing.md, minHeight: 44,
              }}
            >
              {inviteBusy
                ? <ActivityIndicator size="small" color={colors.textMuted} />
                : <Ionicons name="image-outline" size={18} color="#fff" />}
              <Text style={{ color: inviteBusy ? colors.textMuted : '#fff', fontWeight: '600', fontSize: font.sizes.sm }}>
                {inviteBusy ? t('newForm.inviteFillBusy') : t('newForm.inviteFillButton')}
              </Text>
            </TouchableOpacity>
            {inviteNote === 'done' ? (
              <Text style={{ fontSize: font.sizes.xs, color: '#5B9E85', marginTop: spacing.sm }}>{t('newForm.inviteFillDone')}</Text>
            ) : null}
            {inviteNote === 'fail' ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.error, marginTop: spacing.sm }}>{t('newForm.inviteFillFail')}</Text>
            ) : null}
          </View>
        ) : null}

        {/* ── Title ──────────────────────────────────────────── */}
        <FieldLabel>{t('appointments.titleRequired')}</FieldLabel>
        <TextInput
          testID="event-title"
          value={title}
          onChangeText={(v) => { setTitle(v); if (errors.title) setErrors({ ...errors, title: undefined }); }}
          placeholder={t('calendarNew.titlePlaceholder')}
          placeholderTextColor={colors.textDim}
          style={fieldStyle(!!errors.title)}
        />
        {errors.title ? <FieldError>{errors.title}</FieldError> : null}

        {/* ── Description ────────────────────────────────────── */}
        <View style={{ marginTop: spacing.lg }}>
          <FieldLabel>{t('newForm.description')}</FieldLabel>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t('calendarNew.descriptionPlaceholder')}
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
            label={t('calendar.allDay')}
            description={t('calendarNew.allDayHint')}
            value={allDay}
            onValueChange={handleAllDayToggle}
          />
          <ToggleRow
            label={t('calendarNew.multiDay')}
            description={t('calendarNew.multiDayHint')}
            value={multiDay}
            onValueChange={handleMultiDayToggle}
          />
        </View>

        {/* ── Dates ──────────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl, gap: spacing.md }}>
          <View testID="event-start-date">
            <DatePickerField
              label={multiDay ? t('calendarNew.startDateLabel') : t('calendarNew.dateLabel')}
              value={startDateIso}
              minimumDate={new Date(dateToIso(new Date()) + 'T00:00:00')}
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
              label={t('calendarNew.endDateLabel')}
              value={endDateIso}
              onChange={setEndDateIso}
              minimumDate={startDateIso ? new Date(startDateIso + 'T12:00:00') : undefined}
            />
          ) : null}
          {errors.date ? <FieldError>{errors.date}</FieldError> : null}
          {exceedsMultiDayCap ? (
            <View testID="event-multiday-cap-notice" style={{
              backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1,
              borderRadius: radius.md, padding: spacing.md, marginTop: spacing.xs,
              flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
            }}>
              <Ionicons name="information-circle" size={18} color="#B45309" style={{ marginTop: 1 }} />
              <Text style={{ color: '#92400E', fontSize: font.sizes.xs, flex: 1, lineHeight: 16 }}>
                {t('newForm.multiDayCapNotice', { max: MULTI_DAY_EVENT_CAP })}
              </Text>
            </View>
          ) : null}
        </View>

        {/* ── Times (when not all-day) ───────────────────────── */}
        {!allDay ? (
          <View style={{ marginTop: spacing.xl, flexDirection: 'row', gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <TimePickerField label={t('calendarNew.startTimeLabel')} value={startTime} onChange={setStartTime} />
            </View>
            <View style={{ flex: 1 }}>
              <TimePickerField label={t('calendarNew.endTimeLabel')} value={endTime} onChange={setEndTime} />
            </View>
          </View>
        ) : null}

        {/* ── Children selector ──────────────────────────────── */}
        {children.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <FieldLabel>{t('newForm.forWhom')}</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              <Chip
                selected={selectedChildId === null}
                color={colors.brand}
                label={t('nav.family')}
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
            <FieldLabel>{t('calendarNew.assignedToLabel')}</FieldLabel>
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
              {t('calendarNew.assignedToHint1')}<Text style={{ fontWeight: font.weights.semibold }}>{t('calendarNew.assignedToHintVacation')}</Text>{' '}
              {t('calendarNew.assignedToHint2')}<Text style={{ fontStyle: 'italic' }}>{'✈️ '}{t('calendar.vacation')}</Text>{t('calendarNew.assignedToHint3')}
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
                {assignedToId ? t('calendarNew.colorHint') : t('calendarNew.colorHintNone')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Location ───────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <FieldLabel>{t('newForm.location')}</FieldLabel>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder={t('calendarNew.locationPlaceholder')}
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
              {t('activitiesNew.recurrence')}
            </Text>
          </View>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, lineHeight: 16 }}>
            {t('calendarNew.recurrenceNote', { label: t('calendarNew.multiDay') })}
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
                {t('newForm.saveEvent')}
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
