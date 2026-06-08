/**
 * Temas Sensiveis — notas sensiveis com fluxo de aprovacao de exclusao (workflow 8 of 8).
 * Mirrors PWA /temas-sensiveis.
 */
import { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl, Modal, TextInput,
  ScrollView, Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import {
  fetchSensitiveNotes, createSensitiveNote, requestDeletion, approveDeletion, cancelDeletion,
  type SensitiveNote, type SensitiveTopic,
} from 'src/services/sensitive';
import { fetchChildren, type Child } from 'src/services/children';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

// Keys MUST match the DB enum `sensitive_topic_type` + the PWA's VALID_TOPICS
// (services/sensitive.ts SENSITIVE_TOPICS); icons/labels mirror the PWA's
// SensitiveTopicsClient for paridade. Bug Matheus 2026-06-08.
// labelKey resolved at render via t() — keep icon/color static.
const TOPIC_META: Record<string, { labelKey: string; icon: string; color: string }> = {
  gender_violence: { labelKey: 'sensitiveTopics.topicGenderViolence', icon: '🛡️', color: '#D4735A' },
  sexual_violence: { labelKey: 'sensitiveTopics.topicSexualViolence', icon: '⚠️', color: '#E53935' },
  bullying: { labelKey: 'sensitiveTopics.topicBullying', icon: '🚫', color: '#EF4444' },
  mental_health: { labelKey: 'sensitiveTopics.topicMentalHealth', icon: '🧠', color: '#8B5CF6' },
  substance_abuse: { labelKey: 'sensitiveTopics.topicSubstanceAbuse', icon: '💊', color: '#F59E0B' },
  safety: { labelKey: 'sensitiveTopics.topicSafety', icon: '🔒', color: '#3B82F6' },
  other: { labelKey: 'sensitiveTopics.topicOther', icon: '📝', color: '#5B9E85' },
};

export default function TemasSensiveisScreen() {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();
  const { activeGroup, userId } = useAuth();
  const [acting, setActing] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newTopic, setNewTopic] = useState<SensitiveTopic>('other');
  const [newChildId, setNewChildId] = useState<string | null>(null);
  const [newUrgent, setNewUrgent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  interface TemasCache { notes: SensitiveNote[]; children: Child[] }
  const { data, loading, refresh: load } = useCachedFetch<TemasCache>({
    cacheKey: activeGroup ? `temas_sensiveis_${activeGroup.groupId}` : null,
    tag: 'temas-sensiveis:load',
    empty: { notes: [], children: [] },
    fetcher: async () => {
      const [n, c] = await Promise.all([
        fetchSensitiveNotes(activeGroup!.groupId),
        fetchChildren(activeGroup!.groupId),
      ]);
      return { notes: n, children: c };
    },
  });
  const notes = data.notes;
  const children = data.children;

  async function handleRequestDelete(note: SensitiveNote) {
    if (!userId || !activeGroup) return;
    Alert.alert(
      t('sensitiveTopics.requestDelete'),
      t('sensitiveTopics.requestDeleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('sensitiveTopics.requestDelete'),
          style: 'destructive',
          onPress: async () => {
            setActing(note.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await requestDeletion(note.id, userId, activeGroup.groupId, note.title);
            setActing(null);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (res.deleted) toast.show({ message: t('toasts.common.removed'), variant: 'success' });
              await load();
            }
          },
        },
      ]
    );
  }

  async function handleApproveDelete(note: SensitiveNote) {
    if (!userId || !activeGroup) return;
    Alert.alert(
      t('sensitive.approveDelete'),
      t('sensitiveTopics.approveDeleteBody', { name: note.deletionRequesterName ?? '', title: note.title ?? '' }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            setActing(note.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await approveDeletion(note.id, userId, activeGroup.groupId, note.title);
            setActing(null);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              toast.show({ message: res.error || t('toasts.common.deleteFailed'), variant: 'error' });
            }
          },
        },
      ]
    );
  }

  async function handleCancelDelete(note: SensitiveNote) {
    if (!activeGroup) return;
    setActing(note.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await cancelDeletion(note.id, activeGroup.groupId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActing(null);
    await load();
  }

  async function submitNew() {
    if (!userId || !activeGroup || !newTitle.trim() || !newContent.trim()) return;
    setSubmitting(true);
    const res = await createSensitiveNote({
      groupId: activeGroup.groupId,
      childId: newChildId || undefined,
      topic: newTopic,
      title: newTitle,
      content: newContent,
      isUrgent: newUrgent,
      createdBy: userId,
    });
    setSubmitting(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setNewTitle(''); setNewContent(''); setNewTopic('other'); setNewChildId(null); setNewUrgent(false);
      await load();
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('sensitive.title')} />
      {loading && notes.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : null}
      <FlatList
        data={loading && notes.length === 0 ? [] : notes}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🔒" title={t('empty.temasSensiveis.title')} description={t('empty.temasSensiveis.description')} />}
        renderItem={({ item: n }) => {
          const topic = TOPIC_META[n.topic] || TOPIC_META.other;
          const isAwaitingApproval = !!n.deletion_requested_by;
          const iRequestedDeletion = n.deletion_requested_by === userId;
          const canIApprove = isAwaitingApproval && !iRequestedDeletion;
          const child = children.find(c => c.id === n.child_id);
          return (
            <View
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                borderWidth: n.is_urgent ? 2 : 0, borderColor: colors.error,
                opacity: isAwaitingApproval ? 0.85 : 1,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${topic.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{topic.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: font.sizes.xs, color: topic.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>{t(topic.labelKey)}</Text>
                    {n.is_urgent ? (
                      <View style={{ backgroundColor: `${colors.error}15`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.error, fontWeight: font.weights.bold }}>{t('sensitiveTopics.urgentBadge')}</Text>
                      </View>
                    ) : null}
                    {child ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>· {child.full_name.split(' ')[0]}</Text> : null}
                  </View>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 2 }}>
                    {n.title}
                  </Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, lineHeight: 20 }}>
                    {n.content}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
                    {n.authorName} · {intl.formatRelativeDay(n.created_at)}
                  </Text>
                </View>
              </View>

              {isAwaitingApproval ? (
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.warning}15`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.warning}40` }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.warning, fontWeight: font.weights.semibold, marginBottom: 4, textTransform: 'uppercase' }}>
                    {t('sensitiveTopics.awaitingApproval')}
                  </Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
                    {iRequestedDeletion
                      ? t('sensitiveTopics.youRequestedDeletion')
                      : t('sensitiveTopics.otherRequestedDeletion', { name: n.deletionRequesterName || t('sensitiveTopics.otherParent') })}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                    {canIApprove ? (
                      <View style={{ flex: 1 }}>
                        <PrimaryButton
                          label={t('sensitive.approveDelete')}
                          onPress={() => handleApproveDelete(n)}
                          loading={acting === n.id}
                          variant="destructive"
                          testID={`temas-sensiveis-approve-delete-${n.id}`}
                        />
                      </View>
                    ) : null}
                    <View style={{ flex: canIApprove ? 1 : undefined }}>
                      <PrimaryButton
                        label={t('sensitiveTopics.cancelRequest')}
                        onPress={() => handleCancelDelete(n)}
                        loading={acting === n.id}
                        variant="secondary"
                        testID={`temas-sensiveis-cancel-delete-${n.id}`}
                      />
                    </View>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  disabled={acting === n.id}
                  onPress={() => handleRequestDelete(n)}
                  style={{ alignSelf: 'flex-end', marginTop: spacing.sm, paddingVertical: 4, paddingHorizontal: 8 }}
                >
                  <Text style={{ fontSize: font.sizes.xs, color: colors.error }}>{t('sensitiveTopics.requestDelete')}</Text>
                </TouchableOpacity>
              )}
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
              {t('sensitiveTopics.newNote')}
            </Text>
            <ScrollView>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('sensitiveTopics.topic')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {(Object.keys(TOPIC_META) as SensitiveTopic[]).map(k => {
                  const m = TOPIC_META[k];
                  const active = newTopic === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => setNewTopic(k)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: active ? `${m.color}20` : colors.bg,
                        borderWidth: 1, borderColor: active ? m.color : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{m.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? m.color : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {t(m.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {children.length > 0 ? (
                <>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('sensitive.childOptional')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                    <TouchableOpacity
                      onPress={() => setNewChildId(null)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: newChildId === null ? colors.brand : colors.bg,
                        borderWidth: 1, borderColor: newChildId === null ? colors.brand : colors.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: font.sizes.sm, color: newChildId === null ? '#fff' : colors.text }}>{t('sensitiveTopics.general')}</Text>
                    </TouchableOpacity>
                    {children.map(c => {
                      const active = newChildId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setNewChildId(c.id)}
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
                value={newTitle} onChangeText={setNewTitle}
                placeholder={t('sensitive.titlePlaceholder')}
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm,
                }}
              />
              <TextInput
                value={newContent} onChangeText={setNewContent}
                placeholder={t('sensitiveTopics.detailsPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 100, textAlignVertical: 'top',
                  marginBottom: spacing.md,
                }}
              />

              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewUrgent(!newUrgent); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: newUrgent ? colors.error : colors.borderLight,
                  backgroundColor: newUrgent ? colors.error : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {newUrgent ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                  {t('sensitive.markUrgent')}
                </Text>
              </TouchableOpacity>

              <PrimaryButton
                label={t('sensitiveTopics.register')}
                onPress={submitNew}
                loading={submitting}
                disabled={!newTitle.trim() || !newContent.trim()}
                testID="temas-sensiveis-submit"
              />
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
