/**
 * OfflineBanner — Banner global de status offline + fila pendente.
 *
 * Resolve a queixa "perdi meus registros" que aparece em conexões ruins:
 * o app silenciosamente enfileira escritas via safeWrite, mas o usuário
 * não sabe disso. Quando volta online, a fila sincroniza sozinha.
 *
 * O banner aparece no topo (abaixo do safe area) com 3 estados:
 *
 *  1. Online + fila vazia → escondido (default).
 *  2. Offline + fila vazia → `ui.offlineBanner.noInternetCached`
 *  3. Offline + fila com N → `ui.offlineBanner.noInternetQueue` com summary
 *  4. Online + fila com N → `ui.offlineBanner.syncing` (transiente)
 *
 * Decisões consolidadas:
 *  - Atualiza a cada 3s pra refletir mudanças na fila (poll é mais simples
 *    que assinar mutations da queue; trade-off aceito).
 *  - Tap no banner abre modal com detalhes da fila + botão "Tentar agora".
 *  - Slide-down animation de Reanimated; não bloqueia tap em itens abaixo.
 *  - Cores: âmbar suave pra offline (não vermelho — não é erro, é estado);
 *    azul suave pra "sincronizando".
 *
 * i18n (Regras Canônicas 1, 6, 7):
 *  - Todas as strings vivem em `ui.offlineBanner.*` nos 5 locales.
 *  - Plural é resolvido em JS escolhendo `tableOne_<table>` ou
 *    `tableOther_<table>` (count===1 vs ≥2) — equivalente ao plural ICU
 *    pra cada tabela conhecida (alergia/alergias etc). Tabelas
 *    desconhecidas caem em `tableOneFallback`/`tableOtherFallback`.
 *  - Horário da fila via `intl.formatTime` (locale-aware, não fixo pt-BR).
 *
 * Wrap em _layout.tsx logo abaixo do ToastProvider pra ficar acima das telas.
 */
import { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import Animated, { SlideInDown, SlideOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { isOnline, onConnectivityChange, getQueue, syncQueue, type QueuedAction } from '../../services/offline';
import { colors, spacing, radius, font } from '../../design-system/tokens';
import { useI18n } from '../../i18n';
import { useIntl } from '../../lib/intl';

const POLL_MS = 3000;

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** Tabelas conhecidas — chaves resolvidas em `ui.offlineBanner.tableOne_<table>`
 *  / `tableOther_<table>` nos 5 locales. */
const KNOWN_TABLES = new Set<string>([
  'child_allergies',
  'active_medications',
  'medication_doses',
  'growth_records',
  'illness_episodes',
  'symptom_entries',
  'medical_appointments',
  'vaccination_records',
  'medical_professionals',
  'expenses',
  'notes',
  'child_activities',
]);

function pluralizeTable(t: TFn, table: string, count: number): string {
  if (KNOWN_TABLES.has(table)) {
    const key = count === 1
      ? `ui.offlineBanner.tableOne_${table}`
      : `ui.offlineBanner.tableOther_${table}`;
    return t(key, { count });
  }
  return count === 1
    ? t('ui.offlineBanner.tableOneFallback', { table })
    : t('ui.offlineBanner.tableOtherFallback', { count, table });
}

function summarizeQueue(t: TFn, queue: QueuedAction[]): string {
  if (queue.length === 0) return '';
  // Agrupa por tabela pra mostrar "2 alergias · 1 consulta"
  const byTable = new Map<string, number>();
  for (const action of queue) {
    byTable.set(action.table, (byTable.get(action.table) || 0) + 1);
  }
  const parts: string[] = [];
  for (const [table, count] of byTable) {
    parts.push(pluralizeTable(t, table, count));
  }
  return parts.join(' · ');
}

function operationLabel(t: TFn, op: QueuedAction['operation']): string {
  if (op === 'insert') return t('ui.offlineBanner.operationInsert');
  if (op === 'update') return t('ui.offlineBanner.operationUpdate');
  return t('ui.offlineBanner.operationDelete');
}

function singleItemLabel(t: TFn, table: string): string {
  // Mesma lógica do pluralizeTable mas count fixo em 1.
  return pluralizeTable(t, table, 1);
}

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const t = useI18n((s) => s.t);
  const intl = useIntl();
  const [online, setOnline] = useState(() => isOnline());
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Subscreve connectivity changes
  useEffect(() => {
    return onConnectivityChange((next) => setOnline(next));
  }, []);

  // Poll queue (NetInfo dispara sync auto ao reconectar; aqui só refletimos UI)
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const q = await getQueue();
      if (!cancelled) setQueue(q);
    }
    tick();
    const interval = setInterval(tick, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSyncing(true);
    try {
      await syncQueue();
      const q = await getQueue();
      setQueue(q);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  // Banner não aparece quando online + fila vazia
  const hasQueue = queue.length > 0;
  if (online && !hasQueue) return null;

  const isOfflineWithQueue = !online && hasQueue;
  const isOfflineEmpty = !online && !hasQueue;
  const isOnlineSyncing = online && hasQueue;

  const bg = isOnlineSyncing ? '#DBEAFE' : '#FEF3C7';
  const border = isOnlineSyncing ? '#BFDBFE' : '#FDE68A';
  const fg = isOnlineSyncing ? '#1E3A8A' : '#92400E';
  const icon = isOnlineSyncing ? 'sync' : 'cloud-offline-outline';

  let message: string;
  if (isOfflineEmpty) message = t('ui.offlineBanner.noInternetCached');
  else if (isOfflineWithQueue) message = t('ui.offlineBanner.noInternetQueue', { summary: summarizeQueue(t, queue) });
  else message = t('ui.offlineBanner.syncing', { summary: summarizeQueue(t, queue) });

  return (
    <>
      <Animated.View
        entering={SlideInDown.duration(220)}
        exiting={SlideOutUp.duration(220)}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={{
          position: 'absolute',
          top: insets.top,
          left: spacing.sm,
          right: spacing.sm,
          zIndex: 100,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            setShowDetails(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={message}
          accessibilityHint={hasQueue ? t('ui.offlineBanner.detailsHint') : undefined}
          activeOpacity={0.85}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            backgroundColor: bg,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: border,
            paddingVertical: spacing.sm,
            paddingHorizontal: spacing.md,
          }}
        >
          <Ionicons name={icon as keyof typeof import('@expo/vector-icons').Ionicons.glyphMap} size={16} color={fg} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: fg }}
          >
            {message}
          </Text>
          {hasQueue ? (
            <Ionicons name="chevron-forward" size={14} color={fg} />
          ) : null}
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={showDetails}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetails(false)}
      >
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: spacing.lg }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
            borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
          }}>
            <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {online ? t('ui.offlineBanner.syncDetailsTitle') : t('ui.offlineBanner.offlineDetailsTitle')}
            </Text>
            <TouchableOpacity
              onPress={() => setShowDetails(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, lineHeight: 20 }}>
              {online
                ? t('ui.offlineBanner.syncingDescription')
                : t('ui.offlineBanner.offlineDescription')}
            </Text>

            {hasQueue ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {t('ui.offlineBanner.queueSectionTitle')}
                </Text>
                {queue.map((action, idx) => {
                  const label = singleItemLabel(t, action.table);
                  const op = operationLabel(t, action.operation);
                  return (
                    <View
                      key={action.id ?? idx}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                        backgroundColor: colors.bgElevated, borderRadius: radius.md,
                        paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
                      }}
                    >
                      <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                      <Text style={{ fontSize: font.sizes.sm, color: colors.text, flex: 1 }}>
                        {t('ui.offlineBanner.queueItemEntry', { operation: op, label })}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {intl.formatTime(action.timestamp)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {hasQueue ? (
              <TouchableOpacity
                onPress={handleSyncNow}
                disabled={syncing || !online}
                accessibilityRole="button"
                accessibilityLabel={t('ui.offlineBanner.syncNowAccessibilityLabel')}
                style={{
                  backgroundColor: colors.brand,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.md,
                  alignItems: 'center',
                  opacity: syncing || !online ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: font.sizes.md, fontWeight: font.weights.semibold }}>
                  {syncing
                    ? t('ui.offlineBanner.syncingButton')
                    : online
                      ? t('ui.offlineBanner.syncNowButton')
                      : t('ui.offlineBanner.waitingConnectionButton')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
