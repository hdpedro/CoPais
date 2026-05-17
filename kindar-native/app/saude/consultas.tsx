/**
 * Consultas — Lista de consultas + criar nova.
 */
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, Alert, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { useAuth } from 'src/store/auth';
import { getDisplayName } from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { DatePickerField, TimePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import ChildPicker from 'src/components/ui/ChildPicker';
import { confirmDestructive } from 'src/components/ui/DestructiveConfirm';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Appt { id: string; title: string; appointment_date: string; location: string | null; status: string; notes: string | null; childName: string; profName: string | null; child_id: string; }

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: '#3b82f6' }, completed: { label: 'Realizada', color: '#4CAF50' }, cancelled: { label: 'Cancelada', color: '#8A8A8A' },
};

export default function ConsultasScreen() {
  const t = useI18n(s => s.t);
  const { userId, activeGroup } = useAuth();
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [selectedChild, setSelectedChild] = useState('');
  const [title, setTitle] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [timeHHMM, setTimeHHMM] = useState<string>('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Optional medical_professional_id to link the appointment to a saved
  // profissional. Mirrors PWA `AppointmentFormClient.tsx`.
  const [professionals, setProfessionals] = useState<Array<{ id: string; name: string; specialty: string }>>([]);
  const [selectedProfessional, setSelectedProfessional] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: a }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('medical_appointments').select('id, title, appointment_date, location, status, notes, child_id, children(full_name), medical_professionals(name)')
        .eq('group_id', activeGroup.groupId).order('appointment_date', { ascending: false }).limit(50),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
      supabase.from('medical_professionals').select('id, name, specialty').eq('group_id', activeGroup.groupId).order('name'),
    ]);
    setAppts((a || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name), profName: x.medical_professionals?.name || null })));
    setChildren(c || []);
    setProfessionals((p || []) as Array<{ id: string; name: string; specialty: string }>);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useCollabRealtime({
    table: 'medical_appointments',
    groupId: activeGroup?.groupId,
    onChange: load,
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
      load();
    } else { Alert.alert('Erro', result.error || 'Falha'); }
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
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error || 'Falha ao concluir consulta');
    }
  }

  async function handleCancel(id: string) {
    Alert.alert('Cancelar consulta', 'Marcar esta consulta como cancelada?', [
      { text: 'Não', style: 'cancel' },
      {
        text: 'Cancelar consulta',
        style: 'destructive',
        onPress: async () => {
          await safeWrite({ table: 'medical_appointments', operation: 'update', payload: { id, status: 'cancelled' } });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          load();
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
      ? 'Consulta agendada — vai sumir da agenda dos dois responsáveis.'
      : appt.status === 'completed'
        ? 'Consulta realizada — apagar perde notas e histórico.'
        : 'Consulta cancelada — apenas remoção do registro.';
    const ok = await confirmDestructive({
      title: `Excluir "${appt.title}"?`,
      warning: statusLabel + '\n\nEsta ação não pode ser desfeita.',
      destructiveLabel: 'Excluir',
    });
    if (!ok) return;
    const result = await safeWrite({
      table: 'medical_appointments',
      operation: 'delete',
      payload: { id: appt.id },
    });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error || 'Falha ao excluir consulta');
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
      Alert.alert('Erro', 'Preencha título, data e hora.');
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
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error || 'Falha ao salvar alterações');
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
          <TextInput value={title} onChangeText={setTitle} placeholder="Tipo (Pediatra, Dentista...)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}><DatePickerField value={dateIso} onChange={setDateIso} placeholder="Data" /></View>
            <View style={{ flex: 1 }}><TimePickerField value={timeHHMM || null} onChange={setTimeHHMM} placeholder="Hora" /></View>
          </View>
          {/* Professional picker (optional) */}
          {professionals.length > 0 ? (
            <View style={{ marginBottom: spacing.sm }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4 }}>
                Profissional (opcional)
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedProfessional(null)}
                    style={{
                      paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
                      backgroundColor: selectedProfessional === null ? colors.brand : colors.bgSurface,
                    }}
                  >
                    <Text style={{ fontSize: font.sizes.xs, color: selectedProfessional === null ? '#fff' : colors.text }}>
                      Sem profissional
                    </Text>
                  </TouchableOpacity>
                  {professionals.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => setSelectedProfessional(p.id)}
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
          <TextInput value={location} onChangeText={setLocation} placeholder="Local (opcional)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />
          <TextInput value={notes} onChangeText={setNotes} placeholder="Observações (opcional)" placeholderTextColor={colors.textDim} multiline
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md, minHeight: 60 }} />
          <PrimaryButton
            label="Registrar consulta"
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
              Resumo para a próxima consulta
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
              Briefing clínico desde a última consulta concluída
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.brand} />
        </TouchableOpacity>
      ) : null}

      <FlatList data={appts} keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <View style={{ alignItems: 'center', paddingVertical: spacing['4xl'] }}><Text style={{ fontSize: 32, marginBottom: spacing.md }}>🏥</Text><Text style={{ color: colors.textMuted }}>Nenhuma consulta</Text></View>
        )}
        renderItem={({ item }) => {
          const st = STATUS_COLORS[item.status] || STATUS_COLORS.scheduled;
          const date = new Date(item.appointment_date);
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
                    {item.childName} · {date.toLocaleDateString('pt-BR')}{item.location ? ` · ${item.location}` : ''}{item.profName ? ` · ${item.profName}` : ''}
                  </Text>
                </View>
                <View style={{ backgroundColor: `${st.color}15`, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: st.color, fontWeight: font.weights.medium }}>{st.label}</Text>
                </View>
              </View>
              {canComplete ? (
                <>
                  {/* Linha 1: ações primárias da consulta agendada */}
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                    <TouchableOpacity
                      onPress={() => openCompleteModal(item)}
                      style={{ flex: 1, backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                        Concluir
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleCancel(item.id)}
                      style={{ paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight }}
                    >
                      <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
                        Cancelar
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
                      accessibilityLabel="Editar consulta"
                      style={{ flex: 1, paddingVertical: 12, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    >
                      <Ionicons name="create-outline" size={16} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: font.sizes.sm }}>
                        Editar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDelete(item)}
                      accessibilityRole="button"
                      accessibilityLabel="Excluir consulta"
                      style={{ paddingVertical: 12, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fef2f2', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                      <Text style={{ color: '#b91c1c', fontSize: font.sizes.sm }}>
                        Excluir
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
                    accessibilityLabel="Excluir consulta"
                    style={{ paddingVertical: 12, paddingHorizontal: spacing.md, minHeight: 44, borderRadius: radius.md, borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fef2f2', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                    <Text style={{ color: '#b91c1c', fontSize: font.sizes.sm }}>
                      Excluir
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {item.status === 'completed' && item.notes ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' }}>
                  Notas: {item.notes}
                </Text>
              ) : null}
            </View>
          );
        }}
      />

      {/* Complete modal — diagnóstico + resumo + retorno.
          Tap no backdrop fecha (padrão iOS Mail/Notes). */}
      <Modal visible={!!completing} transparent animationType="slide" onRequestClose={() => setCompleting(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            activeOpacity={1}
            accessibilityLabel="Fechar"
            accessibilityRole="button"
            onPress={() => setCompleting(null)}
            style={{ flex: 1, backgroundColor: '#00000080' }}
          />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                  Concluir consulta
                </Text>
                <TouchableOpacity onPress={() => setCompleting(null)} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {completing ? (
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
                  {completing.title} — {completing.childName}
                </Text>
              ) : null}

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Diagnóstico</Text>
              <TextInput
                value={completeDiagnosis}
                onChangeText={setCompleteDiagnosis}
                placeholder="Ex: Otite média aguda"
                placeholderTextColor={colors.textDim}
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }}
              />

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Resumo / orientações</Text>
              <TextInput
                value={completeSummary}
                onChangeText={setCompleteSummary}
                placeholder="Receita, exames pedidos, recomendações..."
                placeholderTextColor={colors.textDim}
                multiline
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, minHeight: 100, textAlignVertical: 'top', marginBottom: spacing.lg }}
              />

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Data de retorno (opcional)</Text>
              <DatePickerField value={completeReturnDate || null} onChange={d => setCompleteReturnDate(d || '')} placeholder="DD/MM/AAAA" />

              <TouchableOpacity
                onPress={handleConfirmComplete}
                disabled={completeSaving}
                style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.xl, opacity: completeSaving ? 0.5 : 1 }}
              >
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                  {completeSaving ? 'Salvando…' : 'Marcar como concluída'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit modal — title / date / time / location / notes pra uma consulta
          agendada. Reusa os mesmos pickers do form de criar pra UX consistente. */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity
            activeOpacity={1}
            accessibilityLabel="Fechar"
            accessibilityRole="button"
            onPress={() => setEditing(null)}
            style={{ flex: 1, backgroundColor: '#00000080' }}
          />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '85%' }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                  Editar consulta
                </Text>
                <TouchableOpacity onPress={() => setEditing(null)} hitSlop={8}>
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              {editing ? (
                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
                  {editing.childName}
                </Text>
              ) : null}

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Título *</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Ex: Pediatra, Dentista"
                placeholderTextColor={colors.textDim}
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }}
              />

              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
                <View style={{ flex: 3 }}>
                  <DatePickerField label="Data *" value={editDateIso || null} onChange={d => setEditDateIso(d || '')} placeholder="DD/MM/AAAA" />
                </View>
                <View style={{ flex: 2 }}>
                  <TimePickerField label="Hora *" value={editTimeHHMM || null} onChange={t => setEditTimeHHMM(t || '')} placeholder="HH:MM" />
                </View>
              </View>

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Local</Text>
              <TextInput
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Ex: Clínica São Lucas"
                placeholderTextColor={colors.textDim}
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.lg }}
              />

              <Text style={{ fontSize: font.sizes.sm, color: colors.text, marginBottom: spacing.xs }}>Observações</Text>
              <TextInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Detalhes adicionais..."
                placeholderTextColor={colors.textDim}
                multiline
                style={{ backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top', marginBottom: spacing.lg }}
              />

              <TouchableOpacity
                onPress={handleConfirmEdit}
                disabled={editSaving}
                style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg, opacity: editSaving ? 0.5 : 1 }}
              >
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.bold }}>
                  {editSaving ? 'Salvando…' : 'Salvar alterações'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
