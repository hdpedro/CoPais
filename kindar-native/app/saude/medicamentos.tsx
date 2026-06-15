/**
 * Medicamentos — Lista + criar + confirm dose tracking (paridade PWA).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert, ActivityIndicator, Modal, ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { logMedicationDose } from 'src/services/health';
import { useAuth } from 'src/store/auth';
import { getDisplayName, getBrazilToday } from 'src/lib/constants';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import EmptyState from 'src/components/ui/EmptyState';
import ChildPicker from 'src/components/ui/ChildPicker';
import { SkeletonList } from 'src/components/ui/Skeleton';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
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

interface MedicamentosCache {
  meds: Med[];
  children: Array<{ id: string; full_name: string }>;
}

const EMPTY_CACHE: MedicamentosCache = { meds: [], children: [] };

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

// Compact elapsed-duration ("45 min" / "2h" / "2h30") embedded in the
// "última dose há {time}" line. The numeric value is kept; only the unit
// labels go through t() so EN/ES/FR/DE don't show hardcoded "min"/"h".
function formatMinutes(min: number): string {
  const t = useI18n.getState().t;
  if (min < 60) return t('relTime.minShort', { count: min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0
    ? t('relTime.hMinShort', { h, m: String(m).padStart(2, '0') })
    : t('relTime.hShort', { count: h });
}

export default function MedicamentosScreen() {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedChild, setSelectedChild] = useState('');
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDose, setConfirmingDose] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Dose history sheet
  const [historyMed, setHistoryMed] = useState<Med | null>(null);
  const [doseHistory, setDoseHistory] = useState<DoseLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const { data, loading, refresh } = useCachedFetch<MedicamentosCache>({
    cacheKey: activeGroup ? `saude_medicamentos_${activeGroup.groupId}` : null,
    tag: 'saude:medicamentos:load',
    empty: EMPTY_CACHE,
    fetcher: async () => {
      const [{ data: m }, { data: c }] = await Promise.all([
        supabase.from('active_medications').select('id, name, dosage, frequency, status, start_date, end_date, reason, child_id, children(full_name)')
          .eq('group_id', activeGroup!.groupId).eq('care_type', 'medication').order('created_at', { ascending: false }),
        supabase.from('children').select('id, full_name').eq('group_id', activeGroup!.groupId),
      ]);
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
      return {
        meds: (m || []).map((x: any) => ({
          ...x,
          childName: getDisplayName(x.children?.full_name),
          lastDoseAt: lastDoses[x.id]?.at || null,
          lastDoseBy: lastDoses[x.id]?.by || null,
        })),
        children: c || [],
      };
    },
  });
  const meds = data.meds;
  const children = data.children;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedChild && children.length > 0) setSelectedChild(children[0].id);
  }, [children, selectedChild]);

  useCollabRealtime({
    table: 'active_medications',
    groupId: activeGroup?.groupId,
    onChange: refresh,
    displayLabel: 'medicamento',
    myUserId: userId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function resetForm() {
    setEditingId(null);
    setName(''); setDosage(''); setFrequency(''); setReason('');
  }

  // Editar — abre o form preenchido. Feedback UX 2026-06-08: um erro de
  // digitação no nome ("vwrme") só dava pra corrigir finalizando + recriando,
  // porque não existia edição.
  function startEdit(med: Med) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(med.id);
    setSelectedChild(med.child_id);
    setName(med.name);
    setDosage(med.dosage);
    setFrequency(med.frequency);
    setReason(med.reason ?? '');
    setShowForm(true);
  }

  // Meio-termo (tester iOS 2026-06-04: medicamento salvava sem dosagem/
  // frequência e virava "Conforme prescrição" SILENCIOSAMENTE — parecia que
  // o usuário tinha digitado isso). As colunas dosage/frequency são NOT NULL,
  // então mantemos o fallback — mas só depois de uma confirmação explícita,
  // pra a escolha de registrar "conforme prescrição" ser consciente.
  async function handleCreate() {
    if (!name.trim() || !selectedChild || !userId || !activeGroup) return;
    const hasDosage = !!dosage.trim();
    const hasFrequency = !!frequency.trim();
    if (!hasDosage || !hasFrequency) {
      const missing = !hasDosage && !hasFrequency
        ? t('medications.missingBoth')
        : !hasDosage ? t('medications.missingDosage') : t('medications.missingFrequency');
      Alert.alert(
        t('medications.saveWithoutDetailsTitle'),
        t('medications.saveWithoutDetailsBody', { missing }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('medications.saveAnyway'), onPress: () => { void persistMedication(); } },
        ],
      );
      return;
    }
    await persistMedication();
  }

  async function persistMedication() {
    if (!name.trim() || !selectedChild || !userId || !activeGroup) return;
    setSaving(true);
    // Derive frequency_hours from the user's text so the dose-interval
    // safety check has a numeric anchor. Mirrors PWA logMedicationDose
    // expectations (active_medications.frequency_hours INT NULL).
    const freqHours = parseFrequencyHours(frequency.trim());
    const fields = {
      child_id: selectedChild,
      name: name.trim(), dosage: dosage.trim() || 'Conforme prescrição',
      frequency: frequency.trim() || 'Conforme prescrição',
      frequency_hours: freqHours,
      reason: reason.trim() || null,
    };
    const result = editingId
      ? await safeWrite({ table: 'active_medications', operation: 'update', payload: { id: editingId, ...fields } })
      : await safeWrite({
          table: 'active_medications', operation: 'insert',
          payload: { group_id: activeGroup.groupId, ...fields, start_date: getBrazilToday(), status: 'active', created_by: userId },
        });
    if (result.success) {
      // notifica só na criação (não a cada edição)
      if (!editingId && !result.queued) notifyAction('health_event_created', activeGroup.groupId, {
        title: name, childName: children.find(c => c.id === selectedChild)?.full_name?.split(' ')[0] || '', eventType: 'medication',
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); resetForm();
      refresh();
    } else { toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' }); }
    setSaving(false);
  }

  async function handleFinish(id: string) {
    Alert.alert(t('medications.finish'), t('medications.finishConfirm'), [
      { text: t('common.cancel') },
      { text: t('medications.finish'), onPress: async () => {
        await safeWrite({ table: 'active_medications', operation: 'update', payload: { id, status: 'completed', end_date: getBrazilToday() } });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refresh();
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
    await refresh();
  }

  function handleConfirmDose(med: Med) {
    const freqH = parseFrequencyHours(med.frequency);
    const minsAgo = minutesSince(med.lastDoseAt);
    const tooSoon = minsAgo !== null && freqH !== null && minsAgo < freqH * 30; // < half interval

    if (tooSoon) {
      Alert.alert(
        t('medications.lastDoseRecentTitle'),
        freqH
          ? t('medications.lastDoseRecentWithInterval', { time: formatMinutes(minsAgo!), hours: freqH })
          : t('medications.lastDoseRecent', { time: formatMinutes(minsAgo!) }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.confirm'), style: 'destructive', onPress: () => submitDose(med.id) },
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
      <ScreenHeader title={t('health.medications')} rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => { if (showForm) resetForm(); setShowForm(!showForm); } }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {editingId ? (
            <View style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="create-outline" size={14} color={colors.brand} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('medications.editingBadge')}
              </Text>
            </View>
          ) : null}
          <ChildPicker
            items={children}
            selectedId={selectedChild}
            onSelect={(id) => setSelectedChild(id ?? '')}
            containerStyle={{ marginBottom: spacing.md }}
            testID="medicamento-form-child-picker"
          />
          <TextInput value={name} onChangeText={setName} placeholder={t('health.medicationName')} placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <TextInput value={dosage} onChangeText={setDosage} placeholder={t('medications.dosagePlaceholder')} placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
            <TextInput value={frequency} onChangeText={setFrequency} placeholder={t('medications.frequencyPlaceholder')} placeholderTextColor={colors.textDim}
              style={{ flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text }} />
          </View>
          <TextInput value={reason} onChangeText={setReason} placeholder={t('health.reasonPlaceholder')} placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <PrimaryButton
            label={editingId ? t('medications.saveChanges') : t('empty.medicamentos.actionLabel')}
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
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
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
                accessibilityLabel={t('medications.itemA11yLabel', { name: item.name, child: item.childName, dosage: item.dosage, status: isActive ? t('medications.statusActive') : t('medications.statusFinished') })}
                accessibilityHint={isActive ? t('medications.itemA11yHintActive') : t('medications.itemA11yHint')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
              >
                <Text style={{ fontSize: 22 }}>{isActive ? '💊' : '✅'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                    {item.childName} · {item.dosage} · {item.frequency}
                  </Text>
                  {item.reason ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{t('medications.reasonPrefix', { reason: item.reason })}</Text>
                  ) : null}
                  {isActive ? (
                    <Text style={{ fontSize: font.sizes.xs, color: isOverdue ? colors.warning : colors.textMuted, marginTop: 4 }}>
                      {minsAgo === null
                        ? t('medications.noDoseLogged')
                        : isOverdue
                          ? t('medications.lastDoseAgoOverdue', { time: formatMinutes(minsAgo) })
                          : t('medications.lastDoseAgo', { time: formatMinutes(minsAgo) })}
                    </Text>
                  ) : null}
                </View>
                {isActive ? (
                  <View style={{ backgroundColor: `${colors.success}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.success }}>{t('health.active')}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              {isActive ? (
                <>
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                  <TouchableOpacity
                    disabled={confirmingDose === item.id}
                    onPress={() => handleConfirmDose(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t('medications.confirmDoseA11y', { name: item.name })}
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
                          {t('medications.confirmDose')}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleFinish(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('medications.finishA11y', { name: item.name })}
                    style={{
                      paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md,
                      borderWidth: 1, borderColor: colors.borderLight,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>
                      {t('medications.finish')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => startEdit(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t('medications.editA11y', { name: item.name })}
                    style={{
                      paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md,
                      borderWidth: 1, borderColor: colors.borderLight,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 16 }}>
                  {t('medications.actionsHint')}
                </Text>
                </>
              ) : null}
            </View>
          );
        }}
      />

      {/* Dose history bottom sheet */}
      <Modal visible={!!historyMed} animationType="slide" transparent onRequestClose={() => setHistoryMed(null)}>
        <ModalBackdrop onClose={() => setHistoryMed(null)} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '80%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {historyMed?.name}
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.md }}>
              {t('medications.recentDosesLogged')}
            </Text>
            {historyLoading ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: spacing.xl }} />
            ) : doseHistory.length === 0 ? (
              <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl }}>
                {t('health.noDoseRegistered')}
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
                        {`${intl.formatDate(d.administered_at, { day: '2-digit', month: '2-digit' })} ${intl.formatTime(d.administered_at)}`}
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
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
