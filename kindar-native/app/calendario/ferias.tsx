/**
 * Calendário — Adicionar período de Férias.
 *
 * # Por que tela separada de "Novo Evento"
 *
 * Bug Amanda 2026-05-14: ela tentou cadastrar férias do Bê via "Novo
 * Evento" (eventos sociais) e ficou travada porque o form forçava
 * "Quem leva / responsável". Era a ferramenta errada — férias é período
 * de CUSTÓDIA que SOBREPÕE a escala regular, não evento social.
 *
 * Esta tela cria `custody_events` com `custody_type='vacation'`. A
 * migration 00082 elevou vacation pra prio 2 no `custody_resolved` view —
 * o que significa que férias agora REALMENTE sobrepõem a escala no
 * calendário, agenda da semana, próxima troca, e cálculo de streak.
 *
 * # Campos
 *
 * - Criança (opcional — se vazio, vale pra família toda; se só 1
 *   criança, fica pré-selecionada).
 * - Data início + Data fim (obrigatórios, end >= start, máx 90 dias).
 * - Responsável (OBRIGATÓRIO — semanticamente férias sempre tem alguém
 *   com a criança).
 * - Anotação (opcional). Ex: "Viagem pra Caraguá".
 *
 * # Diferença vs Novo Evento
 *
 * | Aspect              | Novo Evento (social)       | Férias (esta tela)     |
 * | Tabela              | `events`                   | `custody_events`       |
 * | Sobrepõe escala?    | Não (é evento social)      | SIM (custody_type 2)   |
 * | Cor no calendário   | Cor do assigned_to         | Cor do responsável     |
 * | Afeta streak/troca? | Não                        | SIM (via view)         |
 * | Responsável         | Opcional                   | Obrigatório            |
 * | Local/Horário       | Sim                        | Não (range puro)       |
 */

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createVacationPeriod, listUpcomingVacations, deleteVacationPeriod } from 'src/services/vacation';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { getDisplayName } from 'src/lib/constants';

interface ChildOption { id: string; full_name: string }
interface MemberOption { user_id: string; name: string }

const RESPONSIBLE_COLORS = [
  colors.custody.primary,
  colors.custody.secondary,
  colors.violet,
  colors.accent,
] as const;

