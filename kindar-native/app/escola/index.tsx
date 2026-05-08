/**
 * Escola — Informacoes escolares por crianca + timeline de registros (school_logs).
 *
 * Paridade com:
 *   - PWA `/criancas/[id]?tab=educacao` → child_education (info estatica)
 *   - PWA `/escola` → school_logs (timeline de notas/reunioes/lembretes/etc.)
 *
 * Antes do 2026-04-27 essa tela so editava `child_education`. A timeline
 * de `school_logs` era PWA-only — fechado por essa migracao.
 */
import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { fetchChildren, fetchChildEducation, upsertChildEducation, type ChildEducation } from 'src/services/children';
import {
  fetchSchoolLogs, createSchoolLog, updateSchoolLog, deleteSchoolLog, toggleSchoolLogCompleted,
  fetchSchoolLogEventTime,
  EVENT_SUBTYPES, NOTE_SUBTYPES, SUBTYPE_LABEL, SUBTYPE_ICON, SUBTYPE_HINT, getKind,
  type SchoolLog, type SchoolLogType, type SchoolKind,
} from 'src/services/school';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import EmptyState from 'src/components/ui/EmptyState';
import { TimePickerField, DatePickerField } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface ChildSchool {
  childId: string;
  childFullName: string;
  childName: string;
  education: ChildEducation | null;
}

interface ChildOption {
  id: string;
  full_name: string;
  short_name: string;
}

type Tab = 'info' | 'logs';

// Use SUBTYPE_LABEL / SUBTYPE_ICON from services/school.ts so PWA + native
// share a single source of truth (icons, copy, kind grouping).
const TYPE_LABELS = SUBTYPE_LABEL;
const TYPE_ICONS = SUBTYPE_ICON;

type ComposerStage =
  | { stage: 'closed' }
  | { stage: 'pick-kind' }
  | { stage: 'pick-subtype'; kind: SchoolKind }
  | { stage: 'form'; subtype: SchoolLogType };

function displayTime(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function formatLogDate(iso: string): string {
  // log_date is YYYY-MM-DD — append T12:00 to avoid timezone walk
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('pt-BR');
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0];
}

