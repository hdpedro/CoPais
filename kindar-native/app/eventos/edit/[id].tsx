/**
 * Editar evento — tela dedicada (paridade com /atividades/edit/[id]).
 *
 * Form completo com TODOS os campos: titulo, data, hora (ou dia inteiro),
 * local, criança, responsavel, descricao. Header iOS-style.
 *
 * Apos salvar/cancelar, router.back() volta pra /eventos/[id] (detail)
 * com refresh automatico via useFocusEffect.
 */
import { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, Alert, Switch,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from 'src/store/auth';
import { supabase } from 'src/lib/supabase';
import { updateEvent } from 'src/services/events';
import { getDisplayName } from 'src/lib/constants';
import { DatePickerField, TimePickerField } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Member { user_id: string; name: string; }
interface Child { id: string; name: string; }

export default function EditEventScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const eventId = typeof id === 'string' ? id : '';
  const { activeGroup } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [endDate, setEndDate] = useState<string | null>(null);
  const [eventTime, setEventTime] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [childId, setChildId] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [children, setChildren] = useState<Child[]>([]);

  useEffect(() => {
    if (!eventId || !activeGroup) return;
    let cancelled = false;
    (async () => {
      const [{ data: ev }, { data: memRows }, { data: childRows }] = await Promise.all([
        supabase
          .from('events')
          .select('title, description, event_date, end_date, event_time, location, all_day, assigned_to, child_id')
          .eq('id', eventId)
          .maybeSingle(),
        supabase
          .from('group_members')
          .select('user_id, profiles(full_name, display_name, email)')
          .eq('group_id', activeGroup.groupId),
        supabase
          .from('children')
          .select('id, full_name')
          .eq('group_id', activeGroup.groupId),
      ]);
      if (cancelled) return;
      if (ev) {
        setTitle(ev.title || '');
        setDescription(ev.description || '');
        setEventDate(ev.event_date || '');
        setEndDate(ev.end_date || null);
        setEventTime(ev.event_time ? ev.event_time.slice(0, 5) : null);
        setAllDay(!!ev.all_day);
        setLocation(ev.location || '');
        setChildId(ev.child_id || null);
        setAssignedTo(ev.assigned_to || null);
      }
      const memList: Member[] = ((memRows || []) as { user_id: string; profiles: { full_name: string | null; display_name: string | null; email: string | null } | { full_name: string | null; display_name: string | null; email: string | null }[] | null }[]).map((m) => {
        const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
        const raw = p?.display_name || p?.full_name || (p?.email ? p.email.split('@')[0] : 'Membro');
        return { user_id: m.user_id, name: getDisplayName(raw) };
      });
      setMembers(memList);
      setChildren(((childRows || []) as { id: string; full_name: string }[]).map((c) => ({
        id: c.id,
        name: getDisplayName(c.full_name),
      })));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [eventId, activeGroup]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Título obrigatório', 'Da um nome pro evento.');
      return;
    }
    if (!eventDate) {
      Alert.alert('Data obrigatória', 'Escolhe uma data.');
      return;
    }
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await updateEvent(eventId, {
      title: title.trim(),
      description: description.trim() || null,
      event_date: eventDate,
      end_date: endDate || null,
      event_time: !allDay && eventTime ? `${eventTime}:00` : null,
      all_day: allDay,
      location: location.trim() || null,
      child_id: childId,
      assigned_to: assignedTo,
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
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 10, paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.borderLight,
      }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="chevron-back" size={28} color={colors.brand} />
            <Text style={{ fontSize: font.sizes.md, color: colors.brand, marginLeft: -2, fontWeight: font.weights.medium }}>
              Voltar
            </Text>
          </View>
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
          Editar evento
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving || !title.trim()} hitSlop={12}>
          <Text style={{
            fontSize: font.sizes.md, fontWeight: font.weights.bold,
            color: (saving || !title.trim()) ? colors.textMuted : colors.brand,
          }}>
            {saving ? '...' : 'Salvar'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 80, paddingTop: spacing.md }}>
        <Label>Título</Label>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Ex: Reunião escolar"
          placeholderTextColor={colors.textDim}
          style={inputStyle}
        />

        <Label>Data</Label>
        <DatePickerField value={eventDate} onChange={(v: string) => setEventDate(v)} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.lg }}>
          <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
            Dia inteiro
          </Text>
          <Switch value={allDay} onValueChange={setAllDay} trackColor={{ true: colors.brand, false: colors.border }} />
        </View>

        {!allDay ? (
          <>
            <Label>Horário</Label>
            <TimePickerField value={eventTime} onChange={setEventTime} placeholder="--:--" />
          </>
        ) : null}

        <Label>Local</Label>
        <TextInput
          value={location}
          onChangeText={setLocation}
          placeholder="Ex: Colégio CVS"
          placeholderTextColor={colors.textDim}
          style={inputStyle}
        />

        {/* Crianca */}
        {children.length > 0 ? (
          <>
            <Label>Criança</Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              <Chip label="Nenhuma" active={childId === null} onPress={() => { Haptics.selectionAsync(); setChildId(null); }} />
              {children.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={childId === c.id}
                  onPress={() => { Haptics.selectionAsync(); setChildId(c.id); }}
                />
              ))}
            </View>
          </>
        ) : null}

        {/* Responsavel */}
        <Label>Responsável</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
          <Chip label="Não definido" active={assignedTo === null} onPress={() => { Haptics.selectionAsync(); setAssignedTo(null); }} />
          {members.map((m) => (
            <Chip
              key={m.user_id}
              label={m.name}
              active={assignedTo === m.user_id}
              onPress={() => { Haptics.selectionAsync(); setAssignedTo(m.user_id); }}
            />
          ))}
        </View>

        <Label>Descrição</Label>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Detalhes adicionais..."
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

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
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
        {label}
      </Text>
    </TouchableOpacity>
  );
}
