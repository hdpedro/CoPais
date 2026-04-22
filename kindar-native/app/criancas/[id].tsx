/**
 * Child Detail — perfil detalhado da criança.
 * Mirrors PWA /criancas/[id] page with tabs for basic info, health, education.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Child {
  id: string;
  full_name: string;
  birth_date: string;
  gender: string | null;
  blood_type: string | null;
  photo_url: string | null;
  notes: string | null;
  allergies: string[] | null;
  cpf: string | null;
  rg: string | null;
}

interface ChildMetrics {
  medicationCount: number;
  allergyCount: number;
  upcomingAppointments: number;
  activeIllnesses: number;
  activitiesCount: number;
  lastCheckin: string | null;
}

function calcAge(birthDate: string): { years: number; months: number } {
  const bd = new Date(birthDate + 'T12:00:00');
  const now = new Date();
  let years = now.getFullYear() - bd.getFullYear();
  let months = now.getMonth() - bd.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < bd.getDate())) { years--; months += 12; }
  if (now.getDate() < bd.getDate()) months--;
  return { years, months: Math.max(0, months) };
}

function formatDate(iso: string): string {
  if (!iso || iso.length !== 10) return iso;
  return iso.split('-').reverse().join('/');
}

export default function ChildDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [child, setChild] = useState<Child | null>(null);
  const [metrics, setMetrics] = useState<ChildMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [childRes, medsRes, allergiesRes, apptsRes, illsRes, actsRes, checkinRes] = await Promise.all([
      supabase.from('children').select('id, full_name, birth_date, gender, blood_type, photo_url, notes, allergies, cpf, rg').eq('id', id).single(),
      supabase.from('active_medications').select('id', { count: 'exact', head: true }).eq('child_id', id).eq('status', 'active'),
      supabase.from('child_allergies').select('id', { count: 'exact', head: true }).eq('child_id', id),
      supabase.from('medical_appointments').select('id', { count: 'exact', head: true }).eq('child_id', id).eq('status', 'scheduled').gte('appointment_date', new Date().toISOString()),
      supabase.from('illness_episodes').select('id', { count: 'exact', head: true }).eq('child_id', id).eq('status', 'active'),
      supabase.from('child_activities').select('id', { count: 'exact', head: true }).eq('child_id', id).eq('is_active', true),
      supabase.from('daily_checkins').select('checkin_date').eq('child_id', id).order('checkin_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (childRes.error || !childRes.data) {
      setLoading(false);
      return;
    }

    setChild(childRes.data as Child);
    setMetrics({
      medicationCount: medsRes.count || 0,
      allergyCount: allergiesRes.count || 0,
      upcomingAppointments: apptsRes.count || 0,
      activeIllnesses: illsRes.count || 0,
      activitiesCount: actsRes.count || 0,
      lastCheckin: (checkinRes.data as any)?.checkin_date || null,
    });
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  async function handleDelete() {
    if (!child) return;
    Alert.alert(
      'Remover crianca',
      `Remover ${child.full_name} do grupo? Os dados historicos serao preservados mas a crianca ficara oculta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const { error } = await supabase.from('children').delete().eq('id', child.id);
            if (error) {
              Alert.alert('Erro', error.message);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            }
          },
        },
      ]
    );
  }

  if (loading || !child) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  const age = calcAge(child.birth_date);
  const initial = child.full_name[0]?.toUpperCase() || '?';

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }} numberOfLines={1}>
          {child.full_name.split(' ')[0]}
        </Text>
        <TouchableOpacity onPress={handleDelete} hitSlop={12}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Hero card */}
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, alignItems: 'center', ...shadows.md, marginBottom: spacing.lg }}>
          <View style={{
            width: 96, height: 96, borderRadius: 48,
            backgroundColor: colors.brandLight,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: spacing.md,
          }}>
            <Text style={{ fontSize: font.sizes['4xl'], fontWeight: font.weights.bold, color: colors.brand }}>{initial}</Text>
          </View>
          <Text style={{ fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text }}>
            {child.full_name}
          </Text>
          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>
            {age.years} {age.years === 1 ? 'ano' : 'anos'}
            {age.months > 0 ? ` e ${age.months} ${age.months === 1 ? 'mes' : 'meses'}` : ''}
            {' · '}
            {formatDate(child.birth_date)}
          </Text>
        </View>

        {/* Stats grid */}
        {metrics ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
            <StatCell icon="💊" label="Medicamentos" value={metrics.medicationCount} onPress={() => router.push('/(tabs)/saude')} />
            <StatCell icon="⚠️" label="Alergias" value={metrics.allergyCount} onPress={() => router.push('/(tabs)/saude')} />
            <StatCell icon="🏥" label="Consultas" value={metrics.upcomingAppointments} onPress={() => router.push('/(tabs)/saude')} />
            <StatCell icon="🤒" label="Doencas ativas" value={metrics.activeIllnesses} color={metrics.activeIllnesses > 0 ? colors.error : undefined} onPress={() => router.push('/(tabs)/saude')} />
            <StatCell icon="⚽" label="Atividades" value={metrics.activitiesCount} onPress={() => router.push('/atividades')} />
            <StatCell icon="❤️" label="Ultimo check-in" value={metrics.lastCheckin ? formatDate(metrics.lastCheckin) : '—'} numeric={false} onPress={() => router.push('/checkin')} />
          </View>
        ) : null}

        {/* Biografia */}
        <SectionHeader icon="📄" title="Dados basicos" />
        <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm }}>
          <Row label="Genero" value={child.gender === 'female' ? 'Feminino' : child.gender === 'male' ? 'Masculino' : '—'} />
          <Row label="Tipo sanguineo" value={child.blood_type || '—'} />
          <Row label="CPF" value={child.cpf || '—'} />
          <Row label="RG" value={child.rg || '—'} />
        </View>

        {/* Observacoes */}
        {child.notes ? (
          <>
            <SectionHeader icon="📝" title="Observacoes" />
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.text, lineHeight: 20 }}>{child.notes}</Text>
            </View>
          </>
        ) : null}

        {/* Quick links */}
        <SectionHeader icon="🔗" title="Acesso rapido" />
        <View style={{ gap: spacing.sm }}>
          <QuickLink icon="🩺" title="Saude" subtitle="Medicamentos, alergias, consultas, vacinas" onPress={() => router.push('/(tabs)/saude')} />
          <QuickLink icon="🎒" title="Escola" subtitle="Info escolar e logs diarios" onPress={() => router.push('/escola')} />
          <QuickLink icon="📒" title="Atividades" subtitle="Aulas, esportes, eventos recorrentes" onPress={() => router.push('/atividades')} />
          <QuickLink icon="📅" title="Eventos" subtitle="Aniversarios e ocasioes especiais" onPress={() => router.push('/eventos')} />
        </View>
      </ScrollView>
    </View>
  );
}

function StatCell({
  icon, label, value, color, numeric = true, onPress,
}: {
  icon: string; label: string; value: number | string; color?: string; numeric?: boolean; onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        width: '48%', backgroundColor: colors.bgElevated, borderRadius: radius.lg,
        padding: spacing.md, ...shadows.sm,
      }}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>{label}</Text>
      <Text style={{
        fontSize: numeric ? font.sizes.xl : font.sizes.sm,
        fontWeight: font.weights.bold,
        color: color ?? colors.text,
        marginTop: 2,
      }}>
        {value}
      </Text>
    </TouchableOpacity>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
        {title}
      </Text>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>{value}</Text>
    </View>
  );
}

function QuickLink({ icon, title, subtitle, onPress }: { icon: string; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
        backgroundColor: colors.bgElevated, borderRadius: radius.lg,
        padding: spacing.lg, ...shadows.sm,
      }}
    >
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginTop: 2 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textDim} />
    </TouchableOpacity>
  );
}
