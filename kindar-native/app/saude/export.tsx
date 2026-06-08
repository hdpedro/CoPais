/**
 * Export de Saude — preview completo + Share com resumo textual.
 * Mirrors PWA /saude/export (versao simplificada — sem geracao de PDF nativo,
 * mas com share textual completo que cabe em email/WhatsApp).
 */
import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Share,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { useI18n } from 'src/i18n';
import { supabase } from 'src/lib/supabase';
import { fetchChildren, type Child } from 'src/services/children';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ChildPicker from 'src/components/ui/ChildPicker';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface HealthExportData {
  child: Child;
  bloodType: string | null;
  insurance: string | null;
  sus: string | null;
  allergies: { name: string; severity: string | null }[];
  medications: { name: string; dosage: string | null; frequency: string | null }[];
  pediatrician: { name: string; phone: string | null; specialty: string | null } | null;
  appointments: { title: string; appointment_date: string }[];
  illnesses: { title: string; start_date: string; end_date: string | null }[];
  vaccines: { vaccine_name: string; administered_date: string | null; dose_label: string | null }[];
  growthLast: { measured_date: string; height_cm: number | null; weight_kg: number | null } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return iso.slice(0, 10).split('-').reverse().join('/');
}

function calcAgeYears(birthDate: string): number {
  const bd = new Date(birthDate + 'T12:00:00');
  const now = new Date();
  let years = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) years--;
  return years;
}

