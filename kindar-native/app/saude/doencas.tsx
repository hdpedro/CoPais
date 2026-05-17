/**
 * Doenças — lista de episódios de doença.
 * Mirrors PWA /saude/doencas.
 */
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { fetchIllnesses, resolveIllness, addEvolutionQuick, type IllnessEpisode } from 'src/services/health';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const SEV_META: Record<string, { label: string; color: string }> = {
  mild: { label: 'Leve', color: '#4CAF50' },
  moderate: { label: 'Moderado', color: '#E8A228' },
  severe: { label: 'Severo', color: '#E53935' },
};

function daysSince(startDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startDate + 'T12:00:00').getTime()) / 86400000));
}

export default function DoencasScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { activeGroup, profile } = useAuth();
  const [illnesses, setIllnesses] = useState<IllnessEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active');
  // Evolution quick-action state (per-card)
  const [expanded, setExpanded] = useState<{ episodeId: string; type: 'improving' | 'worsening' } | null>(null);
  const [evolutionNote, setEvolutionNote] = useState('');
  const [submittingEvolution, setSubmittingEvolution] = useState(false);
  const [evolutionFeedback, setEvolutionFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchIllnesses(activeGroup.groupId);
    setIllnesses(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useCollabRealtime({
    table: 'illness_episodes',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'episódio',
    myUserId: profile?.id,
  });

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  function startEvolution(episodeId: string, type: 'improving' | 'worsening') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded({ episodeId, type });
    setEvolutionNote('');
  }

  async function submitEvolution() {
    if (!expanded) return;
    setSubmittingEvolution(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await addEvolutionQuick({
      episodeId: expanded.episodeId,
      type: expanded.type,
      note: evolutionNote,
      authorFullName: profile?.full_name || null,
    });
    setSubmittingEvolution(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEvolutionFeedback(expanded.type === 'improving' ? 'Melhora registrada' : 'Piora registrada');
      setExpanded(null);
      setEvolutionNote('');
      setTimeout(() => setEvolutionFeedback(null), 2500);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.fallbackError'), variant: 'error' });
    }
  }

  async function handleResolve(ill: IllnessEpisode) {
    Alert.alert(
      'Encerrar episódio',
      `Marcar "${ill.title}" como resolvida? Fica no histórico.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'default',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const today = new Date().toISOString().slice(0, 10);
            const res = await resolveIllness(ill.id, today);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              await load();
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
          },
        },
      ]
    );
  }

  const filtered =
    filter === 'all' ? illnesses : illnesses.filter(i => i.status === filter);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Voltar">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Doenças
        </Text>
      </View>

      {/* Evolution feedback banner */}
      {evolutionFeedback ? (
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="checkmark-circle" size={18} color="#15803d" />
          <Text style={{ color: '#15803d', fontSize: font.sizes.sm, fontWeight: font.weights.medium }}>{evolutionFeedback}</Text>
        </View>
      ) : null}

      {/* Filter chips */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 }}>
        {(['active', 'resolved', 'all'] as const).map(f => {
          const active = filter === f;
          const label = f === 'active' ? 'Ativas' : f === 'resolved' ? 'Resolvidas' : 'Todas';
          return (
            <TouchableOpacity
              key={f}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(f); }}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Filtrar por ${label}`}
              style={{
                paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.md,
                backgroundColor: active ? colors.brand : colors.bgElevated,
                borderWidth: 1, borderColor: active ? colors.brand : colors.borderLight,
              }}
            >
              <Text style={{ fontSize: font.sizes.sm, color: active ? '#fff' : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon="🩺"
              title={filter === 'active' ? t('empty.doencasActive.title') : t('empty.doencasAll.title')}
              description={filter === 'active'
                ? t('empty.doencasActive.description')
                : t('empty.doencasAll.description')}
              action={{ label: t('empty.doencasActive.actionLabel'), onPress: () => router.push('/saude/doencas/nova'), accessibilityHint: t('empty.doencasActive.actionHint') }}
            />
          ) : (
            filtered.map(i => {
              const sev = SEV_META[i.severity || ''];
              const isActive = i.status === 'active';
              const days = daysSince(i.start_date);
              return (
                <View
                  key={i.id}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                    padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                    borderLeftWidth: 3, borderLeftColor: sev?.color || colors.brand,
                    opacity: isActive ? 1 : 0.7,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
                    <Text style={{ fontSize: 22 }}>{isActive ? '🤒' : '✅'}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                        {i.title}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        {i.childName ? <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>{i.childName}</Text> : null}
                        {sev ? (
                          <>
                            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>·</Text>
                            <Text style={{ fontSize: font.sizes.xs, color: sev.color, fontWeight: font.weights.medium }}>{sev.label}</Text>
                          </>
                        ) : null}
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>·</Text>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                          {isActive ? `Há ${days}d` : `Durou ${i.end_date ? Math.floor((new Date(i.end_date).getTime() - new Date(i.start_date).getTime()) / 86400000) : '?'}d`}
                        </Text>
                      </View>
                      {i.symptoms && i.symptoms.length > 0 ? (
                        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm }}>
                          {Array.isArray(i.symptoms) ? i.symptoms.join(', ') : i.symptoms}
                        </Text>
                      ) : null}
                      {i.hospital ? (
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>
                          🏥 {i.hospital}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {isActive && expanded?.episodeId === i.id ? (
                    <View style={{ marginTop: spacing.md, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight, padding: spacing.md }}>
                      <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.medium, color: colors.text, marginBottom: spacing.xs }}>
                        {expanded.type === 'improving' ? '📈' : '📉'} {i.title}
                      </Text>
                      <TextInput
                        value={evolutionNote}
                        onChangeText={setEvolutionNote}
                        placeholder="Nota opcional (febre baixou, continua tossindo...)"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        maxLength={500}
                        style={{
                          fontSize: font.sizes.sm, color: colors.text,
                          borderWidth: 1, borderColor: colors.borderLight, borderRadius: radius.sm,
                          paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
                          minHeight: 56, textAlignVertical: 'top', marginBottom: spacing.sm,
                        }}
                      />
                      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                        <TouchableOpacity
                          disabled={submittingEvolution}
                          onPress={submitEvolution}
                          accessibilityRole="button"
                          accessibilityLabel="Confirmar"
                          accessibilityState={{ disabled: submittingEvolution, busy: submittingEvolution }}
                          style={{
                            flex: 1, paddingVertical: 8, borderRadius: radius.sm,
                            backgroundColor: expanded.type === 'improving' ? '#22c55e' : '#ef4444',
                            alignItems: 'center', opacity: submittingEvolution ? 0.5 : 1,
                          }}
                        >
                          {submittingEvolution
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>Confirmar</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { setExpanded(null); setEvolutionNote(''); }}
                          accessibilityRole="button"
                          accessibilityLabel="Cancelar"
                          style={{
                            paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm,
                            backgroundColor: colors.bgSurface, alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: colors.textSecondary, fontSize: font.sizes.xs, fontWeight: font.weights.medium }}>Cancelar</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : isActive ? (
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                      <TouchableOpacity
                        onPress={() => startEvolution(i.id, 'improving')}
                        accessibilityRole="button"
                        accessibilityLabel={`Registrar melhora em ${i.title}`}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: radius.sm,
                          backgroundColor: 'rgba(34,197,94,0.1)', alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: font.sizes.xs, color: '#15803d', fontWeight: font.weights.semibold }}>
                          📈 Melhorou
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => startEvolution(i.id, 'worsening')}
                        accessibilityRole="button"
                        accessibilityLabel={`Registrar piora em ${i.title}`}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: radius.sm,
                          backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: font.sizes.xs, color: '#b91c1c', fontWeight: font.weights.semibold }}>
                          📉 Piorou
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleResolve(i)}
                        accessibilityRole="button"
                        accessibilityLabel={`Encerrar episódio ${i.title}`}
                        style={{
                          paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm,
                          borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center',
                        }}
                      >
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, fontWeight: font.weights.medium }}>
                          Encerrar
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/saude/doencas/nova' as never); }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Registrar nova doença"
        style={{
          position: 'absolute', bottom: insets.bottom + 20, right: 20,
          width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand,
          alignItems: 'center', justifyContent: 'center', ...shadows.md,
        }}
      >
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
