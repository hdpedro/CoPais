/**
 * Export de Saude — preview completo + Share com resumo textual.
 * Mirrors PWA /saude/export (versao simplificada — sem geracao de PDF nativo,
 * mas com share textual completo que cabe em email/WhatsApp).
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Share,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { supabase } from '../../src/lib/supabase';
import { fetchChildren, type Child } from '../../src/services/children';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

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

function calcAge(birthDate: string): string {
  const bd = new Date(birthDate + 'T12:00:00');
  const now = new Date();
  let years = now.getFullYear() - bd.getFullYear();
  if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) years--;
  return `${years} anos`;
}

export default function ExportScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [data, setData] = useState<HealthExportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (activeGroup) {
      fetchChildren(activeGroup.groupId).then(list => {
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      });
    }
  }, [activeGroup]);

  const load = useCallback(async () => {
    if (!selectedChildId) { setLoading(false); return; }
    const child = children.find(c => c.id === selectedChildId);
    if (!child) return;

    const [medical, allergies, meds, appts, ills, vacs, growth] = await Promise.all([
      supabase.from('child_medical_info').select('blood_type, insurance_name, sus_number, primary_pediatrician_id').eq('child_id', selectedChildId).maybeSingle(),
      supabase.from('child_allergies').select('name, severity').eq('child_id', selectedChildId).order('severity', { ascending: false }),
      supabase.from('active_medications').select('name, dosage, frequency').eq('child_id', selectedChildId).eq('status', 'active'),
      supabase.from('medical_appointments').select('title, appointment_date').eq('child_id', selectedChildId).order('appointment_date', { ascending: false }).limit(10),
      supabase.from('illness_episodes').select('title, start_date, end_date').eq('child_id', selectedChildId).order('start_date', { ascending: false }).limit(10),
      // Schema: vaccination_records uses `vaccine_name`/`administered_date`,
      // growth_records uses `measured_date` (NOT `name`/`applied_at`/`date`).
      // Pre-existing column-name bug fixed 2026-04-27.
      supabase.from('vaccination_records').select('vaccine_name, dose_label, administered_date').eq('child_id', selectedChildId).order('administered_date', { ascending: false }).limit(30),
      supabase.from('growth_records').select('measured_date, height_cm, weight_kg').eq('child_id', selectedChildId).order('measured_date', { ascending: false }).limit(1).maybeSingle(),
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

    setData({
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
    });
    setLoading(false);
  }, [selectedChildId, children]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleShare() {
    if (!data) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const lines: string[] = [];
    const { child } = data;
    lines.push(`*HISTÓRICO MÉDICO — ${child.full_name.toUpperCase()}*`);
    lines.push(`Idade: ${calcAge(child.birth_date)}  ·  Nasc: ${formatDate(child.birth_date)}`);
    lines.push('');

    lines.push('*DADOS BÁSICOS*');
    lines.push(`Tipo sanguíneo: ${data.bloodType || 'não informado'}`);
    lines.push(`Plano de saúde: ${data.insurance || 'não informado'}`);
    if (data.sus) lines.push(`SUS: ${data.sus}`);
    lines.push('');

    if (data.allergies.length > 0) {
      lines.push(`*ALERGIAS (${data.allergies.length})*`);
      data.allergies.forEach(a => lines.push(`• ${a.name}${a.severity ? ` — ${a.severity}` : ''}`));
      lines.push('');
    }

    if (data.medications.length > 0) {
      lines.push(`*MEDICAMENTOS ATIVOS (${data.medications.length})*`);
      data.medications.forEach(m => lines.push(`• ${m.name}${m.dosage ? ` ${m.dosage}` : ''}${m.frequency ? ` (${m.frequency})` : ''}`));
      lines.push('');
    }

    if (data.pediatrician) {
      lines.push('*PEDIATRA*');
      lines.push(`${data.pediatrician.name}${data.pediatrician.specialty ? ` (${data.pediatrician.specialty})` : ''}`);
      if (data.pediatrician.phone) lines.push(data.pediatrician.phone);
      lines.push('');
    }

    if (data.illnesses.length > 0) {
      lines.push(`*HISTÓRICO DE DOENÇAS (últimos 10)*`);
      data.illnesses.forEach(i => lines.push(`• ${i.title} — ${formatDate(i.start_date)} até ${i.end_date ? formatDate(i.end_date) : 'ativa'}`));
      lines.push('');
    }

    if (data.vaccines.length > 0) {
      lines.push(`*VACINAS (${data.vaccines.length})*`);
      data.vaccines.slice(0, 10).forEach(v => lines.push(`• ${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ''}${v.administered_date ? ` — ${formatDate(v.administered_date)}` : ''}`));
      if (data.vaccines.length > 10) lines.push(`... e mais ${data.vaccines.length - 10} vacinas.`);
      lines.push('');
    }

    if (data.growthLast) {
      lines.push('*CRESCIMENTO (último registro)*');
      lines.push(`Data: ${formatDate(data.growthLast.measured_date)}`);
      if (data.growthLast.height_cm) lines.push(`Altura: ${data.growthLast.height_cm} cm`);
      if (data.growthLast.weight_kg) lines.push(`Peso: ${data.growthLast.weight_kg} kg`);
      lines.push('');
    }

    lines.push(`---`);
    lines.push(`Exportado do Kindar em ${new Date().toLocaleDateString('pt-BR')}`);

    const summary = lines.join('\n');
    try {
      await Share.share({ message: summary, title: `Histórico médico — ${child.full_name}` });
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Export de saúde
        </Text>
        <TouchableOpacity onPress={handleShare} hitSlop={12}>
          <Ionicons name="share-outline" size={22} color={colors.brand} />
        </TouchableOpacity>
      </View>

      {children.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexGrow: 0 }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {children.map(c => {
              const active = selectedChildId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedChildId(c.id); setLoading(true); }}
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
        </ScrollView>
      ) : null}

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
            {calcAge(data.child.birth_date)} · {formatDate(data.child.birth_date)}
          </Text>
        </View>

        <Section title="Dados básicos">
          <Row label="Tipo sanguíneo" value={data.bloodType || '—'} />
          <Row label="Plano de saúde" value={data.insurance || '—'} />
          {data.sus ? <Row label="SUS" value={data.sus} /> : null}
        </Section>

        <Section title={`Alergias (${data.allergies.length})`}>
          {data.allergies.length === 0 ? <Empty>Nenhuma registrada</Empty> : data.allergies.map((a, i) => (
            <Row key={i} label={a.name} value={a.severity || ''} />
          ))}
        </Section>

        <Section title={`Medicamentos ativos (${data.medications.length})`}>
          {data.medications.length === 0 ? <Empty>Nenhum em uso</Empty> : data.medications.map((m, i) => (
            <Row key={i} label={m.name} value={[m.dosage, m.frequency].filter(Boolean).join(' · ')} />
          ))}
        </Section>

        {data.pediatrician ? (
          <Section title="Pediatra">
            <Row label={data.pediatrician.name} value={data.pediatrician.specialty || ''} />
            {data.pediatrician.phone ? <Row label="Telefone" value={data.pediatrician.phone} /> : null}
          </Section>
        ) : null}

        <Section title={`Consultas recentes (${data.appointments.length})`}>
          {data.appointments.length === 0 ? <Empty>Nenhuma registrada</Empty> : data.appointments.slice(0, 5).map((a, i) => (
            <Row key={i} label={a.title} value={formatDate(a.appointment_date)} />
          ))}
        </Section>

        <Section title={`Histórico de doenças (${data.illnesses.length})`}>
          {data.illnesses.length === 0 ? <Empty>Nenhum episódio</Empty> : data.illnesses.slice(0, 5).map((ill, i) => (
            <Row key={i} label={ill.title} value={`${formatDate(ill.start_date)} → ${ill.end_date ? formatDate(ill.end_date) : 'ativa'}`} />
          ))}
        </Section>

        <Section title={`Vacinas (${data.vaccines.length})`}>
          {data.vaccines.length === 0 ? <Empty>Nenhuma registrada</Empty> : data.vaccines.slice(0, 5).map((v, i) => (
            <Row key={i} label={`${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ''}`} value={formatDate(v.administered_date)} />
          ))}
          {data.vaccines.length > 5 ? <Empty>... e mais {data.vaccines.length - 5} vacinas</Empty> : null}
        </Section>

        {data.growthLast ? (
          <Section title="Crescimento (último registro)">
            <Row label="Data" value={formatDate(data.growthLast.measured_date)} />
            {data.growthLast.height_cm ? <Row label="Altura" value={`${data.growthLast.height_cm} cm`} /> : null}
            {data.growthLast.weight_kg ? <Row label="Peso" value={`${data.growthLast.weight_kg} kg`} /> : null}
          </Section>
        ) : null}

        <TouchableOpacity
          onPress={handleShare}
          activeOpacity={0.85}
          style={{
            backgroundColor: colors.brand, borderRadius: radius.md,
            paddingVertical: spacing.md + 2, alignItems: 'center',
            flexDirection: 'row', justifyContent: 'center', gap: spacing.sm,
            marginTop: spacing.lg,
          }}
        >
          <Ionicons name="share-outline" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
            Compartilhar resumo
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