export default function NovaFeriasScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { userId, activeGroup } = useAuth();
  const params = useLocalSearchParams<{ date?: string }>();
  const initialDateIso = (() => {
    const raw = typeof params.date === 'string' ? params.date : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : dateToIso(new Date());
  })();

  const [startDateIso, setStartDateIso] = useState<string>(initialDateIso);
  const [endDateIso, setEndDateIso] = useState<string>(initialDateIso);
  const [notes, setNotes] = useState('');

  const [children, setChildren] = useState<ChildOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [responsibleId, setResponsibleId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ date?: string; responsible?: string; general?: string }>({});

  // Lista de férias existentes (próximas + em andamento)
  interface VacationItem {
    id: string;
    childId: string | null;
    childName: string | null;
    responsibleUserId: string;
    responsibleName: string;
    startDate: string;
    endDate: string;
    notes: string | null;
  }
  const [existingVacations, setExistingVacations] = useState<VacationItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadVacations = useCallback(async () => {
    if (!activeGroup) return;
    setLoadingList(true);
    const list = await listUpcomingVacations(activeGroup.groupId, 10);
    setExistingVacations(list as VacationItem[]);
    setLoadingList(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { void loadVacations(); }, [loadVacations]));

  useEffect(() => {
    if (!activeGroup || !userId) return;
    let cancelled = false;
    (async () => {
      const [{ data: childRows }, { data: memberRows }] = await Promise.all([
        supabase.from('children').select('id, full_name')
          .eq('group_id', activeGroup.groupId).order('birth_date'),
        supabase.from('group_members')
          .select('user_id, profiles(full_name, display_name)')
          .eq('group_id', activeGroup.groupId),
      ]);
      if (cancelled) return;
      const kids = childRows || [];
      setChildren(kids);
      // Se só 1 criança, pré-seleciona (caso comum)
      if (kids.length === 1) setSelectedChildId(kids[0].id);

      const memberList = ((memberRows as Array<{
        user_id: string;
        profiles: { full_name?: string | null; display_name?: string | null } | null;
      }> | null) ?? []).map(m => ({
        user_id: m.user_id,
        name: m.profiles?.display_name
          || (m.profiles?.full_name ? getDisplayName(m.profiles.full_name, true) : '')
          || t('calendarTab.coResponsible'),
      }));
      setMembers(memberList);
    })();
    return () => { cancelled = true; };
  }, [activeGroup, userId, t]);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!startDateIso) next.date = t('vacationScreen.errStartRequired');
    else if (!endDateIso) next.date = t('vacationScreen.errEndRequired');
    else if (endDateIso < startDateIso) next.date = t('calendar.vacations.formInvalidRange');
    if (!responsibleId) next.responsible = t('vacationScreen.errResponsibleRequired');
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!userId || !activeGroup || !responsibleId) return;
    if (!validate()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    setSaving(true);
    try {
      const result = await createVacationPeriod({
        groupId: activeGroup.groupId,
        childId: selectedChildId,
        responsibleUserId: responsibleId,
        startDate: startDateIso,
        endDate: endDateIso,
        notes: notes.trim() || undefined,
        createdBy: userId,
      });
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.show({ message: t('toasts.common.saved'), variant: 'success' });
        router.back();
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const errMsg = (result as { error?: string }).error || t('vacationScreen.errSaveFailed');
        // Trigger 00079 retorna unique_violation se houver overlap de mesmo tipo
        if (errMsg.includes('overlap')) {
          setErrors({ general: t('vacationScreen.errOverlap') });
        } else {
          setErrors({ general: errMsg });
        }
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors({ general: e instanceof Error ? e.message : t('vacationScreen.errUnexpected') });
    } finally {
      setSaving(false);
    }
  }

  const days = (() => {
    if (!startDateIso || !endDateIso || endDateIso < startDateIso) return 0;
    const a = new Date(startDateIso + 'T12:00:00').getTime();
    const b = new Date(endDateIso + 'T12:00:00').getTime();
    return Math.round((b - a) / 86400000) + 1;
  })();

  const canSubmit = !!startDateIso && !!endDateIso && !!responsibleId && !saving;
  const responsibleIndex = members.findIndex(m => m.user_id === responsibleId);
  const responsibleColor = responsibleIndex >= 0
    ? RESPONSIBLE_COLORS[responsibleIndex % RESPONSIBLE_COLORS.length]
    : colors.textMuted;

  function handleDeleteVacation(v: VacationItem) {
    Alert.alert(
      t('vacationScreen.deleteConfirmTitle'),
      `${v.childName || t('calendar.vacations.familyFallback')} · ${formatRangeLabel(v.startDate, v.endDate)}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('calendar.vacations.deleteTitle'),
          style: 'destructive',
          onPress: async () => {
            const res = await deleteVacationPeriod(v.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadVacations();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: (res as { error?: string }).error || t('toasts.common.deleteFailed'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScreenHeader title={t('schedule.vacationTitle')} />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Explanation card */}
        <View style={{
          backgroundColor: `${colors.brand}10`, borderRadius: radius.lg,
          borderWidth: 1, borderColor: `${colors.brand}30`,
          padding: spacing.lg, marginTop: spacing.md, marginBottom: spacing.lg,
          flexDirection: 'row', gap: spacing.sm,
        }}>
          <Ionicons name="airplane-outline" size={20} color={colors.brand} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>
            <Text style={{ fontWeight: font.weights.semibold }}>{t('calendar.vacations.explainerTitle')}</Text>
            {' '}
            {t('calendar.vacations.explainerBody')}
          </Text>
        </View>

        {/* ── Próximas férias (lista existente) ──────────────── */}
        {loadingList ? (
          <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
            <ActivityIndicator color={colors.brand} size="small" />
          </View>
        ) : existingVacations.length > 0 ? (
          <View style={{ marginBottom: spacing.xl }}>
            <Text style={{
              fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold,
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
            }}>
              {t('calendar.vacations.upcomingHeading', { count: existingVacations.length })}
            </Text>
            {existingVacations.map((v) => (
              <View key={v.id} style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                padding: spacing.md, marginBottom: spacing.sm,
                flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                ...shadows.sm,
              }}>
                <View style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: `${colors.brand}15`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 18 }}>✈️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                    {v.childName || t('calendar.vacations.familyFallback')} · {t('calendar.vacations.withSomeone', { name: v.responsibleName || t('calendar.vacations.coparentFallback') })}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>
                    {formatRangeLabel(v.startDate, v.endDate)} · {daysBetween(v.startDate, v.endDate)} {daysBetween(v.startDate, v.endDate) === 1 ? t('calendar.vacations.daysSingular') : t('calendar.vacations.daysPlural')}
                  </Text>
                  {v.notes ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' }} numberOfLines={1}>
                      {v.notes}
                    </Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteVacation(v)}
                  hitSlop={8}
                  accessibilityLabel={t('calendar.vacations.deleteAriaLabel')}
                  style={{ padding: spacing.xs }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        {/* Section divider pra Novo registro */}
        {existingVacations.length > 0 ? (
          <Text style={{
            fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold,
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
          }}>
            {t('calendar.vacations.registerNewHeading')}
          </Text>
        ) : null}

        {/* ── Children selector ──────────────────────────────── */}
        {children.length > 0 ? (
          <View>
            <FieldLabel>{t('calendar.vacations.formForLabel')}</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              <Chip
                selected={selectedChildId === null}
                color={colors.brand}
                label={t('calendar.vacations.familyFallback')}
                onPress={() => setSelectedChildId(null)}
              />
              {children.map(c => (
                <Chip
                  key={c.id}
                  selected={selectedChildId === c.id}
                  color={colors.brand}
                  label={c.full_name}
                  onPress={() => setSelectedChildId(selectedChildId === c.id ? null : c.id)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* ── Date range ──────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <FieldLabel>{t('calendar.vacations.formStartLabel')}</FieldLabel>
          <DatePickerField
            value={startDateIso}
            onChange={(d) => {
              setStartDateIso(d || dateToIso(new Date()));
              if (errors.date) setErrors({ ...errors, date: undefined });
              // Auto-bump end se ficou menor que start
              if (d && endDateIso && endDateIso < d) setEndDateIso(d);
            }}
          />
        </View>

        <View style={{ marginTop: spacing.lg }}>
          <FieldLabel>{t('calendar.vacations.formEndLabel')}</FieldLabel>
          <DatePickerField
            value={endDateIso}
            onChange={(d) => {
              setEndDateIso(d || startDateIso);
              if (errors.date) setErrors({ ...errors, date: undefined });
            }}
            minimumDate={new Date(startDateIso + 'T12:00:00')}
          />
        </View>

        {days > 0 ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
            {days > 90
              ? t('calendar.vacations.formTooLong', { days })
              : t('calendar.vacations.formDaysSummary', { days, label: days === 1 ? t('calendar.vacations.daysSingular') : t('calendar.vacations.daysPlural') })}
          </Text>
        ) : null}

        {errors.date ? (
          <Text style={{ fontSize: font.sizes.xs, color: colors.error, marginTop: spacing.xs }}>
            {errors.date}
          </Text>
        ) : null}

        {/* ── Responsible (REQUIRED) ──────────────────────────── */}
        {members.length > 0 ? (
          <View style={{ marginTop: spacing.xl }}>
            <FieldLabel>{t('calendar.vacations.formResponsibleLabel')}</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              {members.map((m, idx) => {
                const c = RESPONSIBLE_COLORS[idx % RESPONSIBLE_COLORS.length];
                return (
                  <Chip
                    key={m.user_id}
                    selected={responsibleId === m.user_id}
                    color={c}
                    label={m.name}
                    onPress={() => {
                      setResponsibleId(m.user_id);
                      if (errors.responsible) setErrors({ ...errors, responsible: undefined });
                    }}
                  />
                );
              })}
            </View>
            {errors.responsible ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.error, marginTop: spacing.xs }}>
                {errors.responsible}
              </Text>
            ) : null}

            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
              marginTop: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
              backgroundColor: colors.bgElevated, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.borderLight,
            }}>
              <View style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: responsibleColor }} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, flex: 1 }}>
                {t('vacationScreen.colorHint')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Notes ───────────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <FieldLabel>{t('calendar.vacations.formNotesLabel')}</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder={t('calendar.vacations.formNotesPlaceholder')}
            placeholderTextColor={colors.textDim}
            multiline
            numberOfLines={3}
            style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.md,
              borderWidth: 1, borderColor: colors.borderLight,
              paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
              fontSize: font.sizes.md, color: colors.text,
              minHeight: 80, textAlignVertical: 'top',
            }}
          />
        </View>

        {errors.general ? (
          <View style={{
            marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md,
            backgroundColor: `${colors.error}10`, borderWidth: 1, borderColor: `${colors.error}30`,
          }}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.error }}>
              {errors.general}
            </Text>
          </View>
        ) : null}

        {/* Action buttons */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={!canSubmit}
          activeOpacity={0.85}
          style={{
            backgroundColor: canSubmit ? colors.brand : colors.borderLight,
            borderRadius: radius.lg, paddingVertical: spacing.lg,
            alignItems: 'center', marginTop: spacing.xl,
          }}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
              {t('calendar.vacations.formSave')}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={{ paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm }}
        >
          <Text style={{ color: colors.textMuted, fontSize: font.sizes.md }}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
      {children}
    </Text>
  );
}

function Chip({ selected, color, label, onPress }: { selected: boolean; color: string; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderRadius: radius.full,
        backgroundColor: selected ? color : colors.bgElevated,
        borderWidth: 1, borderColor: selected ? color : colors.borderLight,
      }}
    >
      <Text style={{
        color: selected ? '#fff' : colors.text,
        fontSize: font.sizes.sm,
        fontWeight: font.weights.medium,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function formatRangeLabel(startIso: string, endIso: string): string {
  const s = new Date(startIso + 'T12:00:00');
  const e = new Date(endIso + 'T12:00:00');
  const sLabel = s.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  if (startIso === endIso) return sLabel;
  const eOpts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  if (s.getFullYear() !== e.getFullYear()) eOpts.year = 'numeric';
  const eLabel = e.toLocaleDateString('pt-BR', eOpts);
  return `${sLabel} – ${eLabel}`;
}

function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso + 'T12:00:00').getTime();
  const e = new Date(endIso + 'T12:00:00').getTime();
  return Math.round((e - s) / 86400000) + 1;
}