export default function EscolaScreen() {
  const { activeGroup, userId } = useAuth();
  const groupId = activeGroup?.groupId ?? null;

  // Deep link from calendar: tap on event with school_log_id sets ?highlight=<id>
  // → land directly on Registros tab.
  const { highlight } = useLocalSearchParams<{ highlight?: string }>();
  const [tab, setTab] = useState<Tab>(highlight ? 'logs' : 'info');

  // Info tab state
  const [schools, setSchools] = useState<ChildSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ChildSchool | null>(null);
  const [saving, setSaving] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [grade, setGrade] = useState('');
  const [className, setClassName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [coordinatorName, setCoordinatorName] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [exitTime, setExitTime] = useState('');
  const [extracurriculars, setExtracurriculars] = useState('');

  // Logs tab state
  const [logs, setLogs] = useState<SchoolLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [childOptions, setChildOptions] = useState<ChildOption[]>([]);
  const [composer, setComposer] = useState<ComposerStage>({ stage: 'closed' });
  const [editingLog, setEditingLog] = useState<SchoolLog | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [logChildId, setLogChildId] = useState<string | null>(null);
  const [logSubtype, setLogSubtype] = useState<SchoolLogType>('exam');
  const [logTitle, setLogTitle] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logDate, setLogDate] = useState<string>(todayIso());
  const [logEventTime, setLogEventTime] = useState<string>('');
  const [logSubject, setLogSubject] = useState<string>('');
  const [logScore, setLogScore] = useState<string>('');
  const [filterKind, setFilterKind] = useState<'all' | SchoolKind>('all');

  const load = useCallback(async () => {
    if (!groupId) return;
    const children = await fetchChildren(groupId);
    const results: ChildSchool[] = [];
    const opts: ChildOption[] = [];
    for (const child of children) {
      const edu = await fetchChildEducation(child.id);
      results.push({
        childId: child.id,
        childFullName: child.full_name,
        childName: child.full_name.split(' ')[0],
        education: edu,
      });
      opts.push({
        id: child.id,
        full_name: child.full_name,
        short_name: child.full_name.split(' ')[0],
      });
    }
    setSchools(results);
    setChildOptions(opts);
    setLoading(false);
  }, [groupId]);

  const loadLogs = useCallback(async () => {
    if (!groupId) return;
    setLogsLoading(true);
    const rows = await fetchSchoolLogs(groupId);
    setLogs(rows);
    setLogsLoading(false);
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadLogs();
    }, [load, loadLogs]),
  );

  function openEditor(child: ChildSchool) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const e = child.education;
    setSchoolName(e?.school_name || '');
    setSchoolAddress(e?.school_address || '');
    setSchoolPhone(e?.school_phone || '');
    setGrade(e?.grade || '');
    setClassName(e?.class_name || '');
    setTeacherName(e?.teacher_name || '');
    setCoordinatorName(e?.coordinator_name || '');
    setEntryTime(displayTime(e?.entry_time || null));
    setExitTime(displayTime(e?.exit_time || null));
    setExtracurriculars((e?.extracurricular_activities || []).join(', '));
    setEditing(child);
  }

  async function handleSave() {
    if (!editing || !groupId) return;
    const entryIso = entryTime ? `${entryTime}:00` : null;
    const exitIso = exitTime ? `${exitTime}:00` : null;
    const extras = extracurriculars.split(',').map(s => s.trim()).filter(Boolean);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await upsertChildEducation({
      childId: editing.childId, groupId,
      school_name: schoolName.trim() || null,
      school_address: schoolAddress.trim() || null,
      school_phone: schoolPhone.trim() || null,
      grade: grade.trim() || null,
      class_name: className.trim() || null,
      teacher_name: teacherName.trim() || null,
      coordinator_name: coordinatorName.trim() || null,
      entry_time: entryIso,
      exit_time: exitIso,
      extracurricular_activities: extras.length > 0 ? extras : null,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error);
    }
  }

  function resetLogForm(initialSubtype: SchoolLogType) {
    setLogChildId(childOptions[0]?.id ?? null);
    setLogSubtype(initialSubtype);
    setLogTitle('');
    setLogDescription('');
    setLogDate(todayIso());
    setLogEventTime('');
    setLogSubject('');
    setLogScore('');
  }

  function openCreateLog() {
    if (childOptions.length === 0) {
      Alert.alert('Cadastre uma criança primeiro', 'Você precisa adicionar uma criança antes de registrar eventos escolares.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setComposer({ stage: 'pick-kind' });
  }

  function pickSubtype(subtype: SchoolLogType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetLogForm(subtype);
    setComposer({ stage: 'form', subtype });
  }

  function closeComposer() {
    setComposer({ stage: 'closed' });
  }

  async function openEditLog(log: SchoolLog) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogChildId(log.child_id);
    setLogSubtype(log.log_type);
    setLogTitle(log.title);
    setLogDescription(log.description || '');
    setLogDate(log.log_date);
    setLogSubject(log.subject || '');
    setLogScore(log.score || '');
    // event_time lives only on the calendar mirror, fetch it for prefill.
    const eventTime = getKind(log.log_type) === 'event' ? await fetchSchoolLogEventTime(log.id) : null;
    setLogEventTime(eventTime ? eventTime.slice(0, 5) : '');
    setEditingLog(log);
  }

  async function handleSaveNewLog() {
    if (!groupId || !userId) return;
    if (!logTitle.trim()) {
      Alert.alert('Título obrigatório', 'Dê um nome ao registro.');
      return;
    }
    if (!logChildId) {
      Alert.alert('Criança obrigatória', 'Escolha pra qual criança o registro vale.');
      return;
    }
    if (logSubtype === 'exam' && !logSubject.trim()) {
      Alert.alert('Matéria obrigatória', 'Para uma prova, informe a matéria.');
      return;
    }
    setSavingLog(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await createSchoolLog({
      groupId,
      childId: logChildId,
      subtype: logSubtype,
      title: logTitle,
      description: logDescription,
      logDate,
      eventTime: logEventTime || null,
      subject: logSubject || null,
      score: logScore || null,
    });
    setSavingLog(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeComposer();
      await loadLogs();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', res.error || 'Não consegui salvar.');
    }
  }

  async function handleSaveEditLog() {
    if (!editingLog) return;
    if (!logTitle.trim()) {
      Alert.alert('Título obrigatório', 'Dê um nome ao registro.');
      return;
    }
    if (!logChildId) {
      Alert.alert('Criança obrigatória', 'Escolha pra qual criança o registro vale.');
      return;
    }
    if (logSubtype === 'exam' && !logSubject.trim()) {
      Alert.alert('Matéria obrigatória', 'Para uma prova, informe a matéria.');
      return;
    }
    setSavingLog(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await updateSchoolLog(editingLog.id, {
      title: logTitle,
      description: logDescription,
      subtype: logSubtype,
      childId: logChildId,
      logDate,
      eventTime: getKind(logSubtype) === 'event' ? (logEventTime || null) : null,
      subject: logSubtype === 'exam' ? logSubject : null,
      score: logSubtype === 'exam' ? (logScore || null) : null,
    });
    setSavingLog(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingLog(null);
      await loadLogs();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', res.error || 'Não consegui salvar.');
    }
  }

  async function handleDeleteLog(log: SchoolLog) {
    Alert.alert(
      'Excluir registro',
      `"${log.title}" sera removido permanentemente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            const res = await deleteSchoolLog(log.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await loadLogs();
            } else {
              Alert.alert('Erro', res.error || 'Nao consegui excluir.');
            }
          },
        },
      ],
    );
  }

  async function handleToggleCompleted(log: SchoolLog) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // optimistic flip
    setLogs(prev => prev.map(l => l.id === log.id ? { ...l, completed: !l.completed } : l));
    const res = await toggleSchoolLogCompleted(log.id, log.completed);
    if (!res.success) {
      // rollback on failure
      setLogs(prev => prev.map(l => l.id === log.id ? { ...l, completed: log.completed } : l));
      Alert.alert('Erro', res.error || 'Nao consegui atualizar.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Escola" />

      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <TabPill label="Informacoes" active={tab === 'info'} onPress={() => setTab('info')} />
        <TabPill label={`Registros${logs.length > 0 ? ` (${logs.length})` : ''}`} active={tab === 'logs'} onPress={() => setTab('logs')} />
      </View>

      {tab === 'info' ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}>
          {schools.length === 0 && !loading ? <EmptyState icon="🏫" title="Nenhuma crianca cadastrada" /> : null}
          {schools.map(s => {
            const e = s.education;
            return (
              <TouchableOpacity
                key={s.childId}
                activeOpacity={0.8}
                onPress={() => openEditor(s)}
                style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadows.sm }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>{s.childName}</Text>
                  <Ionicons name="create-outline" size={18} color={colors.brand} />
                </View>
                {e?.school_name ? <Row icon="🏫" label="Escola" value={e.school_name} /> :
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>Toque para cadastrar a escola</Text>}
                {e?.grade ? <Row icon="📚" label="Serie" value={e.grade} /> : null}
                {e?.class_name ? <Row icon="🎒" label="Turma" value={e.class_name} /> : null}
                {e?.teacher_name ? <Row icon="👩‍🏫" label="Professor" value={e.teacher_name} /> : null}
                {e?.coordinator_name ? <Row icon="🗂️" label="Coordenador" value={e.coordinator_name} /> : null}
                {e?.entry_time ? <Row icon="🕐" label="Horario" value={`${displayTime(e.entry_time)} - ${displayTime(e.exit_time)}`} /> : null}
                {e?.school_address ? <Row icon="📍" label="Endereco" value={e.school_address} /> : null}
                {e?.school_phone ? <Row icon="📞" label="Telefone" value={e.school_phone} /> : null}
                {e?.extracurricular_activities && e.extracurricular_activities.length > 0 ? (
                  <Row icon="⚽" label="Extras" value={e.extracurricular_activities.join(', ')} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={loadLogs} tintColor={colors.brand} />}>
            {/* Filter chips */}
            {logs.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                <Chip label="Tudo" active={filterKind === 'all'} onPress={() => setFilterKind('all')} />
                <Chip label="📅 Eventos" active={filterKind === 'event'} onPress={() => setFilterKind('event')} />
                <Chip label="📝 Registros" active={filterKind === 'note'} onPress={() => setFilterKind('note')} />
              </View>
            ) : null}

            {logsLoading && logs.length === 0 ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing['3xl'] }} />
            ) : logs.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Nenhum registro escolar"
                subtitle="Toque em + abaixo para registrar uma prova, reunião, nota ou conquista."
              />
            ) : (
              logs.filter(l => filterKind === 'all' || getKind(l.log_type) === filterKind).map((log) => {
                const isHomework = log.log_type === 'homework';
                const isEvent = getKind(log.log_type) === 'event';
                const isHighlighted = highlight && log.id === highlight;
                return (
                  <View
                    key={log.id}
                    style={{
                      backgroundColor: colors.bgElevated,
                      borderRadius: radius.xl,
                      padding: spacing.lg,
                      marginBottom: spacing.sm,
                      opacity: log.completed ? 0.6 : 1,
                      borderWidth: isHighlighted ? 2 : 0,
                      borderColor: isHighlighted ? colors.brand : 'transparent',
                      ...shadows.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                      {isHomework ? (
                        <TouchableOpacity onPress={() => handleToggleCompleted(log)} style={{ marginTop: 2 }}>
                          <View
                            style={{
                              width: 22, height: 22, borderRadius: 6,
                              borderWidth: 2,
                              borderColor: log.completed ? colors.brand : colors.borderLight,
                              backgroundColor: log.completed ? colors.brand : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {log.completed ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                          </View>
                        </TouchableOpacity>
                      ) : null}

                      <Text style={{ fontSize: 22 }}>{TYPE_ICONS[log.log_type]}</Text>

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text
                            style={{
                              fontSize: font.sizes.md,
                              fontWeight: font.weights.semibold,
                              color: colors.text,
                              textDecorationLine: log.completed ? 'line-through' : 'none',
                              flex: 1,
                            }}
                            numberOfLines={2}
                          >
                            {log.title}
                          </Text>
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginLeft: spacing.sm }}>
                            {formatLogDate(log.log_date)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                          {TYPE_LABELS[log.log_type]}
                          {log.subject ? ` · ${log.subject}` : ''}
                          {log.child_full_name ? ` · ${log.child_full_name}` : ''}
                          {isEvent ? ' · 📅' : ''}
                        </Text>
                        {log.score ? (
                          <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: font.weights.semibold, marginTop: 4 }}>
                            Nota: {log.score}
                          </Text>
                        ) : null}
                        {log.description ? (
                          <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.xs }}>
                            {log.description}
                          </Text>
                        ) : null}
                        {log.logged_by_name ? (
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textDim, marginTop: 4 }}>
                            Por {log.logged_by_name}
                          </Text>
                        ) : null}

                        <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}>
                          <TouchableOpacity onPress={() => openEditLog(log)}>
                            <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                              Editar
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteLog(log)}>
                            <Text style={{ fontSize: font.sizes.xs, color: colors.error, fontWeight: font.weights.medium }}>
                              Excluir
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={openCreateLog}
            activeOpacity={0.85}
            style={{
              position: 'absolute',
              bottom: spacing['3xl'],
              right: spacing.xl,
              backgroundColor: colors.brand,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radius.full,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              ...shadows.md,
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: font.weights.semibold, fontSize: font.sizes.md }}>
              Novo registro
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Editor de Informacoes (child_education) */}
      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setEditing(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              Escola de {editing?.childName}
            </Text>
            <ScrollView>
              <Label>Nome da escola</Label>
              <Input value={schoolName} onChangeText={setSchoolName} placeholder="Ex: Colegio Sao Paulo" />

              <Label>Serie / Ano</Label>
              <Input value={grade} onChangeText={setGrade} placeholder="Ex: 3º ano fundamental" />

              <Label>Turma</Label>
              <Input value={className} onChangeText={setClassName} placeholder="Ex: 3A" />

              <Label>Professor(a)</Label>
              <Input value={teacherName} onChangeText={setTeacherName} placeholder="Ex: Maria" />

              <Label>Coordenador(a)</Label>
              <Input value={coordinatorName} onChangeText={setCoordinatorName} placeholder="Ex: Joao" />

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TimePickerField label="Entrada" value={entryTime || null} onChange={setEntryTime} placeholder="07:30" />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePickerField label="Saida" value={exitTime || null} onChange={setExitTime} placeholder="12:00" />
                </View>
              </View>

              <Label>Endereco</Label>
              <Input value={schoolAddress} onChangeText={setSchoolAddress} placeholder="Rua, numero, bairro" />

              <Label>Telefone</Label>
              <Input value={schoolPhone} onChangeText={setSchoolPhone} placeholder="(11) 99999-9999" keyboardType="phone-pad" />

              <Label>Atividades extras (separe por virgula)</Label>
              <Input value={extracurriculars} onChangeText={setExtracurriculars} placeholder="Natacao, ingles, balet" />

              <TouchableOpacity
                disabled={saving}
                onPress={handleSave}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.md,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                {saving ? <ActivityIndicator color="#fff" /> : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                    Salvar
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Composer 3-stage: pick-kind → pick-subtype → form */}
      <Modal
        visible={composer.stage !== 'closed'}
        animationType="slide"
        transparent
        onRequestClose={closeComposer}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={closeComposer} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />

            {composer.stage === 'pick-kind' ? (
              <>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.lg }}>
                  O que você quer registrar?
                </Text>
                <KindCard
                  emoji="📅"
                  title="Evento"
                  description="Algo que acontece em uma data"
                  example="Ex: prova, reunião, tarefa, evento"
                  accentBg={`${colors.secondary}10`}
                  accentBorder={`${colors.secondary}40`}
                  onPress={() => setComposer({ stage: 'pick-subtype', kind: 'event' })}
                />
                <View style={{ height: spacing.sm }} />
                <KindCard
                  emoji="📝"
                  title="Registro"
                  description="Uma informação sobre a escola"
                  example="Ex: nota, comportamento, conquista"
                  accentBg={`${colors.brand}10`}
                  accentBorder={`${colors.brand}40`}
                  onPress={() => setComposer({ stage: 'pick-subtype', kind: 'note' })}
                />
              </>
            ) : null}

            {composer.stage === 'pick-subtype' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <TouchableOpacity onPress={() => setComposer({ stage: 'pick-kind' })} hitSlop={8}>
                    <Text style={{ fontSize: font.sizes.sm, color: colors.secondary, fontWeight: font.weights.medium }}>‹ Voltar</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                    {composer.kind === 'event' ? '📅 Evento' : '📝 Registro'}
                  </Text>
                  <View style={{ width: 60 }} />
                </View>
                <ScrollView style={{ maxHeight: 460 }}>
                  {(composer.kind === 'event' ? EVENT_SUBTYPES : NOTE_SUBTYPES).map((s) => (
                    <SubtypeRow
                      key={s}
                      icon={SUBTYPE_ICON[s]}
                      label={SUBTYPE_LABEL[s]}
                      hint={SUBTYPE_HINT[s]}
                      onPress={() => pickSubtype(s)}
                    />
                  ))}
                  {composer.kind === 'event' ? (
                    <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.secondary}08`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.secondary}30` }}>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                        📅 Eventos vão automaticamente para o calendário da família.
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : null}

            {composer.stage === 'form' ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <TouchableOpacity
                    onPress={() => setComposer({ stage: 'pick-subtype', kind: getKind(composer.subtype) })}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: colors.secondary, fontWeight: font.weights.medium }}>‹ Voltar</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                    {SUBTYPE_ICON[composer.subtype]} {SUBTYPE_LABEL[composer.subtype]}
                  </Text>
                  <View style={{ width: 60 }} />
                </View>

                <Label>Criança</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                  {childOptions.map((c) => (
                    <Chip key={c.id} label={c.short_name} active={logChildId === c.id} onPress={() => setLogChildId(c.id)} />
                  ))}
                </View>

                {composer.subtype === 'exam' ? (
                  <>
                    <Label>Matéria</Label>
                    <Input value={logSubject} onChangeText={setLogSubject} placeholder="Ex: Matemática" />
                  </>
                ) : null}

                <Label>{composer.subtype === 'exam' ? 'Conteúdo / Tópico' : 'Título'}</Label>
                <Input
                  value={logTitle}
                  onChangeText={setLogTitle}
                  placeholder={composer.subtype === 'exam' ? 'Ex: Trigonometria + funções' : `Ex: ${SUBTYPE_LABEL[composer.subtype]}`}
                />

                <Label>Data</Label>
                <DatePickerField value={logDate} onChange={(d) => setLogDate(d || todayIso())} />

                {getKind(composer.subtype) === 'event' ? (
                  <>
                    <Label>Horário (opcional)</Label>
                    <TimePickerField value={logEventTime || null} onChange={(t) => setLogEventTime(t || '')} />
                  </>
                ) : null}

                {composer.subtype === 'exam' ? (
                  <>
                    <Label>Nota (opcional — preencha após a prova)</Label>
                    <Input value={logScore} onChangeText={setLogScore} placeholder='Ex: "8,5" ou "B+"' />
                  </>
                ) : null}

                <Label>Observação (opcional)</Label>
                <Input
                  value={logDescription}
                  onChangeText={setLogDescription}
                  placeholder="Detalhes adicionais"
                  multiline
                />

                {getKind(composer.subtype) === 'event' ? (
                  <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.secondary}08`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.secondary}30` }}>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                      📅 Este item será adicionado ao calendário automaticamente.
                    </Text>
                  </View>
                ) : null}

                <TouchableOpacity
                  disabled={savingLog}
                  onPress={handleSaveNewLog}
                  style={{
                    backgroundColor: colors.brand, borderRadius: radius.md,
                    paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg,
                    opacity: savingLog ? 0.5 : 1,
                  }}
                >
                  {savingLog ? <ActivityIndicator color="#fff" /> : (
                    <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                      Registrar
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Editar registro existente — todos os campos editáveis. Mudar
          subtype entre kind=event/note recria/remove o espelho do calendário. */}
      <Modal visible={!!editingLog} animationType="slide" transparent onRequestClose={() => setEditingLog(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setEditingLog(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              {SUBTYPE_ICON[logSubtype]} Editar {SUBTYPE_LABEL[logSubtype].toLowerCase()}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Label>Tipo</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingVertical: 2 }}>
                {[...EVENT_SUBTYPES, ...NOTE_SUBTYPES].map((s) => (
                  <Chip
                    key={s}
                    label={`${SUBTYPE_ICON[s]} ${SUBTYPE_LABEL[s]}`}
                    active={logSubtype === s}
                    onPress={() => setLogSubtype(s)}
                  />
                ))}
              </ScrollView>

              <Label>Criança</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                {childOptions.map((c) => (
                  <Chip key={c.id} label={c.short_name} active={logChildId === c.id} onPress={() => setLogChildId(c.id)} />
                ))}
              </View>

              {logSubtype === 'exam' ? (
                <>
                  <Label>Matéria</Label>
                  <Input value={logSubject} onChangeText={setLogSubject} placeholder="Ex: Matemática" />
                </>
              ) : null}

              <Label>{logSubtype === 'exam' ? 'Conteúdo / Tópico' : 'Título'}</Label>
              <Input
                value={logTitle}
                onChangeText={setLogTitle}
                placeholder={logSubtype === 'exam' ? 'Ex: Trigonometria + funções' : `Ex: ${SUBTYPE_LABEL[logSubtype]}`}
              />

              <Label>Data</Label>
              <DatePickerField value={logDate} onChange={(d) => setLogDate(d || todayIso())} />

              {getKind(logSubtype) === 'event' ? (
                <>
                  <Label>Horário (opcional)</Label>
                  <TimePickerField value={logEventTime || null} onChange={(t) => setLogEventTime(t || '')} />
                </>
              ) : null}

              {logSubtype === 'exam' ? (
                <>
                  <Label>Nota (opcional)</Label>
                  <Input value={logScore} onChangeText={setLogScore} placeholder='Ex: "8,5" ou "B+"' />
                </>
              ) : null}

              <Label>Observação (opcional)</Label>
              <Input value={logDescription} onChangeText={setLogDescription} placeholder="Detalhes adicionais" multiline />

              {getKind(logSubtype) === 'event' ? (
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.secondary}08`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.secondary}30` }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                    📅 Aparece no calendário em {(() => {
                      try { return new Date(`${logDate}T12:00:00`).toLocaleDateString('pt-BR'); } catch { return logDate; }
                    })()}.
                  </Text>
                </View>
              ) : editingLog && getKind(editingLog.log_type) === 'event' ? (
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.warning}10`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.warning}40` }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.warning, fontWeight: font.weights.medium }}>
                    ⚠️ Vai ser removido do calendário (virou um registro).
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                disabled={savingLog}
                onPress={handleSaveEditLog}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.lg,
                  opacity: savingLog ? 0.5 : 1,
                }}
              >
                {savingLog ? <ActivityIndicator color="#fff" /> : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                    Salvar
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
        backgroundColor: active ? colors.brand : colors.bgElevated,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.borderLight,
      }}
    >
      <Text
        style={{
          color: active ? '#fff' : colors.text,
          fontWeight: font.weights.semibold,
          fontSize: font.sizes.sm,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.full,
        backgroundColor: active ? colors.brand : colors.bgSurface,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.borderLight,
      }}
    >
      <Text
        style={{
          color: active ? '#fff' : colors.text,
          fontSize: font.sizes.xs,
          fontWeight: font.weights.medium,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, width: 90 }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium, flex: 1 }}>{value}</Text>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, marginTop: spacing.sm, fontWeight: font.weights.medium }}>{children}</Text>;
}

function KindCard({
  emoji, title, description, example, accentBg, accentBorder, onPress,
}: {
  emoji: string; title: string; description: string; example: string;
  accentBg: string; accentBorder: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: accentBg,
        borderColor: accentBorder,
        borderWidth: 1.5,
        borderRadius: radius.lg,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>{description}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 }}>{example}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function SubtypeRow({
  icon, label, hint, onPress,
}: { icon: string; label: string; hint?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.bgSurface,
        borderRadius: radius.md,
        marginBottom: spacing.xs,
      }}
    >
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>{label}</Text>
        {hint ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.textMuted}
      style={{
        backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        fontSize: font.sizes.md, color: colors.text,
        minHeight: 44,
      }}
    />
  );
}
