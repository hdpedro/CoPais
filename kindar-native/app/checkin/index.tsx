/**
 * Check-in Diario — CRUD completo de entradas por crianca (saude/rotina).
 * Mirrors PWA /checkin.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { useAuth } from 'src/store/auth';
import { getDisplayName, CHECKIN_CATEGORIES } from 'src/lib/constants';
import { fetchChildren, type Child } from 'src/services/children';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface CheckinItem {
  id: string; category: string; title: string; notes: string | null;
  checkin_date: string; child_id: string | null; childName: string; loggedByName: string;
}

const CAT_LABELS: Record<string, string> = {
  screen_time: 'Tempo de tela', food: 'Alimentação', sleep: 'Sono', mood: 'Humor',
  health: 'Saúde', hygiene: 'Higiene', other: 'Outro',
};

export default function CheckinScreen() {
  const { userId, activeGroup } = useAuth();
  const [items, setItems] = useState<CheckinItem[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('mood');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeGroup) fetchChildren(activeGroup.groupId).then(setChildren);
  }, [activeGroup]);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const { data } = await supabase.from('daily_checkins')
      .select('id, category, title, notes, checkin_date, child_id, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)')
      .eq('group_id', activeGroup.groupId)
      .order('checkin_date', { ascending: false }).limit(100);
    setItems((data || []).map((d: any) => ({
      id: d.id, category: d.category, title: d.title, notes: d.notes,
      checkin_date: d.checkin_date, child_id: d.child_id,
      childName: getDisplayName(d.children?.full_name) || 'Geral',
      loggedByName: getDisplayName(d.profiles?.full_name),
    })));
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSubmit() {
    if (!activeGroup || !userId || !title.trim()) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await safeWrite({
      table: 'daily_checkins', operation: 'insert',
      payload: {
        group_id: activeGroup.groupId,
        child_id: childId || null,
        category, title: title.trim(),
        notes: notes.trim() || null,
        checkin_date: dateIso,
        logged_by: userId,
      },
    });
    setSubmitting(false);
    if (result.success) {
      if (!result.queued) {
        notifyAction('health_event_created', activeGroup.groupId, {
          title: `Check-in: ${title}`,
          childName: children.find(c => c.id === childId)?.full_name?.split(' ')[0] || '',
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setChildId(null); setCategory('mood'); setTitle(''); setNotes(''); setDateIso(dateToIso(new Date()));
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Erro', 'Não foi possível registrar');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Check-in" />
      <FlatList
        data={items}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="✅" title="Nenhum check-in" subtitle="Registre o dia a dia das crianças" />}
        renderItem={({ item }) => {
          const cat = CHECKIN_CATEGORIES.find((c: any) => c.value === item.category);
          const catLabel = CAT_LABELS[item.category] || item.category;
          return (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <Text style={{ fontSize: 22 }}>{(cat as any)?.icon || '✅'}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>{catLabel}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>· {item.childName}</Text>
                </View>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>{item.title}</Text>
                {item.notes ? <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 4 }}>{item.notes}</Text> : null}
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.xs }}>
                  {item.loggedByName} · {item.checkin_date?.split('-').reverse().join('/')}
                </Text>
              </View>
            </View>
          );
        }}
      />
      <FAB onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setComposerOpen(true); }} />

      <Modal visible={composerOpen} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity activeOpacity={1} onPress={() => setComposerOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              Novo check-in
            </Text>
            <ScrollView>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Categoria</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {CHECKIN_CATEGORIES.map((c: any) => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setCategory(c.value)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: active ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {CAT_LABELS[c.value] || c.value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {children.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>Criança</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                    <TouchableOpacity
                      onPress={() => setChildId(null)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: childId === null ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: childId === null ? colors.brand : colors.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: font.sizes.sm, color: childId === null ? '#fff' : colors.text }}>Geral</Text>
                    </TouchableOpacity>
                    {children.map(c => {
                      const active = childId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setChildId(c.id)}
                          style={{
                            paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                            backgroundColor: active ? colors.brand : colors.bg,
                            borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                          }}
                        >
                          <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text }}>
                            {c.full_name.split(' ')[0]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <TextInput
                value={title} onChangeText={setTitle}
                placeholder="Título (ex: Recusou o jantar)"
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm,
                }}
              />

              <View style={{ marginBottom: spacing.sm }}>
                <DatePickerField value={dateIso} onChange={setDateIso} placeholder="Data do check-in" maximumDate={new Date()} />
              </View>

              <TextInput
                value={notes} onChangeText={setNotes}
                placeholder="Detalhes, contexto..."
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 100, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <TouchableOpacity
                disabled={submitting || !title.trim()}
                onPress={handleSubmit}
                style={{
                  backgroundColor: colors.brand, borderRadius: radius.md,
                  paddingVertical: spacing.md + 2, alignItems: 'center',
                  opacity: submitting || !title.trim() ? 0.5 : 1,
                }}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : (
                  <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                    Registrar check-in
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
