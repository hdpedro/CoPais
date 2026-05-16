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
 *  2. Offline + fila vazia → "📡 Sem internet — usando dados em cache"
 *  3. Offline + fila com N → "📡 Sem internet — N registro(s) aguardando"
 *  4. Online + fila com N → "🔄 Sincronizando N registro(s)…" (transiente)
 *
 * Decisões consolidadas:
 *  - Atualiza a cada 3s pra refletir mudanças na fila (poll é mais simples
 *    que assinar mutations da queue; trade-off aceito).
 *  - Tap no banner abre modal com detalhes da fila + botão "Tentar agora".
 *  - Slide-down animation de Reanimated; não bloqueia tap em itens abaixo.
 *  - Cores: âmbar suave pra offline (não vermelho — não é erro, é estado);
 *    azul suave pra "sincronizando".
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

const POLL_MS = 3000;

const TABLE_LABELS: Record<string, string> = {
  child_allergies: 'alergia',
  active_medications: 'medicamento',
  medication_doses: 'dose',
  growth_records: 'medida',
  illness_episodes: 'episódio',
  symptom_entries: 'sintoma',
  medical_appointments: 'consulta',
  vaccination_records: 'vacina',
  medical_professionals: 'profissional',
  expenses: 'despesa',
  notes: 'nota',
  child_activities: 'atividade',
};

function pluralize(label: string, count: number): string {
  if (count === 1) return `1 ${label}`;
  // PT-BR: alergia → alergias; profissional → profissionais; etc.
  // Pra simplificar: aceita -al → -ais; default → +s.
  if (label.endsWith('al')) return `${count} ${label.slice(0, -2)}ais`;
  return `${count} ${label}s`;
}

function summarizeQueue(queue: QueuedAction[]): string {
  if (queue.length === 0) return '';
  // Agrupa por tabela pra mostrar "2 alergias · 1 consulta"
  const byTable = new Map<string, number>();
  for (const action of queue) {
    byTable.set(action.table, (byTable.get(action.table) || 0) + 1);
  }
  const parts: string[] = [];
  for (const [table, count] of byTable) {
    const label = TABLE_LABELS[table] || table;
    parts.push(pluralize(label, count));
  }
  return parts.join(' · ');
}

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
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
  if (isOfflineEmpty) message = 'Sem internet — usando dados em cache';
  else if (isOfflineWithQueue) message = `Sem internet — ${summarizeQueue(queue)} aguardando`;
  else message = `Sincronizando ${summarizeQueue(queue)}…`;

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
          accessibilityHint={hasQueue ? 'Toque pra ver detalhes ou tentar sincronizar agora' : undefined}
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
              {online ? 'Sincronização pendente' : 'Você está offline'}
            </Text>
            <TouchableOpacity
              onPress={() => setShowDetails(false)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, lineHeight: 20 }}>
              {online
                ? 'Tudo que você registrou continua salvo. Estamos enviando ao servidor — deve sincronizar em segundos.'
                : 'Seus registros estão salvos localmente. Assim que a internet voltar, tudo sincroniza automaticamente.'}
            </Text>

            {hasQueue ? (
              <View style={{ gap: spacing.xs }}>
                <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Aguardando sincronizar
                </Text>
                {queue.map((action, idx) => {
                  const label = TABLE_LABELS[action.table] || action.table;
                  const op = action.operation === 'insert' ? 'Adicionar' : action.operation === 'update' ? 'Atualizar' : 'Apagar';
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
                        {op} {label}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {new Date(action.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
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
                accessibilityLabel="Tentar sincronizar agora"
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
                  {syncing ? 'Sincronizando…' : online ? 'Tentar agora' : 'Aguardando conexão…'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
