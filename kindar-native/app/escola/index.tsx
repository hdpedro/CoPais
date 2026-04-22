/**
 * Escola — Informacoes escolares por crianca, com edit flow completo.
 * Paridade com PWA /criancas/[id]?tab=educacao.
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
import ScreenHeader from '../../src/components/ui/ScreenHeader';
import EmptyState from '../../src/components/ui/EmptyState';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

interface ChildSchool {
  childId: string;
  childFullName: string;
  childName: string;
  education: ChildEducation | null;
}

function formatTimeInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
function parseTimeHHMM(display: string): string | null {
  if (!display) return null;
  const m = display.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, h, mi] = m;
  const hn = Number(h), mn = Number(mi);
  if (hn < 0 || hn > 23 || mn < 0 || mn > 59) return null;
  return `${h}:${mi}:00`;
}
function displayTime(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

export default function EscolaScreen() {
  const { activeGroup } = useAuth();
  const [schools, setSchools] = useState<ChildSchool[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ChildSchool | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
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

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const children = await fetchChildren(activeGroup.groupId);
    const results: ChildSchool[] = [];
    for (const child of children) {
      const edu = await fetchChildEducation(child.id);
      results.push({
        childId: child.id,
        childFullName: child.full_name,
        childName: child.full_name.split(' ')[0],
        education: edu,
      });
    }
    setSchools(results);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    if (!editing || !activeGroup) return;
    let entryIso: string | null = null, exitIso: string | null = null;
    if (entryTime) {
      entryIso = parseTimeHHMM(entryTime);
      if (!entryIso) { Alert.alert('Horario de entrada invalido', 'Use HH:MM'); return; }
    }
    if (exitTime) {
      exitIso = parseTimeHHMM(exitTime);
      if (!exitIso) { Alert.alert('Horario de saida invalido', 'Use HH:MM'); return; }
    }
    const extras = extracurriculars.split(',').map(s => s.trim()).filter(Boolean);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await upsertChildEducation({
      childId: editing.childId, groupId: activeGroup.groupId,
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Escola" />
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

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Label>Entrada (HH:MM)</Label>
                  <Input value={entryTime} onChangeText={v => setEntryTime(formatTimeInput(v))} placeholder="07:30" keyboardType="number-pad" maxLength={5} />
                </View>
                <View style={{ flex: 1 }}>
                  <Label>Saida (HH:MM)</Label>
                  <Input value={exitTime} onChangeText={v => setExitTime(formatTimeInput(v))} placeholder="12:00" keyboardType="number-pad" maxLength={5} />
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
    </View>
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
      }}
    />
  );
}
