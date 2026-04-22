/**
 * Doencas — lista de episodios de doenca.
 * Mirrors PWA /saude/doencas.
 */
import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/auth';
import { fetchIllnesses, resolveIllness, type IllnessEpisode } from '../../src/services/health';
import { colors, spacing, radius, font, shadows } from '../../src/design-system/tokens';

const SEV_META: Record<string, { label: string; color: string }> = {
  mild: { label: 'Leve', color: '#4CAF50' },
  moderate: { label: 'Moderado', color: '#E8A228' },
  severe: { label: 'Severo', color: '#E53935' },
};

function daysSince(startDate: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startDate + 'T12:00:00').getTime()) / 86400000));
}

export default function DoencasScreen() {
  const insets = useSafeAreaInsets();
  const { activeGroup } = useAuth();
  const [illnesses, setIllnesses] = useState<IllnessEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('active');

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const data = await fetchIllnesses(activeGroup.groupId);
    setIllnesses(data);
    setLoading(false);
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  async function handleResolve(ill: IllnessEpisode) {
    Alert.alert(
      'Encerrar episodio',
      `Marcar "${ill.title}" como resolvida? Fica no historico.`,
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
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          Doencas
        </Text>
      </View>

      {/* Filter chips */}
      <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 }}>
        {(['active', 'resolved', 'all'] as const).map(f => {
          const active = filter === f;
          const label = f === 'active' ? 'Ativas' : f === 'resolved' ? 'Resolvidas' : 'Todas';
          return (
            <TouchableOpacity
              key={f}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(f); }}
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
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing['3xl'] }}>
              <Text style={{ fontSize: 44, marginBottom: spacing.md }}>🩺</Text>
              <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text, marginBottom: spacing.xs }}>
                {filter === 'active' ? 'Nenhuma doenca ativa' : 'Nenhum episodio'}
              </Text>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center' }}>
                Registre episodios para acompanhar a evolucao de doencas e tratamentos
              </Text>
            </View>
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
                          {isActive ? `Ha ${days}d` : `Durou ${i.end_date ? Math.floor((new Date(i.end_date).getTime() - new Date(i.start_date).getTime()) / 86400000) : '?'}d`}
                        </Text>
                      </View>
                      {i.symptoms ? (
                        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm }}>
                          {i.symptoms}
                        </Text>
                      ) : null}
                      {i.hospital ? (
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 4 }}>
                          🏥 {i.hospital}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {isActive ? (
                    <TouchableOpacity
                      onPress={() => handleResolve(i)}
                      style={{
                        alignSelf: 'flex-start', marginTop: spacing.md,
                        paddingHorizontal: spacing.md, paddingVertical: 6,
                        borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
                      }}
                    >
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, fontWeight: font.weights.medium }}>
                        Marcar como resolvida
                      </Text>
                    </TouchableOpacity>
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
