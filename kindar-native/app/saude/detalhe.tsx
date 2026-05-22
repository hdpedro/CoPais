/**
 * Health Event Detail — Full view of a specific health record.
 * Shows all fields: medication dosage, illness symptoms, appointment details, etc.
 */

import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from 'src/lib/supabase';
import { useAuth } from 'src/store/auth';
import { getDisplayName } from 'src/lib/constants';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const EVENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  illness: { icon: '🤒', color: '#E53935', label: 'Doença / Sintoma' },
  medication: { icon: '💊', color: '#3b82f6', label: 'Medicamento' },
  appointment: { icon: '🏥', color: '#5B9E85', label: 'Consulta' },
  observation: { icon: '📝', color: '#E8A228', label: 'Observação' },
};

const SEVERITY_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  leve: { icon: '🟢', label: 'Leve', color: '#4CAF50' },
  moderado: { icon: '🟡', label: 'Moderado', color: '#E8A228' },
  grave: { icon: '🔴', label: 'Grave', color: '#E53935' },
};

interface DetailRow {
  label: string;
  value: string;
  icon?: string;
  color?: string;
}

export default function DetalheScreen() {
  const insets = useSafeAreaInsets();
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  useAuth();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');

  useEffect(() => {
    if (!id || !type) return;

    async function load() {
      let result;
      if (type === 'illness') {
        const { data } = await supabase.from('illness_episodes')
          .select('*, children(full_name)')
          .eq('id', id).single();
        result = data;
      } else if (type === 'medication') {
        const { data } = await supabase.from('active_medications')
          .select('*, children(full_name)')
          .eq('id', id).single();
        result = data;
      } else if (type === 'appointment') {
        const { data } = await supabase.from('medical_appointments')
          .select('*, children(full_name), medical_professionals(name, specialty)')
          .eq('id', id).single();
        result = data;
      }

      if (result) {
        setData(result);
        // Resolve author name
        if (result.created_by) {
          const { data: profile } = await supabase.from('profiles')
            .select('full_name').eq('id', result.created_by).single();
          // "Registrado por X" — chip compacto, firstOnly
          if (profile) setAuthorName(getDisplayName(profile.full_name, true));
        }
      }
      setLoading(false);
    }

    load();
  }, [id, type]);

  const cfg = EVENT_CONFIG[type || 'observation'] || EVENT_CONFIG.observation;

  // Build detail rows
  const rows: DetailRow[] = [];
  if (data) {
    const childName = getDisplayName((data.children as { full_name?: string } | null)?.full_name);
    if (childName) rows.push({ label: 'Crianca', value: childName, icon: '👶' });

    if (type === 'illness') {
      if (data.severity) {
        const sev = SEVERITY_CONFIG[data.severity as string];
        if (sev) rows.push({ label: 'Gravidade', value: sev.label, icon: sev.icon, color: sev.color });
      }
      if (data.symptoms && (data.symptoms as string[]).length > 0) {
        rows.push({ label: 'Sintomas', value: (data.symptoms as string[]).join(', '), icon: '🩺' });
      }
      if (data.diagnosis) rows.push({ label: 'Diagnóstico', value: data.diagnosis as string, icon: '📋' });
      rows.push({ label: 'Status', value: data.status === 'active' ? 'Ativo' : 'Resolvido', icon: data.status === 'active' ? '🔴' : '✅' });
      if (data.start_date) rows.push({ label: 'Início', value: formatDate(data.start_date as string), icon: '📅' });
      if (data.end_date) rows.push({ label: 'Fim', value: formatDate(data.end_date as string), icon: '📅' });
      if (data.hospital_visit) {
        rows.push({ label: 'Visita hospitalar', value: data.hospital_name as string || 'Sim', icon: '🏥' });
      }
    }

    if (type === 'medication') {
      if (data.dosage) rows.push({ label: 'Dosagem', value: data.dosage as string, icon: '💊' });
      if (data.frequency) rows.push({ label: 'Frequencia', value: data.frequency as string, icon: '⏰' });
      if (data.reason) rows.push({ label: 'Motivo', value: data.reason as string, icon: '📋' });
      rows.push({ label: 'Status', value: data.status === 'active' ? 'Ativo' : 'Finalizado', icon: data.status === 'active' ? '🟢' : '⬜' });
      if (data.start_date) rows.push({ label: 'Inicio', value: formatDate(data.start_date as string), icon: '📅' });
      if (data.end_date) rows.push({ label: 'Fim previsto', value: formatDate(data.end_date as string), icon: '📅' });
    }

    if (type === 'appointment') {
      const prof = data.medical_professionals as { name?: string; specialty?: string } | null;
      if (prof?.name) rows.push({ label: 'Profissional', value: prof.name, icon: '👨‍⚕️' });
      if (prof?.specialty) rows.push({ label: 'Especialidade', value: prof.specialty, icon: '🏥' });
      if (data.location) rows.push({ label: 'Local', value: data.location as string, icon: '📍' });
      if (data.appointment_date) rows.push({ label: 'Data', value: formatDateTime(data.appointment_date as string), icon: '📅' });
      rows.push({ label: 'Status', value: data.status === 'scheduled' ? 'Agendada' : data.status === 'completed' ? 'Realizada' : (data.status as string), icon: '📋' });
      if (data.summary) rows.push({ label: 'Resumo', value: data.summary as string, icon: '📝' });
    }

    if (data.notes) rows.push({ label: 'Observacoes', value: data.notes as string, icon: '📝' });
    if (authorName) rows.push({ label: 'Registrado por', value: authorName, icon: '👤' });
    if (data.created_at) rows.push({ label: 'Registrado em', value: formatDateTime(data.created_at as string), icon: '🕐' });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg, backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
          {cfg.label}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !data ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: colors.textMuted }}>Registro não encontrado</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            padding: spacing.xl, marginBottom: spacing.xl, ...shadows.md,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <View style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: `${cfg.color}15`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 26 }}>{cfg.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
                  {(data.title || data.name || '') as string}
                </Text>
                <Text style={{ fontSize: font.sizes.sm, color: cfg.color, fontWeight: font.weights.medium, marginTop: 2 }}>
                  {cfg.label}
                </Text>
              </View>
            </View>
          </View>

          {/* Detail rows */}
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            ...shadows.sm, overflow: 'hidden',
          }}>
            {rows.map((row, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
                padding: spacing.lg,
                borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
              }}>
                {row.icon ? <Text style={{ fontSize: 14, marginTop: 2 }}>{row.icon}</Text> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>
                    {row.label}
                  </Text>
                  <Text style={{
                    fontSize: font.sizes.md, color: row.color || colors.text,
                    fontWeight: font.weights.medium,
                  }}>
                    {row.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Future: OCR Receipt hook */}
          <View style={{
            backgroundColor: colors.bgSurface, borderRadius: radius.xl,
            padding: spacing.xl, marginTop: spacing.xl,
            borderWidth: 1, borderColor: colors.borderLight, borderStyle: 'dashed',
            alignItems: 'center',
          }}>
            <Ionicons name="camera-outline" size={24} color={colors.textDim} />
            <Text style={{ fontSize: font.sizes.sm, color: colors.textDim, marginTop: spacing.sm, textAlign: 'center' }}>
              Em breve: escaneie receitas com a camera
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
