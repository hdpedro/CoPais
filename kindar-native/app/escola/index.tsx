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
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchChildren, fetchChildEducation, upsertChildEducation, type ChildEducation } from '../../src/services/children';
import {
  fetchSchoolLogs, createSchoolLog, updateSchoolLog, deleteSchoolLog, toggleSchoolLogCompleted,
  SCHOOL_LOG_TYPES, type SchoolLog, type SchoolLogType,
} from '../../src/services/school';
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { TimePickerField, DatePickerField } from '../../src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

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

const TYPE_LABELS: Record<SchoolLogType, string> = {
  grade: 'Nota / boletim',
  meeting: 'Reuniao',
  behavior: 'Comportamento',
  homework: 'Tarefa de casa',
  event: 'Evento',
  absence: 'Falta',
  achievement: 'Conquista',
  concern: 'Atencao',
  other: 'Outro',
};

const TYPE_ICONS: Record<SchoolLogType, string> = {
  grade: '📊',
  meeting: '👥',
  behavior: '📝',
  homework: '📚',
  event: '🎉',
  absence: '🚫',
  achievement: '🏆',
  concern: '⚠️',
  other: '📌',
};

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

  const [tab, setTab] = useState<Tab>('info');

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
  const [creatingLog, setCreatingLog] = useState(false);
  const [editingLog, setEditingLog] = useState<SchoolLog | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [logChildId, setLogChildId] = useState<string | null>(null);
  const [logType, setLogType] = useState<SchoolLogType>('grade');
  const [logTitle, setLogTitle] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logDate, setLogDate] = useState<string>(todayIso());

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

  function resetLogForm() {
    setLogChildId(childOptions[0]?.id ?? null);
    setLogType('grade');
    setLogTitle('');
    setLogDescription('');
    setLogDate(todayIso());
  }

  function openCreateLog() {
    if (childOptions.length === 0) {
      Alert.alert('Cadastre uma crianca primeiro', 'Voce precisa adicionar uma crianca antes de registrar eventos escolares.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetLogForm();
    setCreatingLog(true);
  }

  function openEditLog(log: SchoolLog) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogTitle(log.title);
    setLogDescription(log.description || '');
    setEditingLog(log);
  }

  async function handleSaveNewLog() {
    if (!groupId || !userId) return;
    if (!logTitle.trim()) {
      Alert.alert('Titulo obrigatorio', 'Da um nome ao registro.');
      return;
    }
    if (!logChildId) {
      Alert.alert('Crianca obrigatoria', 'Escolha pra qual crianca o registro vale.');
      return;
    }
    setSavingLog(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await createSchoolLog({
      groupId,
      childId: logChildId,
      loggedBy: userId,
      logType,
      title: logTitle,
      description: logDescription,
      logDate,
    });
    setSavingLog(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreatingLog(false);
      await loadLogs();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', res.error || 'Nao consegui salvar.');
    }
  }

  async function handleSaveEditLog() {
    if (!editingLog) return;
    if (!logTitle.trim()) {
      Alert.alert('Titulo obrigatorio');
      return;
    }
    setSavingLog(true);
    const res = await updateSchoolLog(editingLog.id, {
      title: logTitle,
      description: logDescription,
    });
    setSavingLog(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingLog(null);
      await loadLogs();
    } else {
      Alert.alert('Erro', res.error || 'Nao consegui salvar.');
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
            {logsLoading && logs.length === 0 ? (
              <ActivityIndicator color={colors.brand} style={{ marginTop: spacing['3xl'] }} />
            ) : logs.length === 0 ? (
              <EmptyState
                icon="📚"
                title="Nenhum registro escolar"
                subtitle="Toque em + abaixo para registrar uma nota, reuniao ou lembrete."
              />
            ) : (
              logs.map((log) => {
                const isHomework = log.log_type === 'homework';
                return (
                  <View
                    key={log.id}
                    style={{
                      backgroundColor: colors.bgElevated,
                      borderRadius: radius.xl,
                      padding: spacing.lg,
                      marginBottom: spacing.sm,
                      opacity: log.completed ? 0.6 : 1,
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
                          {log.child_full_name ? ` • ${log.child_full_name}` : ''}
                        </Text>
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

      {/* Criar registro escolar */}
      <Modal visible={creatingLog} animationType="slide" transparent onRequestClose={() => setCreatingLog(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setCreatingLog(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              Novo registro
            </Text>
            <ScrollView>
              <Label>Crianca</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                {childOptions.map((c) => (
                  <Chip key={c.id} label={c.short_name} active={logChildId === c.id} onPress={() => setLogChildId(c.id)} />
                ))}
              </View>

              <Label>Tipo</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                {SCHOOL_LOG_TYPES.map((t) => (
                  <Chip
                    key={t}
                    label={`${TYPE_ICONS[t]} ${TYPE_LABELS[t]}`}
                    active={logType === t}
                    onPress={() => setLogType(t)}
                  />
                ))}
              </View>

              <Label>Titulo</Label>
              <Input value={logTitle} onChangeText={setLogTitle} placeholder="Ex: Reuniao de pais" />

              <Label>Descricao (opcional)</Label>
              <Input
                value={logDescription}
                onChangeText={setLogDescription}
                placeholder="Detalhes do registro"
                multiline
              />

              <Label>Data</Label>
              <DatePickerField value={logDate} onChange={(d) => setLogDate(d || todayIso())} />

              <TouchableOpacity
                disabled={savingLog}
                onPress={handleSaveNewLog}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.md,
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
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Editar registro existente */}
      <Modal visible={!!editingLog} animationType="slide" transparent onRequestClose={() => setEditingLog(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setEditingLog(null)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              Editar registro
            </Text>
            <ScrollView>
              <Label>Titulo</Label>
              <Input value={logTitle} onChangeText={setLogTitle} />

              <Label>Descricao</Label>
              <Input value={logDescription} onChangeText={setLogDescription} multiline />

              <TouchableOpacity
                disabled={savingLog}
                onPress={handleSaveEditLog}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.md,
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
