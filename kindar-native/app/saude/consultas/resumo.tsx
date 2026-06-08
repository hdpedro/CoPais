/**
 * Resumo de consulta — agrega dados de saúde da criança desde a última
 * consulta concluída para que o pai/mãe leve um briefing pronto. Mirrors
 * core do PWA `src/app/(app)/saude/consultas/resumo/ResumoConsultaClient.tsx`.
 *
 * Periodo: desde a última `medical_appointments.status='completed'`
 * (ou desde o nascimento, se nunca houve consulta concluída).
 *
 * Cards exibidos:
 *   - Cabeçalho com criança + período coberto
 *   - Doenças/episódios ativos no período
 *   - Medicamentos em uso (status=active OU iniciados no período)
 *   - Vacinas aplicadas no período
 *   - Crescimento (medida mais recente)
 *   - Alergias ativas
 *   - Sintomas dos últimos 14 dias
 *   - Consultas anteriores desde a última completada
 *
 * Use case: pai abre antes da consulta, mostra ao médico, ou compartilha
 * via Share como PDF (futuro — gerar PDF é fora desse escopo).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Share,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from 'src/lib/supabase';
import { useAuth } from 'src/store/auth';
import { useI18n } from 'src/i18n';
import ChildPicker from 'src/components/ui/ChildPicker';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Child { id: string; full_name: string; birth_date: string; sex: 'M' | 'F' | null; }
interface Illness {
  id: string; title: string; start_date: string; end_date: string | null;
  status: string; severity: string | null; symptoms: string[] | null;
  hospital: string | null; notes: string | null;
}
interface Medication {
  id: string; name: string; dosage: string | null; frequency: string | null;
  status: string; start_date: string; end_date: string | null; reason: string | null;
}
interface Vaccine { vaccine_name: string; dose_label: string | null; administered_date: string | null; }
interface GrowthRecord { measured_date: string; weight_kg: number | null; height_cm: number | null; head_cm: number | null; }
interface Allergy { id: string; name: string; severity: string | null; reaction: string | null; allergy_type: string | null; }
interface Symptom { id: string; recorded_at: string; symptom_type: string; intensity: string | null; temperature: number | null; notes: string | null; }
interface Appointment { id: string; appointment_date: string; title: string; status: string; notes: string | null; }

function brDate(iso: string): string {
  if (!iso) return '';
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function calcAge(birth: string): { years: number; months: number } {
  const bd = new Date(birth + 'T12:00:00');
  const now = new Date();
  let years = now.getFullYear() - bd.getFullYear();
  let months = now.getMonth() - bd.getMonth();
  if (now.getDate() < bd.getDate()) months -= 1;
  if (months < 0) { years -= 1; months += 12; }
  return { years, months };
}

export default function ResumoConsultaScreen() {
  const insets = useSafeAreaInsets();
  const t = useI18n((s) => s.t);
  const { activeGroup } = useAuth();
  const params = useLocalSearchParams<{ crianca?: string }>();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<{
    lastAppointment: Appointment | null;
    sinceDate: string;
    illnesses: Illness[];
    medications: Medication[];
    vaccines: Vaccine[];
    growth: GrowthRecord | null;
    allergies: Allergy[];
    symptoms: Symptom[];
    pastAppointments: Appointment[];
  } | null>(null);

  // Load list of children once
  useEffect(() => {
    if (!activeGroup) return;
    (async () => {
      const { data: kids } = await supabase
        .from('children')
        .select('id, full_name, birth_date, sex')
        .eq('group_id', activeGroup.groupId)
        .order('birth_date');
      const list = (kids || []) as Child[];
      setChildren(list);
      const initial = (params.crianca && list.find(c => c.id === params.crianca)) ? params.crianca : list[0]?.id;
      setSelectedChildId(initial ?? null);
      if (!initial) setLoading(false);
    })();
  }, [activeGroup, params.crianca]);

  // Load aggregated data when selected child changes
  useEffect(() => {
    if (!selectedChildId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const child = children.find(c => c.id === selectedChildId);
      if (!child) return;

      // Find last completed appointment
      const { data: lastApps } = await supabase
        .from('medical_appointments')
        .select('id, appointment_date, title, status, notes')
        .eq('child_id', selectedChildId)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .limit(1);
      const lastAppointment = (lastApps?.[0] as Appointment) ?? null;
      const sinceDate = lastAppointment
        ? lastAppointment.appointment_date.split('T')[0]
        : child.birth_date;

      // Symptoms cutoff = 14 days ago
      const since14d = new Date();
      since14d.setDate(since14d.getDate() - 14);
      const since14dIso = since14d.toISOString();

      const [
        { data: illnesses },
        { data: medications },
        { data: vaccines },
        { data: growthRecords },
        { data: allergies },
        { data: symptoms },
        { data: pastAppointments },
      ] = await Promise.all([
        supabase
          .from('illness_episodes')
          .select('id, title, start_date, end_date, status, severity, symptoms, hospital, notes')
          .eq('child_id', selectedChildId)
          .gte('start_date', sinceDate)
          .order('start_date', { ascending: false }),
        supabase
          .from('active_medications')
          .select('id, name, dosage, frequency, status, start_date, end_date, reason')
          .eq('child_id', selectedChildId)
          .or(`start_date.gte.${sinceDate},status.eq.active`)
          .order('start_date', { ascending: false }),
        supabase
          .from('vaccination_records')
          .select('vaccine_name, dose_label, administered_date')
          .eq('child_id', selectedChildId)
          .gte('administered_date', sinceDate)
          .order('administered_date', { ascending: false }),
        supabase
          .from('growth_records')
          .select('measured_date, weight_kg, height_cm, head_cm')
          .eq('child_id', selectedChildId)
          .order('measured_date', { ascending: false })
          .limit(1),
        supabase
          .from('child_allergies')
          .select('id, name, severity, reaction, allergy_type')
          .eq('child_id', selectedChildId),
        supabase
          .from('symptom_entries')
          .select('id, recorded_at, symptom_type, intensity, temperature, notes')
          .eq('child_id', selectedChildId)
          .gte('recorded_at', since14dIso)
          .order('recorded_at', { ascending: false }),
        supabase
          .from('medical_appointments')
          .select('id, appointment_date, title, status, notes')
          .eq('child_id', selectedChildId)
          .gte('appointment_date', sinceDate)
          .order('appointment_date', { ascending: false }),
      ]);

      if (cancelled) return;
      setData({
        lastAppointment,
        sinceDate,
        illnesses: (illnesses || []) as Illness[],
        medications: (medications || []) as Medication[],
        vaccines: (vaccines || []) as Vaccine[],
        growth: ((growthRecords || [])[0] as GrowthRecord) ?? null,
        allergies: (allergies || []) as Allergy[],
        symptoms: (symptoms || []) as Symptom[],
        pastAppointments: ((pastAppointments || []) as Appointment[]).filter(a => !lastAppointment || a.id !== lastAppointment.id),
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedChildId, children]);

  async function refresh() {
    setRefreshing(true);
    setSelectedChildId(prev => prev); // re-trigger via state object — but we re-fetch via children effect
    // Force reload by toggling
    if (selectedChildId) {
      const id = selectedChildId;
      setSelectedChildId(null);
      setTimeout(() => setSelectedChildId(id), 50);
    }
    setRefreshing(false);
  }

  const child = useMemo(() => children.find(c => c.id === selectedChildId), [children, selectedChildId]);

  async function shareSummary() {
    if (!child || !data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [];
    lines.push(`📋 ${t('appointmentSummary.shareTitle', { name: child.full_name })}`);
    const age = calcAge(child.birth_date);
    const sexLabel = child.sex === 'M' ? t('preSummary.male') : child.sex === 'F' ? t('preSummary.female') : '—';
    lines.push(`${t('health.export.age')}: ${age.years}${t('preSummary.yearsShort')} ${age.months}${t('preSummary.monthsShort')} · ${t('children.sex')}: ${sexLabel}`);
    lines.push(data.lastAppointment
      ? t('appointmentSummary.sharePeriodWithAppointment', { date: brDate(data.sinceDate), title: data.lastAppointment.title })
      : t('appointmentSummary.sharePeriod', { date: brDate(data.sinceDate) }));
    lines.push('');

    if (data.allergies.length > 0) {
      lines.push(`⚠️ ${t('health.allergies')}:`);
      data.allergies.forEach(a => lines.push(`  • ${a.name}${a.severity ? ` (${a.severity})` : ''}${a.reaction ? ` — ${a.reaction}` : ''}`));
      lines.push('');
    }

    const activeMeds = data.medications.filter(m => m.status === 'active');
    if (activeMeds.length > 0) {
      lines.push(`💊 ${t('appointmentSummary.medicationsInUse')}:`);
      activeMeds.forEach(m => lines.push(`  • ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` · ${m.frequency}` : ''}${m.reason ? ` (${m.reason})` : ''}`));
      lines.push('');
    }

    if (data.illnesses.length > 0) {
      lines.push(`🤒 ${t('appointmentSummary.illnessesInPeriodShare')}:`);
      data.illnesses.forEach(i => lines.push(`  • ${i.title} (${brDate(i.start_date)}${i.end_date ? ` → ${brDate(i.end_date)}` : ` — ${t('appointmentSummary.inProgress')}`})${i.severity ? ` · ${i.severity}` : ''}`));
      lines.push('');
    }

    if (data.symptoms.length > 0) {
      lines.push(`🌡️ ${t('appointmentSummary.symptomsLast14d')}:`);
      data.symptoms.slice(0, 10).forEach(s => lines.push(`  • ${brDate(s.recorded_at)} — ${s.symptom_type}${s.temperature ? ` (${s.temperature}°C)` : ''}${s.intensity ? ` ${s.intensity}` : ''}`));
      lines.push('');
    }

    if (data.vaccines.length > 0) {
      lines.push(`💉 ${t('appointmentSummary.vaccinesApplied')}:`);
      data.vaccines.forEach(v => lines.push(`  • ${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ''}${v.administered_date ? ` ${t('preSummary.on')} ${brDate(v.administered_date)}` : ''}`));
      lines.push('');
    }

    if (data.growth) {
      lines.push(`📏 ${t('appointmentSummary.growthLatest')}:`);
      const parts: string[] = [];
      if (data.growth.weight_kg) parts.push(`${t('preSummary.weight')}: ${data.growth.weight_kg}kg`);
      if (data.growth.height_cm) parts.push(`${t('preSummary.height')}: ${data.growth.height_cm}cm`);
      if (data.growth.head_cm) parts.push(`${t('preSummary.head')}: ${data.growth.head_cm}cm`);
      lines.push(`  ${parts.join(' · ')} (${brDate(data.growth.measured_date)})`);
      lines.push('');
    }

    lines.push(t('appointmentSummary.generatedVia'));
    await Share.share({ message: lines.join('\n') });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{
        paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('appointmentSummary.screenTitle')}
        </Text>
        {child && data ? (
          <TouchableOpacity
            onPress={shareSummary}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('healthExport.shareSummary')}
            accessibilityHint={t('healthExport.shareA11yHint')}
          >
            <Ionicons name="share-outline" size={22} color={colors.brand} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ChildPicker
        items={children}
        selectedId={selectedChildId}
        onSelect={(id) => setSelectedChildId(id)}
        containerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        testID="consulta-resumo-child-picker"
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
          <Text style={{ marginTop: spacing.md, fontSize: font.sizes.sm, color: colors.textSecondary }}>
            {t('appointmentSummary.compiling')}
          </Text>
        </View>
      ) : !child || !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: font.sizes.lg, color: colors.text, fontWeight: font.weights.semibold, textAlign: 'center' }}>
            {t('appointmentSummary.emptyTitle')}
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm }}>
            {t('appointmentSummary.emptyDesc')}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
        >
          {/* Hero */}
          <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.lg, ...shadows.md, marginBottom: spacing.lg }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('appointmentSummary.periodCovered')}
            </Text>
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginTop: 4 }}>
              {t('preSummary.since')} {brDate(data.sinceDate)}
            </Text>
            {data.lastAppointment ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
                {t('preSummary.lastAppointment')}: {data.lastAppointment.title}
              </Text>
            ) : (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
                {t('appointmentSummary.noCompletedAppointment')}
              </Text>
            )}
          </View>

          {/* Allergies */}
          {data.allergies.length > 0 ? (
            <Section title={t('healthExport.allergiesSection', { count: data.allergies.length })} icon="⚠️" tone="error">
              {data.allergies.map(a => (
                <Row key={a.id}
                  primary={a.name}
                  secondary={[a.severity, a.reaction].filter(Boolean).join(' · ')}
                />
              ))}
            </Section>
          ) : null}

          {/* Active medications */}
          {data.medications.filter(m => m.status === 'active').length > 0 ? (
            <Section title={t('appointmentSummary.medicationsInUseCount', { count: data.medications.filter(m => m.status === 'active').length })} icon="💊">
              {data.medications.filter(m => m.status === 'active').map(m => (
                <Row key={m.id}
                  primary={m.name}
                  secondary={[m.dosage, m.frequency, m.reason].filter(Boolean).join(' · ')}
                  trailing={`${t('health.export.startCol')} ${brDate(m.start_date)}`}
                />
              ))}
            </Section>
          ) : null}

          {/* Illnesses */}
          {data.illnesses.length > 0 ? (
            <Section title={t('appointmentSummary.illnessesInPeriod', { count: data.illnesses.length })} icon="🤒">
              {data.illnesses.map(i => (
                <Row key={i.id}
                  primary={i.title}
                  secondary={[
                    i.severity,
                    `${brDate(i.start_date)}${i.end_date ? ` → ${brDate(i.end_date)}` : ` — ${t('appointmentSummary.inProgress')}`}`,
                    i.symptoms?.join(', '),
                  ].filter(Boolean).join(' · ')}
                />
              ))}
            </Section>
          ) : null}

          {/* Symptoms 14d */}
          {data.symptoms.length > 0 ? (
            <Section title={t('appointmentSummary.symptomsLast14dCount', { count: data.symptoms.length })} icon="🌡️">
              {data.symptoms.slice(0, 10).map(s => (
                <Row key={s.id}
                  primary={s.symptom_type}
                  secondary={[
                    s.intensity,
                    s.temperature ? `${s.temperature}°C` : null,
                    s.notes,
                  ].filter(Boolean).join(' · ')}
                  trailing={brDate(s.recorded_at)}
                />
              ))}
              {data.symptoms.length > 10 ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                  {t('appointmentSummary.moreOlderSymptoms', { count: data.symptoms.length - 10 })}
                </Text>
              ) : null}
            </Section>
          ) : null}

          {/* Vaccines */}
          {data.vaccines.length > 0 ? (
            <Section title={t('appointmentSummary.vaccinesInPeriod', { count: data.vaccines.length })} icon="💉">
              {data.vaccines.map((v, i) => (
                <Row key={i}
                  primary={`${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ''}`}
                  trailing={v.administered_date ? brDate(v.administered_date) : ''}
                />
              ))}
            </Section>
          ) : null}

          {/* Growth */}
          {data.growth ? (
            <Section title={t('appointmentSummary.growthLatestMeasure')} icon="📏">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
                {data.growth.weight_kg ? <Stat label={t('preSummary.weight')} value={`${data.growth.weight_kg} kg`} /> : null}
                {data.growth.height_cm ? <Stat label={t('preSummary.height')} value={`${data.growth.height_cm} cm`} /> : null}
                {data.growth.head_cm ? <Stat label={t('preSummary.head')} value={`${data.growth.head_cm} cm`} /> : null}
                <Stat label={t('appointmentSummary.measuredOnLabel')} value={brDate(data.growth.measured_date)} />
              </View>
            </Section>
          ) : null}

          {/* Past appointments */}
          {data.pastAppointments.length > 0 ? (
            <Section title={t('appointmentSummary.appointmentsInPeriod', { count: data.pastAppointments.length })} icon="🩺">
              {data.pastAppointments.map(a => (
                <Row key={a.id}
                  primary={a.title}
                  secondary={a.notes || (a.status === 'cancelled' ? t('health.export.statusCancelled') : a.status === 'scheduled' ? t('health.export.statusScheduled') : '')}
                  trailing={brDate(a.appointment_date)}
                />
              ))}
            </Section>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, icon, tone, children }: { title: string; icon: string; tone?: 'error'; children: React.ReactNode }) {
  return (
    <View style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.lg,
      padding: spacing.lg, ...shadows.sm, marginBottom: spacing.lg,
      ...(tone === 'error' ? { borderLeftWidth: 3, borderLeftColor: colors.error } : {}),
    }}>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.sm }}>
        {icon} {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ primary, secondary, trailing }: { primary: string; secondary?: string | null; trailing?: string }) {
  return (
    <View style={{ paddingVertical: spacing.sm, borderTopWidth: 0.5, borderTopColor: colors.borderLight }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>{primary}</Text>
          {secondary ? <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }}>{secondary}</Text> : null}
        </View>
        {trailing ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{trailing}</Text> : null}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{
      backgroundColor: colors.bg, borderRadius: radius.md,
      paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
      borderWidth: 1, borderColor: colors.borderLight,
    }}>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
