/**
 * Editar atividade — tela dedicada (rota nested em /atividades/edit/[id]).
 *
 * Substitui o hack anterior de "redirect pra /atividades + auto-abrir
 * editor via param editId". Aquela abordagem perdia o contexto da tela
 * de detalhe (depois de salvar, o user ficava na lista).
 *
 * Agora:
 *   /atividades/[id] (detail) -> Editar -> /atividades/edit/[id]
 *   -> Salvar / Cancelar -> router.back() volta pra detail.
 *
 * Form completo: nome, categoria, horario, local, professor, sala,
 * classe, responsavel, anotacoes. responsable_id era invisivel no
 * form antigo da lista — era a queixa "Alterar responsavel nao
 * funciona". Agora cobre.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { updateActivity } from 'src/services/activities';
import { ACTIVITY_CATEGORIES, getDisplayName } from 'src/lib/constants';
import { TimePickerField } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const CATEGORY_LABEL: Record<string, string> = {
  sports: 'Esporte', arts: 'Arte', music: 'Musica', education: 'Educacao',
  social: 'Social', therapy: 'Terapia', leisure: 'Lazer', other: 'Outro',
};

interface Member { user_id: string; name: string; }

export default function EditActivityScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string }>();
  const activityId = typeof params.id === 'string' ? params.id : '';
  const { activeGroup } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('other');
  const [timeStart, setTimeStart] = useState<string | null>(null);
  const [timeEnd, setTimeEnd] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (!activityId || !activeGroup) return;
    let cancelled = false;
    (async () => {
      const [{ data: act }, { data: memRows }] = await Promise.all([
        supabase
          .from('child_activities')
          .select('name, category, time_start, time_end, location, notes, teacher_name, class_name, responsible_id')
          .eq('id', activityId)
          .maybeSingle(),
        supabase
          .from('group_members')
          .select('user_id, profiles(full_name, display_name, email)')
          .eq('group_id', activeGroup.groupId),
      ]);
      if (cancelled) return;
      if (act) {
        setName(act.name || '');
        setCategory(act.category || 'other');
        setTimeStart(act.time_start ? act.time_start.slice(0, 5) : null);
        setTimeEnd(act.time_end ? act.time_end.slice(0, 5) : null);
        setLocation(act.location || '');
        setTeacherName(act.teacher_name || '');
        setClassName(act.class_name || '');
        setResponsibleId(act.responsible_id || null);
        setNotes(act.notes || '');
      }
      const memList: Member[] = ((memRows || []) as { user_id: string; profiles: { full_name: string | null; display_name: string | null; email: string | null } | { full_name: string | null; display_name: string | null; email: string | null }[] | null }[]).map((m) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const raw = p?.display_name || p?.full_name || (p?.email ? p.email.split('@')[0] : 'Membro');
        // Seletor de responsável — chip compacto, firstOnly
        return { user_id: m.user_id, name: getDisplayName(raw, true) };
      });
      setMembers(memList);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activityId, activeGroup]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Nome obrigatório', 'Dá um nome pra atividade.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await updateActivity(activityId, {
      name: name.trim(),
      category,
      time_start: timeStart ? `${timeStart}:00` : null,
      time_end: timeEnd ? `${timeEnd}:00` : null,
      location: location.trim() || null,
      teacher_name: teacherName.trim() || null,
      class_name: className.trim() || null,
      responsible_id: responsibleId,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', result.error || 'Falha ao salvar.');
    }
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Garante que nenhum Stack header nativo aparece sobrepondo o nosso. */}
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header com Cancelar + Salvar (estilo iOS premium): sticky no topo,
          divisor, padding generoso pra ser inconfundivel. */}
      <View style={{
        paddingTop: insets.top + 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="edit-activity-cancel" accessibilityRole="button" accessibilityLabel="Voltar">
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={28} color={colors.brand} />
            <Text style={{ fontSize: font.sizes.md, color: colors.brand, marginLeft: -2, fontWeight: font.weights.medium }}>
              Voltar
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
          Editar atividade
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !name.trim()} hitSlop={12} testID="edit-activity-save" accessibilityRole="button" accessibilityLabel="Salvar" accessibilityState={{ disabled: saving || !name.trim(), busy: saving }}>
          <Text style={{
            fontSize: font.sizes.md, fontWeight: font.weights.bold,
            color: (saving || !name.trim()) ? colors.textMuted : colors.brand,
          }}>
            {saving ? '...' : 'Salvar'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 80 }}>
        {/* Nome */}
        <Label>Nome</Label>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Ex: Teatro"
          placeholderTextColor={colors.textDim}
          style={inputStyle}
        />

        {/* Categoria — chips */}
        <Label>Categoria</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          {ACTIVITY_CATEGORIES.map((c) => {
            const active = c.value === category;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => { Haptics.selectionAsync(); setCategory(c.value); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={CATEGORY_LABEL[c.value] || c.value}
                style={{
                  paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.full,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  ...shadows.sm,
                }}
              >
                <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                <Text style={{
                  fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
                  color: active ? '#fff' : colors.text,
                }}>
                  {CATEGORY_LABEL[c.value] || c.value}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Horario */}
        <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
          <View style={{ flex: 1 }}>
            <Label>Início</Label>
            <TimePickerField value={timeStart} onChange={setTimeStart} placeholder="--:--" />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Fim</Label>
            <TimePickerField value={timeEnd} onChange={setTimeEnd} placeholder="--:--" />
          </View>
        </View>

        {/* Local */}
        <Label>Local</Label>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Ex: Colégio CVS"
          placeholderTextColor={colors.textDim}
          style={inputStyle}
        />

        {/* Professor / Sala */}
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Label>Professor</Label>
            <TextInput
              value={teacherName}
              onChangeText={setTeacherName}
              placeholder="Opcional"
              placeholderTextColor={colors.textDim}
              style={inputStyle}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Sala / Turma</Label>
            <TextInput
              value={className}
              onChangeText={setClassName}
              placeholder="Opcional"
              placeholderTextColor={colors.textDim}
              style={inputStyle}
            />
          </View>
        </View>

        {/* Responsável */}
        <Label>Responsável pela atividade</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync(); setResponsibleId(null); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: responsibleId === null }}
            accessibilityLabel="Não definido"
            style={{
              paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.full,
              backgroundColor: responsibleId === null ? colors.brand : colors.bgElevated,
              ...shadows.sm,
            }}
          >
            <Text style={{
              fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
              color: responsibleId === null ? '#fff' : colors.text,
            }}>
              Não definido
            </Text>
          </TouchableOpacity>
          {members.map((m) => {
            const active = responsibleId === m.user_id;
            return (
              <TouchableOpacity
                key={m.user_id}
                onPress={() => { Haptics.selectionAsync(); setResponsibleId(m.user_id); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={m.name}
                style={{
                  paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.full,
                  backgroundColor: active ? colors.brand : colors.bgElevated,
                  ...shadows.sm,
                }}
              >
                <Text style={{
                  fontSize: font.sizes.xs, fontWeight: font.weights.semibold,
                  color: active ? '#fff' : colors.text,
                }}>
                  {m.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Anotações */}
        <Label>Anotações</Label>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Informacoes adicionais..."
          placeholderTextColor={colors.textDim}
          multiline
          style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  backgroundColor: colors.bgElevated,
  borderRadius: radius.md,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.md,
  fontSize: font.sizes.md,
  color: colors.text,
  marginBottom: spacing.lg,
  ...shadows.sm,
} as const;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontSize: 11, fontWeight: font.weights.semibold,
      color: colors.textMuted, textTransform: 'uppercase' as const,
      letterSpacing: 1, marginBottom: 6,
    }}>
      {children}
    </Text>
  );
}
