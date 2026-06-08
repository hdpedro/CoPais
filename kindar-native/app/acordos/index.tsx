/**
 * Acordos — lista + composer + aceite pelo outro co-responsavel.
 * Mirrors PWA /acordos (workflow 7 of 8 — Acordos).
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
  fetchAgreements, createAgreement, acceptAgreement, deleteAgreement,
  type Agreement, type AgreementCategory,
} from 'src/services/agreements';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import FAB from 'src/components/ui/FAB';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const CAT_META: Record<string, { labelKey: string; icon: string; color: string }> = {
  principle: { labelKey: 'agreements.categoryPrinciple', icon: '🌟', color: '#8B5CF6' },
  value: { labelKey: 'agreements.categoryValue', icon: '💎', color: '#3B82F6' },
  rule: { labelKey: 'agreements.categoryRule', icon: '📏', color: '#E8A228' },
  boundary: { labelKey: 'agreements.categoryBoundary', icon: '🚧', color: '#EF4444' },
  routine: { labelKey: 'agreements.categoryRoutine', icon: '🕰️', color: '#22C55E' },
};

export default function AcordosScreen() {
  const t = useI18n(s => s.t);
  const { activeGroup, userId } = useAuth();
  const [accepting, setAccepting] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<AgreementCategory>('rule');
  const [newNonNegotiable, setNewNonNegotiable] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data: agreements, loading, refresh: load } = useCachedFetch<Agreement[]>({
    cacheKey: activeGroup ? `acordos_${activeGroup.groupId}` : null,
    tag: 'acordos:load',
    empty: [],
    fetcher: () => fetchAgreements(activeGroup!.groupId),
  });

  async function handleAccept(a: Agreement) {
    if (!userId || !activeGroup) return;
    setAccepting(a.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await acceptAgreement(a.id, userId, activeGroup.groupId, a.title);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setAccepting(null);
  }

  async function handleDelete(a: Agreement) {
    if (!activeGroup) return;
    Alert.alert(
      t('agreements.removeTitle'),
      t('agreements.removeConfirmMessage', { title: a.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('agreements.remove'),
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const res = await deleteAgreement(a.id, activeGroup.groupId);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            }
          },
        },
      ]
    );
  }

  async function submitNew() {
    if (!userId || !activeGroup || !newTitle.trim() || !newDescription.trim()) return;
    setSubmitting(true);
    const res = await createAgreement({
      groupId: activeGroup.groupId,
      title: newTitle,
      description: newDescription,
      category: newCategory,
      isNonNegotiable: newNonNegotiable,
      createdBy: userId,
    });
    setSubmitting(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setNewTitle(''); setNewDescription('');
      setNewCategory('rule'); setNewNonNegotiable(false);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('agreements.title')} />
      {loading && agreements.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : null}
      <FlatList
        data={loading && agreements.length === 0 ? [] : agreements}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : <EmptyState icon="🤝" title={t('empty.acordos.title')} description={t('empty.acordos.description')} />}
        renderItem={({ item: a }) => {
          const cat = CAT_META[a.category] || CAT_META.rule;
          const isMine = a.created_by === userId;
          const isAccepted = !!a.accepted_by;
          const canIAccept = !isMine && !isAccepted;
          return (
            <View
              style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                borderLeftWidth: isAccepted ? 3 : 1,
                borderLeftColor: isAccepted ? colors.success : cat.color,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: `${cat.color}20`, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 18 }}>{cat.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: font.sizes.xs, color: cat.color, fontWeight: font.weights.semibold, textTransform: 'uppercase' }}>{t(cat.labelKey)}</Text>
                    {a.is_non_negotiable ? (
                      <View style={{ backgroundColor: `${colors.error}15`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, color: colors.error, fontWeight: font.weights.bold }}>{t('agreements.nonNegotiable')}</Text>
                      </View>
                    ) : null}
                    {isAccepted ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                        <Text style={{ fontSize: font.sizes.xs, color: colors.success, fontWeight: font.weights.medium }}>{t('agreements.accepted')}</Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: font.sizes.xs, color: colors.warning, fontWeight: font.weights.medium }}>{t('agreements.awaitingAccept')}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: 2 }}>
                    {a.title}
                  </Text>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, lineHeight: 20 }}>
                    {a.description}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: spacing.sm }}>
                    {t('agreements.proposedBy', { name: a.authorName || t('agreements.someone') })}
                    {isAccepted && a.acceptedByName ? ` · ${t('agreements.acceptedBy', { name: a.acceptedByName })}` : ''}
                  </Text>
                </View>
              </View>

              {canIAccept ? (
                <View style={{ marginTop: spacing.md }}>
                  <PrimaryButton
                    label={t('agreements.acceptButton')}
                    onPress={() => handleAccept(a)}
                    loading={accepting === a.id}
                    testID={`acordos-accept-${a.id}`}
                  />
                </View>
              ) : null}
              {isMine ? (
                <TouchableOpacity
                  onPress={() => handleDelete(a)}
                  accessibilityRole="button"
                  accessibilityLabel={t('agreements.removeTitle')}
                  style={{ alignSelf: 'flex-end', marginTop: spacing.sm, paddingVertical: 4, paddingHorizontal: 8 }}
                >
                  <Text style={{ fontSize: font.sizes.xs, color: colors.error }}>{t('agreements.remove')}</Text>
                </TouchableOpacity>
              ) : null}
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
              {t('agreements.newAgreement')}
            </Text>
            <ScrollView>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('checkinForm.category')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {(Object.keys(CAT_META) as AgreementCategory[]).map(k => {
                  const m = CAT_META[k];
                  const active = newCategory === k;
                  return (
                    <TouchableOpacity
                      key={k}
                      onPress={() => setNewCategory(k)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t(m.labelKey)}
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

              <TextInput
                value={newTitle} onChangeText={setNewTitle}
                placeholder={t('agreements.titlePlaceholderShort')}
                placeholderTextColor={colors.textMuted}
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                  paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                  fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm,
                }}
              />
              <TextInput
                value={newDescription} onChangeText={setNewDescription}
                placeholder={t('agreements.descriptionPlaceholderDetail')}
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
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNewNonNegotiable(!newNonNegotiable); }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: newNonNegotiable }}
                accessibilityLabel={t('agreements.markNonNegotiable')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 20, height: 20, borderRadius: 4,
                  borderWidth: 1.5,
                  borderColor: newNonNegotiable ? colors.error : colors.borderLight,
                  backgroundColor: newNonNegotiable ? colors.error : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {newNonNegotiable ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                    {t('agreements.markNonNegotiable')}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                    {t('agreements.nonNegotiableHint')}
                  </Text>
                </View>
              </TouchableOpacity>

              <PrimaryButton
                label={t('agreements.proposeButton')}
                onPress={submitNew}
                loading={submitting}
                disabled={!newTitle.trim() || !newDescription.trim()}
                testID="acordos-submit"
              />
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
