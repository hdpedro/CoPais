/**
 * Consultas — Lista de consultas + criar nova.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert, Modal, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { useAuth } from 'src/store/auth';
import { getDisplayName } from 'src/lib/constants';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import { DatePickerField, TimePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import ChildPicker from 'src/components/ui/ChildPicker';
import { confirmDestructive } from 'src/components/ui/DestructiveConfirm';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Appt { id: string; title: string; appointment_date: string; location: string | null; status: string; notes: string | null; childName: string; profName: string | null; child_id: string; }

interface ConsultasCache {
  appts: Appt[];
  children: Array<{ id: string; full_name: string }>;
  professionals: Array<{ id: string; name: string; specialty: string }>;
}

const EMPTY_CACHE: ConsultasCache = { appts: [], children: [], professionals: [] };

const STATUS_COLORS: Record<string, { labelKey: string; color: string }> = {
  scheduled: { labelKey: 'health.export.statusScheduled', color: '#3b82f6' }, completed: { labelKey: 'health.export.statusCompleted', color: '#4CAF50' }, cancelled: { labelKey: 'health.export.statusCancelled', color: '#8A8A8A' },
};

export default function ConsultasScreen() {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [selectedChild, setSelectedChild] = useState('');
  const [title, setTitle] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [timeHHMM, setTimeHHMM] = useState<string>('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);

  const { data, loading, refresh } = useCachedFetch<ConsultasCache>({
    cacheKey: activeGroup ? `saude_consultas_${activeGroup.groupId}` : null,
    tag: 'saude:consultas:load',
    empty: EMPTY_CACHE,
    fetcher: async () => {
      const [{ data: a }, { data: c }, { data: p }] = await Promise.all([
        supabase.from('medical_appointments').select('id, title, appointment_date, location, status, notes, child_id, children(full_name), medical_professionals(name)')
          .eq('group_id', activeGroup!.groupId).order('appointment_date', { ascending: false }).limit(50),
        supabase.from('children').select('id, full_name').eq('group_id', activeGroup!.groupId),
        supabase.from('medical_professionals').select('id, name, specialty').eq('group_id', activeGroup!.groupId).order('name'),
      ]);
      return {
        appts: (a || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name), profName: x.medical_professionals?.name || null })),
        children: c || [],
        professionals: (p || []) as Array<{ id: string; name: string; specialty: string }>,
      };
    },
  });
  const appts = data.appts;
  const children = data.children;
  const professionals = data.professionals;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selectedChild && children.length > 0) setSelectedChild(children[0].id);
  }, [children, selectedChild]);

  useCollabRealtime({
    table: 'medical_appointments',
    groupId: activeGroup?.groupId,
    onChange: refresh,
    displayLabel: 'consulta',
    myUserId: userId,
  });

  async function handleCreate() {
    if (!title.trim() || !selectedChild || !userId || !activeGroup) return;
    const appointmentIso = timeHHMM ? `${dateIso}T${timeHHMM}:00` : `${dateIso}T12:00:00`;

    setSaving(true);
    const result = await safeWrite({
      table: 'medical_appointments', operation: 'insert',
      payload: {
        group_id: activeGroup.groupId,
        child_id: selectedChild,
        professional_id: selectedProfessional, // ← mirrors PWA createAppointment
        title: title.trim(),
        appointment_date: appointmentIso,
        location: location.trim() || null,
        status: 'scheduled',
        notes: notes.trim() || null,
        created_by: userId,
      },
    });
    if (result.success) {
      if (!result.queued) notifyAction('health_event_created', activeGroup.groupId, { title: title, childName: children.find(c => c.id === selectedChild)?.full_name?.split(' ')[0] || '', eventType: 'appointment' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); setTitle(''); setDateIso(dateToIso(new Date())); setTimeHHMM(''); setLocation(''); setNotes(''); setSelectedProfessional(null);
      refresh();
    } else { toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' }); }
    setSaving(false);
  }

  // Completion modal state — captures diagnosis, summary, return date,
  // mirroring PWA's `CompleteAppointmentForm.tsx` so the resumo de consulta
  // tem o conteúdo clínico esperado.
  const [completing, setCompleting] = useState<Appt | null>(null);
  const [completeDiagnosis, setCompleteDiagnosis] = useState('');
  const [completeSummary, setCompleteSummary] = useState('');
  const [completeReturnDate, setCompleteReturnDate] = useState<string>('');
  const [completeSaving, setCompleteSaving] = useState(false);

  function openCompleteModal(appt: Appt) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCompleting(appt);
    setCompleteDiagnosis('');
    setCompleteSummary('');
    setCompleteReturnDate('');
  }

  async function handleConfirmComplete() {
    if (!completing) return;
    setCompleteSaving(true);

    // Schema: medical_appointments has `summary` + `return_date` + `return_notes`
    // (NOT diagnosis/outcome_notes/completed_at). PWA `completeAppointment`
    // combines summary + diagnosis + prescriptions into one formatted text in
    // the `summary` column — mirror that here so the resumo de consulta and
    // the PWA detail view both render the same content.
    const parts: string[] = [];
    if (completeSummary.trim()) parts.push(completeSummary.trim());
    if (completeDiagnosis.trim()) parts.push(`Diagnóstico: ${completeDiagnosis.trim()}`);
    const formattedSummary = parts.join('\n') || null;

    const result = await safeWrite({
      table: 'medical_appointments',
      operation: 'update',
      payload: {
        id: completing.id,
        status: 'completed',
        summary: formattedSummary,
        return_date: completeReturnDate || null,
      },
    });
    setCompleteSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCompleting(null);
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  async function handleCancel(id: string) {
    Alert.alert(t('appointments.cancelTitle'), t('appointments.cancelMessage'), [
      { text: t('common.no'), style: 'cancel' },
      {
        text: t('appointments.cancelTitle'),
        style: 'destructive',
        onPress: async () => {
          await safeWrite({ table: 'medical_appointments', operation: 'update', payload: { id, status: 'cancelled' } });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          refresh();
        },
      },
    ]);
  }

  // Hard-delete da consulta — usuário Angelino reportou 2026-05-16 não ter
  // como excluir uma consulta criada por engano (ex: data errada salva no
  // wizard de registrar.tsx antes do bug de appointment_date ser corrigido).
  // Confirma com Alert.alert e remove via safeWrite('delete'). DELETE cascade
  // é seguro porque medical_appointments não tem filhos referenciando-o por
  // FK NOT NULL (return_notes / summary ficam no próprio row).
  async function handleDelete(appt: Appt) {
    const statusLabel = appt.status === 'scheduled'
      ? t('appointments.deleteWarnScheduled')
      : appt.status === 'completed'
        ? t('appointments.deleteWarnCompleted')
        : t('appointments.deleteWarnCancelled');
    const ok = await confirmDestructive({
      title: t('appointments.deleteTitle', { title: appt.title }),
      warning: statusLabel + '\n\n' + t('ui.destructiveConfirm.defaultWarning'),
      destructiveLabel: t('common.delete'),
    });
    if (!ok) return;
    const result = await safeWrite({
      table: 'medical_appointments',
      operation: 'delete',
      payload: { id: appt.id },
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.deleteFailed'), variant: 'error' });
    }
  }

  // Inline edit modal — permite ajustar título / data / hora / local / notas
  // de uma consulta agendada. Reusa os mesmos campos do form de criação
  // (DatePickerField / TimePickerField) pra UX consistente. Disponível só
  // pra status='scheduled' — uma consulta já realizada/cancelada não deve
  // ser "remarcada" sem antes voltar pro estado scheduled (caso de uso raro;
  // por enquanto usar Excluir + criar nova).
  const [editing, setEditing] = useState<Appt | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDateIso, setEditDateIso] = useState<string>('');
  const [editTimeHHMM, setEditTimeHHMM] = useState<string>('');
  const [editLocation, setEditLocation] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  function openEditModal(appt: Appt) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const dt = new Date(appt.appointment_date);
    const iso = dateToIso(dt);
    const hh = String(dt.getHours()).padStart(2, '0');
    const mm = String(dt.getMinutes()).padStart(2, '0');
    setEditTitle(appt.title);
    setEditDateIso(iso);
    setEditTimeHHMM(`${hh}:${mm}`);
    setEditLocation(appt.location || '');
    setEditNotes(appt.notes || '');
    setEditing(appt);
  }

  async function handleConfirmEdit() {
    if (!editing) return;
    if (!editTitle.trim() || !editDateIso || !editTimeHHMM) {
      toast.show({ message: t('toasts.validation.fillRequired'), variant: 'error' });
      return;
    }
    setEditSaving(true);
    // BR timezone explícito — mesmo formato usado no INSERT em
    // src/services/health.ts:createAppointment.
    const appointmentIso = `${editDateIso}T${editTimeHHMM}:00-03:00`;
    const result = await safeWrite({
      table: 'medical_appointments',
      operation: 'update',
      payload: {
        id: editing.id,
        title: editTitle.trim(),
        appointment_date: appointmentIso,
        location: editLocation.trim() || null,
        notes: editNotes.trim() || null,
      },
    });
    setEditSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('health.consultationsTitle')} rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          <ChildPicker
            items={children}
            selectedId={selectedChild}
            onSelect={(id) => setSelectedChild(id ?? '')}
            containerStyle={{ marginBottom: spacing.md }}
            testID="consulta-form-child-picker"
          />
          <TextInput value={title} onChangeText={setTitle} placeholder={t('appointments.typePlaceholder')} placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}><DatePickerField value={dateIso} onChange={setDateIso} placeholder={t('health.whatsapp.date')} minimumDate={new Date()} /></View>
            <View style={{ flex: 1 }}><TimePickerField value={timeHHMM || null} onChange={setTimeHHMM} placeholder={t('appointments.timePlaceholder')} /></View>
          </View>
          {/* Professional picker (optional) */}
          {professionals.length > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4 }}>
                {t('appointments.professionalOptional')}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedProfessional(null)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: selectedProfessional === null }}
                    accessibilityLabel={t('appointments.noProfessional')}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
                      backgroundColor: selectedProfessional === null ? colors.brand : colors.bgSurface,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.xs, color: selectedProfessional === null ? '#fff' : colors.text }}>
                      {t('appointments.noProfessional')}
                    </Text>
                  </TouchableOpacity>
                  {professionals.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setSelectedProfessional(p.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: selectedProfessional === p.id }}
                      accessibilityLabel={p.name}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
                        backgroundColor: selectedProfessional === p.id ? colors.brand : colors.bgSurface,
                      }}
                    >
                      <Text style={{ fontSize: font.sizes.xs, color: selectedProfessional === p.id ? '#fff' : colors.text }} numberOfLines={1}>
                        👨‍⚕️ {p.name.split(' ')[0]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : null}
          <TextInput value={location} onChangeText={setLocation} placeholder={t('appointments.locationOptional')} placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={notes} onChangeText={setNotes} placeholder={t('appointments.notesOptional')} placeholderTextColor={colors.textDim} multiline
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md, minHeight: 60 }} />
          <PrimaryButton
            label={t('appointments.registerButton')}
            onPress={handleCreate}
            loading={saving}
            disabled={!title.trim()}
            testID="consulta-save-button"
          />
        </View>
      ) : null}

      {/* Quick action: prepare for next appointment with full summary */}
      {!showForm ? (
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/saude/consultas/resumo'); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('appointments.nextSummaryTitle')}
          accessibilityHint={t('appointments.nextSummaryDesc')}
          style={{
            margin: spacing.lg, marginBottom: 0,
            backgroundColor: colors.brandLight,
            borderRadius: radius.md,
            paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            borderWidth: 1, borderColor: colors.brand + '40',
          }}
        >
          <Ionicons name="document-text-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
              {t('appointments.nextSummaryTitle')}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
              {t('appointments.nextSummaryDesc')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
        </TouchableOpacity>
      ) : null}

      <FlatList data={appts} keyExtractor={item => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colors.brand} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>🏥</Text><Text style={{ color: colors.textMuted }}>{t('appointments.empty')}</Text></View>
        )}
        renderItem={({ item }) => {
          const st = STATUS_COLORS[item.status] || STATUS_COLORS.scheduled;
          const canComplete = item.status === 'scheduled';
          return (
            <View style={{
              backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg,
              marginBottom: spacing.sm, ...shadows.sm,
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Text style={{ fontSize: 20 }}>🏥</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.title}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                    {item.childName} · {intl.formatDate(item.appointment_date)}{item.location ? ` · ${item.location}` : ''}{item.profName ? ` · ${item.profName}` : ''}
                  </Text>
                </View>
                <View style={{ backgroundColor: `${st.color}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: st.color, fontWeight: font.weights.medium }}>{t(st.labelKey)}</Text>
                </View>
              </View>
              {canComplete ? (
                <>
                  {/* Linha 1: ações primárias da consulta agendada */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                    <TouchableOpacity
                      onPress={() => openCompleteModal(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('appointments.completeA11y', { title: item.title })}
                      style={{ flex: 1, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                        {t('health.completeAppointment.complete')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleCancel(item.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('appointments.cancelA11y', { title: item.title })}
                      style={{ paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
                        {t('common.cancel')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {/* Linha 2: ações secundárias (editar / excluir) — bug
                      Angelino 2026-05-16: usuário não tinha como editar
                      data/hora salva errada e nem excluir consulta criada
                      por engano. Editar só pra scheduled (cancelada/realizada
                      seguem regra anterior). */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    <TouchableOpacity
                      onPress={() => openEditModal(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('appointments.editTitle')}
                      style={{ flex: 1, paddingVertical: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
                        {t('common.edit')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel={t('appointments.deleteA11y')}
                      style={{ paddingVertical: 12, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fef2f2', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                      <Text style={{ color: '#b91c1c', fontSize: font.sizes.sm }}>
                        {t('common.delete')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                // Realizada ou cancelada: só permite excluir (sem editar —
                // editar exigiria reverter status, regra de negócio mais
                // complexa que fica pra próxima PR).
                <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
                  <TouchableOpacity
                    onPress={() => handleDelete(item)}
                    accessibilityRole="button"
                    accessibilityLabel={t('appointments.deleteA11y')}
                    style={{ paddingVertical: 12, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fef2f2', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                    <Text style={{ color: '#b91c1c', fontSize: font.sizes.sm }}>
                      {t('common.delete')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'completed' && item.notes ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' }}>
                  {t('appointments.notesPrefix', { notes: item.notes })}
                </Text>
              ) : null}
            </View>
          );
        }}
      />

      {/* Complete modal — diagnóstico + resumo + retorno.
          Tap no backdrop fecha (padrão iOS Mail/Notes). */}
      <Modal visible={!!completing} transparent animationType="slide" onRequestClose={() => setCompleting(null)}>
        <ModalBackdrop onClose={() => setCompleting(null)} align="bottom" dim={0.5} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                  {t('health.completeAppointment.completeButton')}
                </Text>
                <TouchableOpacity onPress={() => setCompleting(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {completing ? (
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
                  {completing.title} — {completing.childName}
                </Text>
              ) : null}

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>{t('health.diagnosis')}</Text>
              <TextInput
                value={completeDiagnosis}
                onChangeText={setCompleteDiagnosis}
                placeholder={t('appointments.diagnosisPlaceholder')}
                placeholderTextColor={colors.textDim}
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }}
              />

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>{t('appointments.summaryLabel')}</Text>
              <TextInput
                value={completeSummary}
                onChangeText={setCompleteSummary}
                placeholder={t('appointments.summaryPlaceholder')}
                placeholderTextColor={colors.textDim}
                multiline
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, minHeight: 100, textAlignVertical: 'top', marginBottom: spacing.lg }}
              />

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>{t('appointments.returnDateLabel')}</Text>
              <DatePickerField value={completeReturnDate || null} onChange={d => setCompleteReturnDate(d || '')} placeholder={t('appointments.datePlaceholder')} />

              <View style={{ marginTop: spacing.xl }}>
                <PrimaryButton
                  label={t('appointments.completeSubmit')}
                  onPress={handleConfirmComplete}
                  loading={completeSaving}
                  testID="consultas-complete-submit"
                />
              </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Edit modal — title / date / time / location / notes pra uma consulta
          agendada. Reusa os mesmos pickers do form de criar pra UX consistente. */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <ModalBackdrop onClose={() => setEditing(null)} align="bottom" dim={0.5} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                  {t('appointments.editTitle')}
                </Text>
                <TouchableOpacity onPress={() => setEditing(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('common.close')}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {editing ? (
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
                  {editing.childName}
                </Text>
              ) : null}

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>{t('appointments.titleRequired')}</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder={t('appointments.titlePlaceholder')}
                placeholderTextColor={colors.textDim}
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }}
              />

              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                <View style={{ flex: 3 }}>
                  <DatePickerField label={t('health.appointmentForm.date')} value={editDateIso || null} onChange={d => setEditDateIso(d || '')} placeholder={t('appointments.datePlaceholder')} />
                </View>
                <View style={{ flex: 2 }}>
                  <TimePickerField label={t('appointments.timeRequired')} value={editTimeHHMM || null} onChange={tv => setEditTimeHHMM(tv || '')} placeholder={t('appointments.timePlaceholderShort')} />
                </View>
              </View>

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>{t('health.appointmentForm.locationLabel')}</Text>
              <TextInput
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder={t('appointments.locationPlaceholder')}
                placeholderTextColor={colors.textDim}
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }}
              />

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>{t('health.notes')}</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder={t('appointments.notesPlaceholder')}
                placeholderTextColor={colors.textDim}
                multiline
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.lg }}
              />

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton
                  label={t('childDetail.saveChanges')}
                  onPress={handleConfirmEdit}
                  loading={editSaving}
                  testID="consultas-edit-submit"
                />
              </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