export default function ExportScreen() {
  const t = useI18n((s) => s.t);
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const groupId = activeGroup?.groupId;
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const { data: children } = useCachedFetch<Child[]>({
    cacheKey: groupId ? `saude_export_children_${groupId}` : null,
    tag: 'saude:export:children',
    empty: [],
    fetcher: () => fetchChildren(groupId!),
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedChildId && children.length > 0) setSelectedChildId(children[0].id);
  }, [children, selectedChildId]);

  const { data, loading } = useCachedFetch<HealthExportData | null>({
    cacheKey: selectedChildId ? `saude_export_data_${selectedChildId}` : null,
    tag: 'saude:export:data',
    empty: null,
    fetcher: async () => {
      const child = children.find(c => c.id === selectedChildId);
      if (!child) return null;
      const [medical, allergies, meds, appts, ills, vacs, growth] = await Promise.all([
        supabase.from('child_medical_info').select('blood_type, insurance_name, sus_number, primary_pediatrician_id').eq('child_id', selectedChildId!).maybeSingle(),
        supabase.from('child_allergies').select('name, severity').eq('child_id', selectedChildId!).order('severity', { ascending: false }),
        supabase.from('active_medications').select('name, dosage, frequency').eq('child_id', selectedChildId!).eq('status', 'active'),
        supabase.from('medical_appointments').select('title, appointment_date').eq('child_id', selectedChildId!).order('appointment_date', { ascending: false }).limit(10),
        supabase.from('illness_episodes').select('title, start_date, end_date').eq('child_id', selectedChildId!).order('start_date', { ascending: false }).limit(10),
        supabase.from('vaccination_records').select('vaccine_name, dose_label, administered_date').eq('child_id', selectedChildId!).order('administered_date', { ascending: false }).limit(30),
        supabase.from('growth_records').select('measured_date, height_cm, weight_kg').eq('child_id', selectedChildId!).order('measured_date', { ascending: false }).limit(1).maybeSingle(),
      ]);
      let pediatrician = null;
      const pedId = (medical as any).data?.primary_pediatrician_id;
      if (pedId) {
        const { data: ped } = await supabase
          .from('medical_professionals')
          .select('name, phone, specialty')
          .eq('id', pedId)
          .maybeSingle();
        pediatrician = ped as any;
      }
      return {
        child,
        bloodType: (medical as any).data?.blood_type || null,
        insurance: (medical as any).data?.insurance_name || null,
        sus: (medical as any).data?.sus_number || null,
        allergies: (allergies.data || []) as any,
        medications: (meds.data || []) as any,
        pediatrician,
        appointments: (appts.data || []) as any,
        illnesses: (ills.data || []) as any,
        vaccines: (vacs.data || []) as any,
        growthLast: (growth as any).data || null,
      };
    },
  });

  async function handleShare() {
    if (!data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [];
    const { child } = data;
    const ageYears = calcAgeYears(child.birth_date);
    const ageLabel = `${ageYears} ${t('health.years')}`;
    lines.push(`*${t('healthExport.shareTitle', { name: child.full_name.toUpperCase() })}*`);
    lines.push(`${t('health.export.age')}: ${ageLabel}  ·  ${t('healthExport.shareBirthAbbrev')}: ${formatDate(child.birth_date)}`);
    lines.push('');

    lines.push(`*${t('healthExport.basicDataHeader')}*`);
    lines.push(`${t('health.emergency.bloodType')}: ${data.bloodType || t('healthExport.notInformedLower')}`);
    lines.push(`${t('childProfile.healthInsurance')}: ${data.insurance || t('healthExport.notInformedLower')}`);
    if (data.sus) lines.push(`${t('healthExport.susLabel')}: ${data.sus}`);
    lines.push('');

    if (data.allergies.length > 0) {
      lines.push(`*${t('healthExport.allergiesHeader', { count: data.allergies.length })}*`);
      data.allergies.forEach(a => lines.push(`• ${a.name}${a.severity ? ` — ${a.severity}` : ''}`));
      lines.push('');
    }

    if (data.medications.length > 0) {
      lines.push(`*${t('healthExport.medicationsHeader', { count: data.medications.length })}*`);
      data.medications.forEach(m => lines.push(`• ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` (${m.frequency})` : ''}`));
      lines.push('');
    }

    if (data.pediatrician) {
      lines.push(`*${t('health.emergency.pediatrician').toUpperCase()}*`);
      lines.push(`${data.pediatrician.name}${data.pediatrician.specialty ? ` (${data.pediatrician.specialty})` : ''}`);
      if (data.pediatrician.phone) lines.push(data.pediatrician.phone);
      lines.push('');
    }

    if (data.illnesses.length > 0) {
      lines.push(`*${t('healthExport.illnessesHeader')}*`);
      data.illnesses.forEach(i => lines.push(`• ${i.title} — ${formatDate(i.start_date)} ${t('healthExport.until')} ${i.end_date ? formatDate(i.end_date) : t('healthExport.illnessActive')}`));
      lines.push('');
    }

    if (data.vaccines.length > 0) {
      lines.push(`*${t('healthExport.vaccinesHeader', { count: data.vaccines.length })}*`);
      data.vaccines.slice(0, 10).forEach(v => lines.push(`• ${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ''}${v.administered_date ? ` — ${formatDate(v.administered_date)}` : ''}`));
      if (data.vaccines.length > 10) lines.push(t('healthExport.moreVaccines', { count: data.vaccines.length - 10 }));
      lines.push('');
    }

    if (data.growthLast) {
      lines.push(`*${t('healthExport.growthHeader')}*`);
      lines.push(`${t('health.export.dateCol')}: ${formatDate(data.growthLast.measured_date)}`);
      if (data.growthLast.height_cm) lines.push(`${t('health.height')}: ${data.growthLast.height_cm} ${t('healthExport.unitCm')}`);
      if (data.growthLast.weight_kg) lines.push(`${t('health.weight')}: ${data.growthLast.weight_kg} ${t('healthExport.unitKg')}`);
      lines.push('');
    }

    lines.push(`---`);
    lines.push(t('healthExport.exportedOn', { date: new Date().toLocaleDateString('pt-BR') }));

    const summary = lines.join('\n');
    try {
      await Share.share({ message: summary, title: t('healthExport.shareSheetTitle', { name: child.full_name }) });
    } catch { /* cancelled */ }
  }

  if (loading || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('healthExport.screenTitle')}
        </Text>
        <TouchableOpacity
          onPress={handleShare}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('healthExport.shareA11yLabel')}
          accessibilityHint={t('healthExport.shareA11yHint')}
        >
          <Ionicons name="share-outline" size={22} color={colors.brand} />
        </TouchableOpacity>
      </View>

      <ChildPicker
        items={children}
        selectedId={selectedChildId}
        onSelect={(id) => { setSelectedChildId(id); }}
        containerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        testID="export-child-picker"
      />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {/* Hero */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md, marginBottom: spacing.lg, alignItems: 'center' }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.bold, color: colors.brand }}>
              {data.child.full_name[0]?.toUpperCase()}
            </Text>
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text, textAlign: 'center' }}>
            {data.child.full_name}
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
            {calcAgeYears(data.child.birth_date)} {t('health.years')} · {formatDate(data.child.birth_date)}
          </Text>
        </View>

        <Section title={t('healthExport.basicDataSection')}>
          <Row label={t('health.emergency.bloodType')} value={data.bloodType || '—'} />
          <Row label={t('childProfile.healthInsurance')} value={data.insurance || '—'} />
          {data.sus ? <Row label={t('healthExport.susLabel')} value={data.sus} /> : null}
        </Section>

        <Section title={t('healthExport.allergiesSection', { count: data.allergies.length })}>
          {data.allergies.length === 0 ? <Empty>{t('health.emergency.allergiesNone')}</Empty> : data.allergies.map((a, i) => (
            <Row key={i} label={a.name} value={a.severity || ''} />
          ))}
        </Section>

        <Section title={t('healthExport.medicationsSection', { count: data.medications.length })}>
          {data.medications.length === 0 ? <Empty>{t('healthExport.noMedicationsInUse')}</Empty> : data.medications.map((m, i) => (
            <Row key={i} label={m.name} value={[m.dosage, m.frequency].filter(Boolean).join(' · ')} />
          ))}
        </Section>

        {data.pediatrician ? (
          <Section title={t('health.emergency.pediatrician')}>
            <Row label={data.pediatrician.name} value={data.pediatrician.specialty || ''} />
            {data.pediatrician.phone ? <Row label={t('health.phone')} value={data.pediatrician.phone} /> : null}
          </Section>
        ) : null}

        <Section title={t('healthExport.appointmentsSection', { count: data.appointments.length })}>
          {data.appointments.length === 0 ? <Empty>{t('health.emergency.allergiesNone')}</Empty> : data.appointments.slice(0, 5).map((a, i) => (
            <Row key={i} label={a.title} value={formatDate(a.appointment_date)} />
          ))}
        </Section>

        <Section title={t('healthExport.illnessesSection', { count: data.illnesses.length })}>
          {data.illnesses.length === 0 ? <Empty>{t('healthExport.noEpisodes')}</Empty> : data.illnesses.slice(0, 5).map((ill, i) => (
            <Row key={i} label={ill.title} value={`${formatDate(ill.start_date)} → ${ill.end_date ? formatDate(ill.end_date) : t('healthExport.illnessActive')}`} />
          ))}
        </Section>

        <Section title={t('healthExport.vaccinesSection', { count: data.vaccines.length })}>
          {data.vaccines.length === 0 ? <Empty>{t('health.emergency.allergiesNone')}</Empty> : data.vaccines.slice(0, 5).map((v, i) => (
            <Row key={i} label={`${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ''}`} value={formatDate(v.administered_date)} />
          ))}
          {data.vaccines.length > 5 ? <Empty>{t('healthExport.moreVaccinesInline', { count: data.vaccines.length - 5 })}</Empty> : null}
        </Section>

        {data.growthLast ? (
          <Section title={t('healthExport.growthSection')}>
            <Row label={t('health.export.dateCol')} value={formatDate(data.growthLast.measured_date)} />
            {data.growthLast.height_cm ? <Row label={t('health.height')} value={`${data.growthLast.height_cm} ${t('healthExport.unitCm')}`} /> : null}
            {data.growthLast.weight_kg ? <Row label={t('health.weight')} value={`${data.growthLast.weight_kg} ${t('healthExport.unitKg')}`} /> : null}
          </Section>
        ) : null}

        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('healthExport.shareSummary')}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
            marginTop: spacing.lg,
          }}
        >
          <Ionicons name="share-outline" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
            {t('healthExport.shareSummary')}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
        {title}
      </Text>
      <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm }}>
        {children}
      </View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: spacing.md }}>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, flex: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium, maxWidth: '55%', textAlign: 'right' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, paddingVertical: spacing.sm }}>
      {children}
    </Text>
  );
}
