import { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from 'src/store/auth';
import { fetchPendingReports, type PendingActivityReport } from 'src/services/activities';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import ActivityReportModal from 'src/components/activities/ActivityReportModal';
import { useI18n } from 'src/i18n';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${MONTHS[(m || 1) - 1]}`;
}

/**
 * Relatos pendentes — lista COMPLETA das ocorrências passadas (últimos 7 dias)
 * sem activity_report. Destino do "ver tudo" em Status pendentes no dashboard.
 *
 * Diferente da tela /atividades (que lista as DEFINIÇÕES de atividade e cujo
 * "Relatar" reportava pra HOJE, sem limpar o pendente), aqui cada item carrega
 * a occurrence_date certa → relatar limpa o item, igual ao dashboard.
 * Bug Henrique 2026-06-05.
 */
export default function RelatosPendentesScreen() {
  const t = useI18n((s) => s.t);
  const { activeGroup, userId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [reporting, setReporting] = useState<PendingActivityReport | null>(null);

  const { data: pending, loading, refresh: load } = useCachedFetch<PendingActivityReport[]>({
    cacheKey: activeGroup ? `relatos_pendentes_${activeGroup.groupId}` : null,
    tag: 'relatos-pendentes:load',
    empty: [],
    fetcher: () => fetchPendingReports(activeGroup!.groupId),
  });

  // Quando um coparente relata (ou some uma ocorrência), a lista muda.
  useCollabRealtime({
    table: 'activity_reports',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'relato',
    myUserId: userId,
  });

  const renderItem = ({ item }: { item: PendingActivityReport }) => (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReporting(item); }}
      accessibilityRole="button"
      accessibilityLabel={`${t('activityReport.reportNow')} ${item.activityName} — ${item.childName}${item.daysAgo > 0 ? `, há ${item.daysAgo} dias` : ''}`}
      style={{
        backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg,
        marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: spacing.md, ...shadows.sm,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(232,162,40,0.2)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="clipboard-outline" size={18} color="#E8A228" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>{item.activityName}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
          {item.childName} · {formatShortDate(item.occurrenceDate)}{item.daysAgo > 0 ? ` (há ${item.daysAgo}d)` : ''}
        </Text>
      </View>
      <View style={{ backgroundColor: '#E8A228', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: font.weights.semibold }}>{t('activityReport.reportNow')}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('activityReport.pendingReports')} />
      {loading && pending.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : null}
      <FlatList
        data={loading && pending.length === 0 ? [] : pending}
        keyExtractor={(item) => `${item.activityId}-${item.occurrenceDate}`}
        renderItem={renderItem}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
            tintColor={colors.brand}
          />
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="✅"
              title="Tudo em dia!"
              description="Você não tem relatos de atividades pendentes."
            />
          )
        }
      />

      {reporting && activeGroup && userId ? (
        <ActivityReportModal
          visible={!!reporting}
          onClose={() => setReporting(null)}
          groupId={activeGroup.groupId}
          activityId={reporting.activityId}
          activityName={reporting.activityName}
          childId={reporting.childId}
          reporterId={userId}
          occurrenceDate={reporting.occurrenceDate}
          onSubmitted={load}
        />
      ) : null}
    </View>
  );
}
