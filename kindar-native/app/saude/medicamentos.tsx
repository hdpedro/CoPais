/**
 * Medicamentos — Lista + criar + confirm dose tracking (paridade PWA).
 */
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { logMedicationDose } from 'src/services/health';
import { useAuth } from 'src/store/auth';
import { getDisplayName, getBrazilToday } from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import EmptyState from 'src/components/ui/EmptyState';
import ChildPicker from 'src/components/ui/ChildPicker';
import { SkeletonList } from 'src/components/ui/Skeleton';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Med {
  id: string; name: string; dosage: string; frequency: string; status: string;
  start_date: string; end_date: string | null; reason: string | null;
  childName: string; child_id: string;
  lastDoseAt: string | null;
  lastDoseBy: string | null;
}

interface DoseLog {
  id: string; administered_at: string; administered_by: string;
  administeredByName: string; notes: string | null;
}

// Extract hourly frequency heuristically (matches PWA behavior).
function parseFrequencyHours(freq: string): number | null {
  const m = freq?.match(/(\d+)\s*h/i);
  if (m) return Number(m[1]);
  const day = freq?.match(/(\d+)x\s*\/?\s*dia|(\d+)\s*vez/i);
  if (day) {
    const n = Number(day[1] || day[2]);
    if (n > 0) return Math.round(24 / n);
  }
  return null;
}

function minutesSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export default function MedicamentosScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [meds, setMeds] = useState<Med[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDose, setConfirmingDose] = useState<string | null>(null);

  // Dose history sheet
  const [historyMed, setHistoryMed] = useState<Med | null>(null);
  const [doseHistory, setDoseHistory] = useState<DoseLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase.from('active_medications').select('id, name, dosage, frequency, status, start_date, end_date, reason, child_id, children(full_name)')
        .eq('group_id', activeGroup.groupId).order('created_at', { ascending: false }),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);

    // Fetch latest dose per medication in a single query
    const medIds = (m || []).map((x: any) => x.id);
    const lastDoses: Record<string, { at: string; by: string }> = {};
    if (medIds.length > 0) {
      const { data: doses } = await supabase.from('medication_doses')
        .select('medication_id, administered_at, administered_by')
        .in('medication_id', medIds)
        .order('administered_at', { ascending: false });
      for (const d of (doses || []) as any[]) {
        if (!lastDoses[d.medication_id]) {
          lastDoses[d.medication_id] = { at: d.administered_at, by: d.administered_by };
        }
      }
    }

    setMeds((m || []).map((x: any) => ({
      ...x,
      childName: getDisplayName(x.children?.full_name),
      lastDoseAt: lastDoses[x.id]?.at || null,
      lastDoseBy: lastDoses[x.id]?.by || null,
    })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useCollabRealtime({
    table: 'active_medications',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'medicamento',
    myUserId: userId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleCreate() {
    if (!name.trim() || !selectedChild || !userId || !activeGroup) return;
    setSaving(true);
    // Derive frequency_hours from the user's text so the dose-interval
    // safety check has a numeric anchor. Mirrors PWA logMedicationDose
    // expectations (active_medications.frequency_hours INT NULL).
    const freqHours = parseFrequencyHours(frequency.trim());
    const result = await safeWrite({
      table: 'active_medications', operation: 'insert',
      payload: {
        group_id: activeGroup.groupId, child_id: selectedChild,
        name: name.trim(), dosage: dosage.trim() || 'Conforme prescrição',
        frequency: frequency.trim() || 'Conforme prescrição',
        frequency_hours: freqHours,
        start_date: getBrazilToday(), status: 'active',
        reason: reason.trim() || null, created_by: userId,
      },
    });
    if (result.success) {
      if (!result.queued) notifyAction('health_event_created', activeGroup.groupId, {
        title: name, childName: children.find(c => c.id === selectedChild)?.full_name?.split(' ')[0] || '', eventType: 'medication',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); setName(''); setDosage(''); setFrequency(''); setReason('');
      load();
    } else { toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' }); }
    setSaving(false);
  }

  async function handleFinish(id: string) {
    Alert.alert('Finalizar', 'Marcar medicamento como finalizado?', [
      { text: 'Cancelar' },
      { text: 'Finalizar', onPress: async () => {
        await safeWrite({ table: 'active_medications', operation: 'update', payload: { id, status: 'completed', end_date: getBrazilToday() } });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        load();
      }},
    ]);
  }

  /**
   * Submit a dose via the canonical service `logMedicationDose`, which
   * enforces the same 30-minute hard block as the PWA action and emits a
   * `warning` for sub-half-interval doses. The previous implementation
   * called `safeWrite` directly, bypassing the safety check entirely
   * (P0 patient-safety regression flagged in the 2026-04-27 audit).
   */
  async function submitDose(medId: string) {
    if (!userId) return;
    setConfirmingDose(medId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await logMedicationDose({ medicationId: medId, administeredBy: userId });
    setConfirmingDose(null);

    if (!result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.fallbackError'), variant: 'error' });
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (result.warning) {
      // Half-interval crossed but >30min — log and surface a soft warning.
      toast.show({ message: result.warning, variant: 'warning' });
    }
    await load();
  }

  function handleConfirmDose(med: Med) {
    const freqH = parseFrequencyHours(med.frequency);
    const minsAgo = minutesSince(med.lastDoseAt);
    const tooSoon = minsAgo !== null && freqH !== null && minsAgo < freqH * 30; // < half interval

    if (tooSoon) {
      Alert.alert(
        'Última dose foi há pouco',
        freqH
          ? `A última dose foi há ${formatMinutes(minsAgo!)}. A prescrição sugere a cada ${freqH}h. Confirmar mesmo assim?`
          : `A última dose foi há ${formatMinutes(minsAgo!)}. Confirmar mesmo assim?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Confirmar', style: 'destructive', onPress: () => submitDose(med.id) },
        ]
      );
    } else {
      submitDose(med.id);
    }
  }

  async function openHistory(med: Med) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setHistoryMed(med);
    setHistoryLoading(true);
    const { data } = await supabase.from('medication_doses')
      .select('id, administered_at, administered_by, notes, profiles!medication_doses_administered_by_fkey(full_name)')
      .eq('medication_id', med.id)
      .order('administered_at', { ascending: false })
      .limit(30);
    setDoseHistory((data || []).map((d: any) => ({
      id: d.id,
      administered_at: d.administered_at,
      administered_by: d.administered_by,
      // "Administrado por X" — chip compacto na timeline, firstOnly
      administeredByName: getDisplayName(d.profiles?.full_name, true),
      notes: d.notes,
    })));
    setHistoryLoading(false);
  }

  const activeMeds = meds.filter(m => m.status === 'active');
  const pastMeds = meds.filter(m => m.status !== 'active');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('health.medications')} rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          <ChildPicker
            items={children}
            selectedId={selectedChild}
            onSelect={(id) => setSelectedChild(id ?? '')}
            containerStyle={{ marginBottom: spacing.md }}
            testID="medicamento-form-child-picker"
          />
          <TextInput value={name} onChangeText={setName} placeholder="Nome do medicamento" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput value={dosage} onChangeText={setDosage} placeholder="Dosagem (ex: 5ml)" placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
            <TextInput value={frequency} onChangeText={setFrequency} placeholder="Ex: 8h, 3x/dia" placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
          </View>
          <TextInput value={reason} onChangeText={setReason} placeholder="Motivo (opcional)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <PrimaryButton
            label="Adicionar medicamento"
            onPress={handleCreate}
            loading={saving}
            disabled={!name.trim()}
            testID="medicamento-save-button"
          />
        </View>
      ) : null}

      {loading && meds.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : null}
      <FlatList data={loading && meds.length === 0 ? [] : [...activeMeds, ...pastMeds]} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <EmptyState
            icon="💊"
            title={t('empty.medicamentos.title')}
            description={t('empty.medicamentos.description')}
            action={{ label: t('empty.medicamentos.actionLabel'), onPress: () => setShowForm(true), accessibilityHint: t('empty.medicamentos.actionHint') }}
          />
        )}
        renderItem={({ item }) => {
          const isActive = item.status === 'active';
          const minsAgo = minutesSince(item.lastDoseAt);
          const freqH = parseFrequencyHours(item.frequency);
          const isOverdue = isActive && minsAgo !== null && freqH !== null && minsAgo > freqH * 60;
          return (
            <View style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.lg,
              padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
              opacity: isActive ? 1 : 0.5,
              borderLeftWidth: isOverdue ? 3 : 0, borderLeftColor: colors.warning,
            }}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => openHistory(item)}
                onLongPress={() => isActive ? handleFinish(item.id) : undefined}
                accessibilityRole="button"
                accessibilityLabel={`Histórico de doses de ${item.name}, ${item.childName}, ${item.dosage}, ${isActive ? 'ativo' : 'finalizado'}`}
                accessibilityHint={isActive ? 'Toque para ver histórico, toque longo para finalizar' : 'Toque para ver histórico'}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <Text style={{ fontSize: 22 }}>{isActive ? '💊' : '✅'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                    {item.childName} · {item.dosage} · {item.frequency}
                  </Text>
                  {item.reason ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>Motivo: {item.reason}</Text>
                  ) : null}
                  {isActive ? (
                    <Text style={{ fontSize: font.sizes.xs, color: isOverdue ? colors.warning : colors.textMuted, marginTop: 4 }}>
                      {minsAgo === null
                        ? 'Nenhuma dose registrada'
                        : `Última dose há ${formatMinutes(minsAgo)}${isOverdue ? ' · atrasada' : ''}`}
                    </Text>
                  ) : null}
                </View>
                {isActive ? (
                  <View style={{ backgroundColor: `${colors.success}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.success }}>Ativo</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              {isActive ? (
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <TouchableOpacity
                    disabled={confirmingDose === item.id}
                    onPress={() => handleConfirmDose(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirmar dose de ${item.name}`}
                    accessibilityState={{ disabled: confirmingDose === item.id, busy: confirmingDose === item.id }}
                    style={{
                      flex: 1, paddingVertical: 10, borderRadius: radius.md,
                      backgroundColor: isOverdue ? colors.warning : colors.brand,
                      alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
                      opacity: confirmingDose === item.id ? 0.5 : 1,
                    }}
                  >
                    {confirmingDose === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                          Confirmar dose
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleFinish(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Finalizar ${item.name}`}
                    style={{
                      paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md,
                      borderWidth: 1, borderColor: colors.borderLight,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                      Finalizar
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        }}
      />

      {/* Dose history bottom sheet */}
      <Modal visible={!!historyMed} animationType="slide" transparent onRequestClose={() => setHistoryMed(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setHistoryMed(null)} accessibilityRole="button" accessibilityLabel="Fechar" style={{ flex: 1 }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {historyMed?.name}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
              Últimas doses registradas
            </Text>
            {historyLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
            ) : doseHistory.length === 0 ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl }}>
                Nenhuma dose registrada ainda
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 400 }}>
                {doseHistory.map((d, i) => (
                  <View
                    key={d.id}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                      paddingVertical: spacing.md,
                      borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
                    }}
                  >
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.brand}15`, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={18} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.medium, color: colors.text }}>
                        {new Date(d.administered_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                        })}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                        {d.administeredByName}
                      </Text>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
