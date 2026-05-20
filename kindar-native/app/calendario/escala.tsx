/**
 * Escala de Guarda — 14-day pattern builder + generate custody events.
 * Mirrors PWA /calendario/escala.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, ActivityIndicator,
  Alert, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { fetchChildren, type Child } from 'src/services/children';
import { generateSchedule, fetchSchedulePattern } from 'src/services/schedule';
import { PARENT_COLORS } from 'src/lib/constants';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Member {
  userId: string;
  name: string;
  color: string;
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function parseDate(display: string): string | null {
  const m = display.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export default function EscalaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [children, setChildren] = useState<Child[]>([]);
  const [childId, setChildId] = useState<string>('');
  const [members, setMembers] = useState<Member[]>([]);
  const [pattern, setPattern] = useState<(string | null)[]>(Array(14).fill(null));
  const [startDateIso, setStartDateIso] = useState(todayIso());
  const [startDateDisplay, setStartDateDisplay] = useState(displayDate(todayIso()));
  const [months, setMonths] = useState(6);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup || !userId) return;

    const [childList, memberResp] = await Promise.all([
      fetchChildren(activeGroup.groupId),
      supabase.from('group_members').select('user_id, profiles(full_name, display_name, email)').eq('group_id', activeGroup.groupId),
    ]);

    setChildren(childList);
    const targetChildId = childId || childList[0]?.id || '';
    if (!childId && targetChildId) setChildId(targetChildId);

    const memList: Member[] = ((memberResp.data || []) as any[]).map((m: any, i: number) => {
      const p = m.profiles || {};
      const raw = p.display_name
        || p.full_name?.split(' ')[0]
        || (p.email ? p.email.split('@')[0].split('.')[0] : '')
        || 'Membro';
      return {
        userId: m.user_id,
        name: raw.charAt(0).toUpperCase() + raw.slice(1),
        color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
      };
    });
    setMembers(memList);

    // Load pattern specifically for the selected child (fallback: any regular event)
    if (targetChildId) {
      const existing = await fetchSchedulePattern(activeGroup.groupId, targetChildId);
      if (existing.pattern && existing.pattern.length === 14) {
        setPattern(existing.pattern);
      }
      if (existing.startDate) {
        setStartDateIso(existing.startDate);
        setStartDateDisplay(displayDate(existing.startDate));
      }
    }
    setLoading(false);
  }, [activeGroup, userId, childId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function toggleDay(idx: number) {
    if (members.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPattern(prev => {
      const next = [...prev];
      const current = next[idx];
      if (current === null) {
        next[idx] = members[0].userId;
      } else if (current === members[0].userId && members.length > 1) {
        next[idx] = members[1].userId;
      } else {
        next[idx] = null;
      }
      return next;
    });
  }

  // Presets aligned with PWA src/app/(app)/calendario/escala/ScheduleBuilder.tsx
  // (alternating-weeks, 5-2-2-5, 3-4-4-3, 2-3-weekend) so users see the
  // same models on web and native. The pattern array is 14 cells starting
  // with Sunday (index 0 = Dom).
  function applyPreset(preset: 'alternating-weeks' | '5-2-2-5' | '3-4-4-3' | '2-3-weekend' | 'clear') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const m0 = members[0]?.userId || null;
    const m1 = members[1]?.userId || m0;
    if (!m0 && preset !== 'clear') return;

    let next: (string | null)[];
    switch (preset) {
      case 'alternating-weeks':
        next = [
          m0, m0, m0, m0, m0, m0, m0,
          m1, m1, m1, m1, m1, m1, m1,
        ];
        break;
      case '5-2-2-5':
        // Week 1: Mon-Fri A, Sat-Sun B; Week 2: Mon-Tue A, Wed-Sun B
        next = [
          m1, m0, m0, m0, m0, m0, m1,
          m1, m0, m0, m1, m1, m1, m1,
        ];
        break;
      case '3-4-4-3':
        next = [
          m1, m0, m0, m0, m1, m1, m1,
          m1, m0, m0, m0, m0, m1, m1,
        ];
        break;
      case '2-3-weekend':
        next = [
          m0, m0, m0, m0, m1, m1, m0,
          m1, m1, m1, m1, m0, m0, m1,
        ];
        break;
      default:
        next = Array(14).fill(null);
    }
    setPattern(next);
  }

  function fillWeek(weekIdx: number, userId: string | null) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPattern(prev => {
      const next = [...prev];
      for (let i = weekIdx * 7; i < weekIdx * 7 + 7; i++) next[i] = userId;
      return next;
    });
  }

  function handleDateChange(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    setStartDateDisplay(formatted);
    const iso = parseDate(formatted);
    if (iso) setStartDateIso(iso);
  }

  async function handleGenerate() {
    if (!activeGroup || !userId || !childId) return;
    if (pattern.every(p => p === null)) {
      toast.show({ message: t('toasts.validation.fillRequired'), variant: 'error' });
      return;
    }
    const iso = parseDate(startDateDisplay);
    if (!iso) { toast.show({ message: t('toasts.validation.dateRequired'), variant: 'error' }); return; }

    // O algoritmo do servidor (actions/calendar.ts:272-280 e
    // api/calendar/generate-schedule/route.ts) ancora o ciclo quinzenal
    // automaticamente na segunda-feira da semana da data escolhida —
    // qualquer dia funciona. Sem bloqueio aqui.

    Alert.alert(
      'Gerar escala',
      `Isso vai gerar a escala para ${months} meses a partir de ${startDateDisplay}. Eventos anteriores (se existirem) nesse período serão substituídos. Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Gerar',
          onPress: async () => {
            setGenerating(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await generateSchedule({
              groupId: activeGroup.groupId,
              childId,
              pattern,
              startDate: iso,
              months,
              createdBy: userId,
            });
            setGenerating(false);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show({ message: t('toasts.common.saved'), variant: 'success' });
              router.back();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
            }
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (members.length < 2) {
    // Bug Nessa 2026-05-20 (DM ao Angelino): nessa tela o usuário ficava preso
    // sem botão de voltar. "Só fechando o aplicativo e iniciando novamente".
    // Fix: header com back idêntico ao do estado normal (linha ~261) + dois
    // CTAs (convidar OU voltar pro início). Nenhum usuário deve ficar preso.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          <TouchableOpacity onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
            Escala de guarda
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: 48, marginBottom: spacing.md }}>👥</Text>
          <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center', marginBottom: spacing.sm }}>
            Precisa de 2 responsáveis
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg }}>
            A escala de guarda requer o outro co-responsável no grupo. Convide-o primeiro.
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/convite/enviar')}
            style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing['2xl'], marginBottom: spacing.md }}
          >
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>Convidar co-responsável</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.replace('/')}
            style={{ paddingVertical: spacing.sm, paddingHorizontal: spacing.lg }}
            accessibilityRole="button"
            accessibilityLabel="Voltar para o início"
          >
            <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>Voltar para o início</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Escala de guarda
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {/* Child selector */}
        {children.length > 1 ? (
          <>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Criança</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {children.map(c => {
                const active = childId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => setChildId(c.id)}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                      backgroundColor: active ? colors.brand : colors.bgElevated,
                      borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text }}>
                      {c.full_name.split(' ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Legend — flex-wrap protege o layout quando o grupo tiver 3+
            co-responsáveis (cenário futuro) e em telas estreitas. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, rowGap: spacing.sm, marginBottom: spacing.md }}>
          {members.map(m => (
            <View key={m.userId} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: m.color }} />
              <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{m.name}</Text>
            </View>
          ))}
        </View>

        {/* Presets */}
        <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
          Modelos comuns
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {/* Same preset library as PWA `ScheduleBuilder.tsx:81-118`. */}
            <PresetBtn label="Semanas alternadas" onPress={() => applyPreset('alternating-weeks')} />
            <PresetBtn label="5-2-2-5" onPress={() => applyPreset('5-2-2-5')} />
            <PresetBtn label="3-4-4-3" onPress={() => applyPreset('3-4-4-3')} />
            <PresetBtn label="2-3 com fins de semana" onPress={() => applyPreset('2-3-weekend')} />
            <PresetBtn label="Limpar" onPress={() => applyPreset('clear')} />
          </View>
        </ScrollView>

        {/* 14-day grid (2 weeks) */}
        {[0, 1].map(weekIdx => (
          <View key={weekIdx} style={{ marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 1 }}>
                Semana {weekIdx + 1}
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={() => fillWeek(weekIdx, members[0].userId)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: `${members[0].color}20` }}>
                <Text style={{ fontSize: font.sizes.xs, color: members[0].color, fontWeight: font.weights.medium }}>{members[0].name}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => fillWeek(weekIdx, members[1].userId)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: `${members[1].color}20` }}>
                <Text style={{ fontSize: font.sizes.xs, color: members[1].color, fontWeight: font.weights.medium }}>{members[1].name}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => fillWeek(weekIdx, null)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: colors.bgElevated }}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>—</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {DAY_NAMES.map((name, dayIdx) => {
                const patternIdx = weekIdx * 7 + dayIdx;
                const val = pattern[patternIdx];
                const mem = members.find(m => m.userId === val);
                return (
                  <TouchableOpacity
                    key={dayIdx}
                    onPress={() => toggleDay(patternIdx)}
                    style={{
                      flex: 1, height: 56, borderRadius: radius.md,
                      backgroundColor: mem ? `${mem.color}20` : colors.bgElevated,
                      borderWidth: 1, borderColor: mem ? mem.color : colors.borderLight,
                      alignItems: 'center', justifyContent: 'center', gap: 2,
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{name}</Text>
                    {mem ? (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mem.color }} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {/* Start date */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.xs }}>Começar em</Text>
        <TextInput
          value={startDateDisplay} onChangeText={handleDateChange}
          placeholder="DD/MM/AAAA"
          placeholderTextColor={colors.textMuted}
          keyboardType="number-pad" maxLength={10}
          style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg,
          }}
        />

        {/* Months */}
        <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.sm }}>Duração</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
          {[3, 6, 12].map(m => {
            const active = months === m;
            return (
              <TouchableOpacity
                key={m}
                onPress={() => setMonths(m)}
                style={{
                  flex: 1, paddingVertical: spacing.md, borderRadius: radius.md,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                  alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: font.sizes.md, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                  {m} {m === 1 ? 'mês' : 'meses'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Summary + generate */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm, marginBottom: spacing.lg }}>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textTransform: 'uppercase', fontWeight: font.weights.semibold, letterSpacing: 1, marginBottom: spacing.xs }}>
            Resumo
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>
            {members[0].name}: <Text style={{ fontWeight: font.weights.semibold }}>{pattern.filter(p => p === members[0].userId).length}</Text> de 14 dias
            {'\n'}
            {members[1].name}: <Text style={{ fontWeight: font.weights.semibold }}>{pattern.filter(p => p === members[1].userId).length}</Text> de 14 dias
            {'\n'}
            Não atribuído: {pattern.filter(p => p === null).length}
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
            A partir de {displayDate(startDateIso)} · gerando até {(() => { const d = new Date(startDateIso + 'T12:00:00'); d.setMonth(d.getMonth() + months); return `${d.getDate()} de ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`; })()}
          </Text>
        </View>

        <TouchableOpacity
          disabled={generating}
          onPress={handleGenerate}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            opacity: generating ? 0.5 : 1,
          }}
        >
          {generating ? <ActivityIndicator color="#fff" /> : (
            <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
              Gerar escala
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PresetBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
        borderRadius: radius.md, backgroundColor: colors.bgElevated,
        borderWidth: 1, borderColor: colors.borderLight,
      }}
    >
      <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>{label}</Text>
    </TouchableOpacity>
  );
}
