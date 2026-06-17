/**
 * Check-in Diario — CRUD completo de entradas por crianca (saude/rotina).
 * Mirrors PWA /checkin.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { reportError } from 'src/lib/error-reporter';
import { notifyAction } from 'src/services/notify';
import { useAuth } from 'src/store/auth';
import { getDisplayName, CHECKIN_CATEGORIES } from 'src/lib/constants';
import { fetchChildren, type Child } from 'src/services/children';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface CheckinItem {
  id: string; category: string; title: string; notes: string | null;
  checkin_date: string; child_id: string | null; childName: string; loggedByName: string;
}

const CAT_LABEL_KEYS: Record<string, string> = {
  screen_time: 'checkin.catScreenTime', food: 'checkin.catFood', sleep: 'checkin.catSleep',
  mood: 'checkin.catMood', health: 'checkin.catHealth', hygiene: 'checkin.catHygiene',
  activity: 'checkin.catActivity', school: 'checkin.catSchool',
  other: 'checkin.catOther',
};

export default function CheckinScreen() {
  const t = useI18n(s => s.t);
  const catLabel = (value: string) =>
    CAT_LABEL_KEYS[value] ? t(CAT_LABEL_KEYS[value]) : value;
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [composerOpen, setComposerOpen] = useState(false);
  const [childId, setChildId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('mood');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [submitting, setSubmitting] = useState(false);

  interface CheckinCache { items: CheckinItem[]; children: Child[] }
  const { data, loading, refresh: load } = useCachedFetch<CheckinCache>({
    cacheKey: activeGroup ? `checkin_${activeGroup.groupId}` : null,
    tag: 'checkin:load',
    empty: { items: [], children: [] },
    fetcher: async () => {
      const [{ data: rows }, kids] = await Promise.all([
        supabase.from('daily_checkins')
          .select('id, category, title, description, checkin_date, child_id, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)')
          .eq('group_id', activeGroup!.groupId)
          .order('checkin_date', { ascending: false }).limit(100),
        fetchChildren(activeGroup!.groupId),
      ]);
      return {
        items: (rows || []).map((d: any) => ({
          id: d.id, category: d.category, title: d.title, notes: d.description,
          checkin_date: d.checkin_date, child_id: d.child_id,
          childName: getDisplayName(d.children?.full_name) || t('documentsPage.general'),
          loggedByName: getDisplayName(d.profiles?.full_name, true),
        })),
        children: kids,
      };
    },
  });
  const items = data.items;
  const children = data.children;

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
        description: notes.trim() || null,
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
      // Surface a causa provável em vez do "Falha ao salvar" genérico. RLS/auth
      // (ex: sessão expirada → auth.uid() null → escrita rejeitada) é o caso mais
      // comum; nunca vaza o erro técnico cru (Regra Canônica 5). Loga o detalhe
      // pra telemetria (antes invisível — nenhum report no app_errors).
      const raw = result.error || '';
      const isAuth = /row-level security|jwt|not authenticated|permission denied|session|sess/i.test(raw);
      toast.show({
        message: isAuth ? t('toasts.common.sessionExpired') : t('toasts.common.saveFailed'),
        variant: 'error',
      });
      reportError(new Error(`checkin save failed: ${raw}`), {
        metadata: { event: 'checkin_save_failed', table: 'daily_checkins' },
      });
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('checkin.headerTitle')} />
      {loading && items.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : null}
      <FlatList
        data={loading && items.length === 0 ? [] : items}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="✅" title={t('empty.checkin.title')} description={t('empty.checkin.description')} />}
        renderItem={({ item }) => {
          const cat = CHECKIN_CATEGORIES.find((c: any) => c.value === item.category);
          const catText = catLabel(item.category);
          return (
            <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <Text style={{ fontSize: 22 }}>{(cat as any)?.icon || '✅'}</Text>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>{catText}</Text>
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

      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <ModalBackdrop onClose={() => setComposerOpen(false)} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              {t('checkin.newTitle')}
            </Text>
            <ScrollView style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('checkinForm.category')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {CHECKIN_CATEGORIES.map((c: any) => {
                  const active = category === c.value;
                  return (
                    <TouchableOpacity
                      key={c.value}
                      onPress={() => setCategory(c.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={catLabel(c.value)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: active ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {catLabel(c.value)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {children.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('checkinForm.child')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                    <TouchableOpacity
                      onPress={() => setChildId(null)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: childId === null }}
                      accessibilityLabel={t('checkin.generalNoChild')}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: childId === null ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: childId === null ? colors.brand : colors.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: font.sizes.sm, color: childId === null ? '#fff' : colors.text }}>{t('documentsPage.general')}</Text>
                    </TouchableOpacity>
                    {children.map(c => {
                      const active = childId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setChildId(c.id)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={c.full_name}
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
                placeholder={t('checkin.titlePlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm,
                }}
              />

              <View style={{ marginBottom: spacing.sm }}>
                <DatePickerField value={dateIso} onChange={setDateIso} placeholder={t('checkin.datePlaceholder')} maximumDate={new Date()} />
              </View>

              <TextInput
                value={notes} onChangeText={setNotes}
                placeholder={t('checkin.notesPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 100, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <PrimaryButton
                label={t('checkin.submitButton')}
                onPress={handleSubmit}
                loading={submitting}
                disabled={!title.trim()}
                testID="checkin-submit"
              />
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
