/**
 * Ficha de Emergência — resumo médico crítico + link público para compartilhar
 * com escola/babysitter/socorro.
 * Mirrors PWA /saude/emergencia.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  Share, Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { fetchChildren, type Child } from 'src/services/children';
import { regenerateEmergencyToken } from 'src/services/health';
import { supabase } from 'src/lib/supabase';
import ChildPicker from 'src/components/ui/ChildPicker';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface HealthSummary {
  bloodType: string | null;
  allergies: { id: string; name: string; severity: string | null }[];
  medications: { id: string; name: string; dosage: string | null }[];
  pediatricianName: string | null;
  pediatricianPhone: string | null;
  insurance: string | null;
  sus: string | null;
}

function getAge(birthDate: string): number {
  return Math.floor((Date.now() - new Date(birthDate + 'T12:00:00').getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export default function EmergenciaScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [children, setChildren] = useState<(Child & { emergency_token: string | null })[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [summary, setSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rotating, setRotating] = useState(false);

  useEffect(() => {
    async function loadChildren() {
      if (!activeGroup) return;
      const list = await fetchChildren(activeGroup.groupId);
      // Query emergency_token separately
      const { data: withTokens } = await supabase
        .from('children')
        .select('id, emergency_token')
        .eq('group_id', activeGroup.groupId);
      const tokenMap: Record<string, string | null> = {};
      (withTokens || []).forEach((c: any) => { tokenMap[c.id] = c.emergency_token; });
      const merged = list.map(c => ({ ...c, emergency_token: tokenMap[c.id] || null }));
      setChildren(merged);
      if (merged.length > 0) setSelectedChildId(merged[0].id);
    }
    loadChildren();
  }, [activeGroup]);

  const groupId = activeGroup?.groupId;
  const loadSummary = useCallback(async () => {
    if (!selectedChildId) { setLoading(false); return; }

    const [medicalRes, allergiesRes, medsRes] = await Promise.all([
      supabase
        .from('child_medical_info')
        .select('blood_type, insurance_name, sus_number, primary_pediatrician_id')
        .eq('child_id', selectedChildId)
        .maybeSingle(),
      supabase
        .from('child_allergies')
        .select('id, name, severity')
        .eq('child_id', selectedChildId)
        .order('severity', { ascending: false })
        .limit(20),
      supabase
        .from('active_medications')
        .select('id, name, dosage')
        .eq('child_id', selectedChildId)
        .eq('status', 'active')
        .limit(20),
    ]);

    const medical = (medicalRes as any).data || null;
    let pediatricianName = null;
    let pediatricianPhone = null;
    if (medical?.primary_pediatrician_id) {
      const { data: ped } = await supabase
        .from('medical_professionals')
        .select('name, phone')
        .eq('id', medical.primary_pediatrician_id)
        .maybeSingle();
      pediatricianName = (ped as any)?.name || null;
      pediatricianPhone = (ped as any)?.phone || null;
    } else if (groupId) {
      // Fallback: pega o pediatra mais antigo cadastrado no grupo quando ninguem marcou explicitamente
      const { data: ped } = await supabase
        .from('medical_professionals')
        .select('name, phone')
        .eq('group_id', groupId)
        .eq('specialty', 'pediatra')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      pediatricianName = (ped as any)?.name || null;
      pediatricianPhone = (ped as any)?.phone || null;
    }

    setSummary({
      bloodType: medical?.blood_type || null,
      allergies: (allergiesRes.data || []) as any,
      medications: (medsRes.data || []) as any,
      pediatricianName,
      pediatricianPhone,
      insurance: medical?.insurance_name || null,
      sus: medical?.sus_number || null,
    });
    setLoading(false);
  }, [selectedChildId, groupId]);

  useFocusEffect(useCallback(() => { loadSummary(); }, [loadSummary]));

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadSummary();
    setRefreshing(false);
  }

  async function handleRegenerate() {
    const child = children.find(c => c.id === selectedChildId);
    if (!child || !activeGroup) return;
    Alert.alert(
      'Regenerar token?',
      'O link atual deixara de funcionar. Compartilhe o novo link com quem precisar.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Regenerar',
          style: 'destructive',
          onPress: async () => {
            setRotating(true);
            const r = await regenerateEmergencyToken({ groupId: activeGroup.groupId, childId: child.id });
            setRotating(false);
            if (r.success) {
              setChildren(prev => prev.map(c => c.id === child.id ? { ...c, emergency_token: r.emergency_token } : c));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Token regenerado', 'O link antigo não funciona mais.');
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Erro', r.error || 'Nao consegui regenerar.');
            }
          },
        },
      ],
    );
  }

  async function handleShare() {
    const child = children.find(c => c.id === selectedChildId);
    if (!child) return;
    if (!child.emergency_token) {
      Alert.alert('Token ausente', 'Esta criança ainda não tem token de emergência. Edite os dados da criança na versão web para gerar um.');
      return;
    }
    const url = `${WEB_URL}/saude/emergencia/publico?childId=${child.id}&token=${child.emergency_token}`;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Ficha de emergência de ${child.full_name}: ${url}\n\nNão precisa de login. Expira após uso ou em 24h.`,
        url,
      });
    } catch {
      // cancelled
    }
  }


  const child = children.find(c => c.id === selectedChildId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Ficha de emergência
        </Text>
      </View>

      <ChildPicker
        items={children}
        selectedId={selectedChildId}
        onSelect={(id) => { setSelectedChildId(id); setLoading(true); }}
        containerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        testID="emergencia-child-picker"
      />

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !summary || !child ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: 44, marginBottom: spacing.md }}>🚨</Text>
          <Text style={{ fontSize: font.sizes.md, color: colors.textSecondary, textAlign: 'center' }}>
            Adicione uma criança para criar a ficha de emergência
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {/* Hero */}
          <View style={{ backgroundColor: colors.error, borderRadius: radius.xl, padding: spacing.xl, ...shadows.md, marginBottom: spacing.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Text style={{ fontSize: 20 }}>🚨</Text>
              <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.bold, textTransform: 'uppercase', letterSpacing: 1 }}>
                Dados criticos
              </Text>
            </View>
            <Text style={{ color: '#fff', fontSize: font.sizes['2xl'], fontWeight: font.weights.bold }}>
              {child.full_name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: font.sizes.sm, marginTop: 2 }}>
              {getAge(child.birth_date)} anos · Nascimento {child.birth_date.split('-').reverse().join('/')}
            </Text>
          </View>

          {/* Blood type */}
          <InfoCard
            icon="🩸"
            label="Tipo sanguineo"
            value={summary.bloodType || 'Não informado'}
            highlight={!summary.bloodType}
          />

          {/* Allergies */}
          <InfoCard
            icon="⚠️"
            label={`Alergias (${summary.allergies.length})`}
            onPress={() => router.push('/saude/alergias')}
          >
            {summary.allergies.length === 0 ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>Nenhuma registrada</Text>
            ) : (
              summary.allergies.map(a => (
                <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: a.severity === 'severe' ? colors.error : a.severity === 'moderate' ? colors.warning : colors.textMuted }} />
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1 }}>{a.name}</Text>
                  {a.severity === 'severe' ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.error, fontWeight: font.weights.semibold }}>GRAVE</Text>
                  ) : null}
                </View>
              ))
            )}
          </InfoCard>

          {/* Medications */}
          <InfoCard
            icon="💊"
            label={`Medicamentos ativos (${summary.medications.length})`}
            onPress={() => router.push('/saude/medicamentos')}
          >
            {summary.medications.length === 0 ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>Nenhum em uso</Text>
            ) : (
              summary.medications.map(m => (
                <Text key={m.id} style={{ fontSize: font.sizes.sm, color: colors.text, paddingVertical: 2 }}>
                  {m.name}{m.dosage ? ` · ${m.dosage}` : ''}
                </Text>
              ))
            )}
          </InfoCard>

          {/* Pediatrician */}
          <InfoCard icon="👨‍⚕️" label="Pediatra">
            {summary.pediatricianName ? (
              <>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>{summary.pediatricianName}</Text>
                {summary.pediatricianPhone ? (
                  <Text style={{ fontSize: font.sizes.sm, color: colors.brand, marginTop: 2 }}>{summary.pediatricianPhone}</Text>
                ) : null}
              </>
            ) : (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary }}>Não informado</Text>
            )}
          </InfoCard>

          {/* Insurance */}
          <InfoCard icon="🏥" label="Plano de saúde">
            <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
              {summary.insurance || 'Não informado'}
            </Text>
            {summary.sus ? (
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>SUS: {summary.sus}</Text>
            ) : null}
          </InfoCard>

          {/* Share actions */}
          <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <TouchableOpacity
              onPress={handleShare}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Compartilhar ficha"
              style={{
                backgroundColor: colors.brand, borderRadius: radius.md,
                paddingVertical: spacing.md, flexDirection: 'row',
                alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
              }}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                Compartilhar ficha
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRegenerate}
              activeOpacity={0.85}
              disabled={rotating}
              accessibilityRole="button"
              accessibilityLabel="Regenerar token e revogar link atual"
              accessibilityState={{ disabled: rotating, busy: rotating }}
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.md,
                paddingVertical: spacing.md, flexDirection: 'row',
                alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                borderWidth: 1, borderColor: colors.borderLight,
                opacity: rotating ? 0.5 : 1,
              }}
            >
              {rotating ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={18} color={colors.text} />
                  <Text style={{ color: colors.text, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                    Regenerar token (revogar link atual)
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs }}>
              O link funciona sem login. Compartilhe apenas com quem cuida da criança.
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function InfoCard({ icon, label, value, highlight, children, onPress }: {
  icon: string; label: string; value?: string; highlight?: boolean;
  children?: React.ReactNode; onPress?: () => void;
}) {
  const content = (
    <View style={{
      backgroundColor: colors.bgElevated, borderRadius: radius.lg,
      padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
      borderLeftWidth: highlight ? 3 : 0, borderLeftColor: colors.warning,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: value || children ? spacing.xs : 0 }}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
        <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
          {label}
        </Text>
        {onPress ? <Ionicons name="chevron-forward" size={14} color={colors.textDim} /> : null}
      </View>
      {value ? (
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: highlight ? colors.warning : colors.text }}>
          {value}
        </Text>
      ) : null}
      {children}
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${label}${value ? `: ${value}` : ''}`}>{content}</TouchableOpacity> : content;
}
