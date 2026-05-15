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

import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { createVacationPeriod } from 'src/services/vacation';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font } from 'src/design-system/tokens';
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
          || 'Co-responsável',
      }));
      setMembers(memberList);
    })();
    return () => { cancelled = true; };
  }, [activeGroup, userId]);

  function validate(): boolean {
    const next: typeof errors = {};
    if (!startDateIso) next.date = 'Data de início obrigatória';
    else if (!endDateIso) next.date = 'Data final obrigatória';
    else if (endDateIso < startDateIso) next.date = 'Data final deve ser depois da inicial';
    if (!responsibleId) next.responsible = 'Escolha quem está com a criança nas férias';
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
        Alert.alert(
          'Férias registradas',
          'O calendário e a agenda já refletem o período. Coparentes serão avisados no próximo refresh.',
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        const errMsg = (result as { error?: string }).error || 'Erro ao salvar férias';
        // Trigger 00079 retorna unique_violation se houver overlap de mesmo tipo
        if (errMsg.includes('overlap')) {
          setErrors({ general: 'Já existe um período de férias cadastrado que sobrepõe esse intervalo. Edite o existente ou ajuste as datas.' });
        } else {
          setErrors({ general: errMsg });
        }
      }
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors({ general: e instanceof Error ? e.message : 'Erro inesperado' });
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScreenHeader title="Período de Férias" />

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + 100 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Explanation card */}
        <View style={{
          backgroundColor: `${colors.brand}10`, borderRadius: radius.lg,
          borderWidth: 1, borderColor: `${colors.brand}30`,
          padding: spacing.lg, marginTop: spacing.md, marginBottom: spacing.xl,
          flexDirection: 'row', gap: spacing.sm,
        }}>
          <Ionicons name="airplane-outline" size={20} color={colors.brand} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>
            <Text style={{ fontWeight: font.weights.semibold }}>Período de férias</Text>
            {' sobrepõe a escala regular no calendário, agenda e próxima troca. '}
            Use isto pra viagens, recesso escolar, ou qualquer período onde o coparente padrão da escala não estará com a criança.
          </Text>
        </View>

        {/* ── Children selector ──────────────────────────────── */}
        {children.length > 0 ? (
          <View>
            <FieldLabel>Para quem (opcional — vazio = família toda)</FieldLabel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs }}>
              <Chip
                selected={selectedChildId === null}
                color={colors.brand}
                label="Família"
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
          <FieldLabel>Início *</FieldLabel>
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
          <FieldLabel>Fim *</FieldLabel>
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
            {days} {days === 1 ? 'dia' : 'dias'} de férias.
            {days > 90 ? ' Máximo permitido: 90 dias.' : ''}
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
            <FieldLabel>Quem está com a criança *</FieldLabel>
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
                Cor das férias no calendário (do responsável escolhido)
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Notes ───────────────────────────────────────────── */}
        <View style={{ marginTop: spacing.xl }}>
          <FieldLabel>Anotação (opcional)</FieldLabel>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex: Viagem pra Caraguá, acampamento de inverno..."
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
              Salvar férias
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.85}
          style={{ paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm }}
        >
          <Text style={{ color: colors.textMuted, fontSize: font.sizes.md }}>Cancelar</Text>
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
