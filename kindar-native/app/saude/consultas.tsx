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
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Appt { id: string; title: string; appointment_date: string; location: string | null; status: string; notes: string | null; childName: string; profName: string | null; child_id: string; }

const STATUS_COLORS: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: '#3b82f6' }, completed: { label: 'Realizada', color: '#4CAF50' }, cancelled: { label: 'Cancelada', color: '#8A8A8A' },
};

export default function ConsultasScreen() {
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Consultas" rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {children.length > 1 ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
              {children.map(c => (
                <TouchableOpacity key={c.id} onPress={() => setSelectedChild(c.id)}
                  style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: selectedChild === c.id ? colors.brand : colors.bgSurface }}>
                  <Text style={{ fontSize: font.sizes.sm, color: selectedChild === c.id ? '#fff' : colors.text }}>{c.full_name.split(' ')[0]}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
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
          <TouchableOpacity onPress={handleCreate} disabled={saving || !title.trim()}
            style={{ backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', opacity: saving || !title.trim() ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: font.weights.bold }}>{saving ? 'Salvando...' : 'Registrar consulta'}</Text>
          </TouchableOpacity>
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
              ) : null}
              {item.status === 'completed' && item.notes ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' }}>
                  Notas: {item.notes}
                </Text>
              ) : null}
            </View>
          );
        }}
      />

      {/* Complete modal — diagnostico + resumo + retorno */}
      <Modal visible={!!completing} transparent animationType="slide" onRequestClose={() => setCompleting(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{ flex: 1, backgroundColor: '#00000080' }} />
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
    </View>
  );
}
