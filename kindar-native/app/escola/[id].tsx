/**
 * Escola — detalhe de um school_log específico.
 *
 * Bug report 2026-05-14 (Angelino Barata): tap num evento Escola do
 * calendário levava pra /escola?highlight=<id> — abria a página geral
 * com o card highlighted, mas o user esperava abrir o DETALHE do evento
 * com todas as informações (igual /atividades/[id] e /eventos/[id]).
 *
 * Esta tela espelha o pattern de saude/detalhe.tsx:
 *   - Header com back button
 *   - Hero card: ícone, título, subtipo, chips (Novo, Prioridade)
 *   - Detail rows: criança, matéria, data, horário, nota, descrição, autor
 *   - Read receipts ("Visto por X · 14:32")
 *   - Footer com Editar/Excluir
 *
 * Edit/Delete reusam o fluxo da página de listagem — esta tela navega
 * de volta pra `/escola?openEditFor=<id>` ou aciona delete inline.
 */
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import {
  fetchSchoolLogById, fetchSchoolLogEventTime, fetchSchoolLogReads, markSchoolLogRead,
  deleteSchoolLog, toggleSchoolLogCompleted,
  SUBTYPE_LABEL, SUBTYPE_ICON, getKind,
  type SchoolLog, type SchoolPriority, type SchoolLogRead,
} from 'src/services/school';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import { useAuth } from 'src/store/auth';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { getDisplayName } from 'src/lib/constants';
import { track, EVENTS } from 'src/lib/analytics';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

const PRIORITY_META: Record<SchoolPriority, { label: string; chipBg: string; chipText: string }> = {
  info:      { label: 'Info',       chipBg: 'rgba(107,114,128,0.15)', chipText: '#4B5563' },
  important: { label: 'Importante', chipBg: 'rgba(245,158,11,0.18)',  chipText: '#B45309' },
  urgent:    { label: 'Urgente',    chipBg: 'rgba(239,68,68,0.18)',   chipText: '#B91C1C' },
};

interface DetailRow {
  label: string;
  value: string;
  icon?: string;
  color?: string;
}

export default function EscolaDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();

  // log_date é YYYY-MM-DD — intl.formatDate normaliza pra meio-dia local.
  const formatLogDate = (iso: string): string =>
    intl.formatDate(iso, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const formatCreatedAt = (iso: string): string => intl.formatDateTime(iso);
  const formatReadAt = (iso: string): string => `${intl.formatDate(iso)} · ${intl.formatTime(iso)}`;

  interface SchoolDetailCache {
    log: SchoolLog | null;
    reads: SchoolLogRead[];
    eventTime: string | null;
  }
  const { data, loading, refresh: load } = useCachedFetch<SchoolDetailCache>({
    cacheKey: id ? `escola_detail_${id}` : null,
    tag: 'escola:detail:load',
    empty: { log: null, reads: [], eventTime: null },
    fetcher: async () => {
      const row = await fetchSchoolLogById(id!);
      let allReads: SchoolLogRead[] = [];
      let scopedReads: SchoolLogRead[] = [];
      if (row?.group_id) {
        allReads = await fetchSchoolLogReads(row.group_id);
        scopedReads = allReads.filter(r => r.log_id === id);
      }
      let eventTime: string | null = null;
      if (row && getKind(row.log_type) === 'event') {
        eventTime = await fetchSchoolLogEventTime(row.id);
      }
      // Mark as read on first view — explicit open via detail page conta como
      // "user saw it". Idempotente no server (PK em collab_reads), mas
      // guardamos o evento de analytics pra nao disparar duplicado em refoco.
      if (row && userId) {
        const alreadyRead = allReads.some(r => r.user_id === userId && r.log_id === id);
        if (!alreadyRead) {
          track(EVENTS.NOTIFICATION_OPENED, { record_type: 'school_log', record_id: id! });
          void markSchoolLogRead(id!);
        }
      }
      return { log: row, reads: scopedReads, eventTime };
    },
  });
  const log = data.log;
  const reads = data.reads;
  const eventTime = data.eventTime;

  async function handleDelete() {
    if (!log) return;
    Alert.alert(
      t('school.deleteLogTitle'),
      t('school.deleteLogMessage', { title: log.title }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            const res = await deleteSchoolLog(log.id);
            if (res.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } else {
              toast.show({ message: res.error || t('toasts.common.deleteFailed'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  async function handleToggleCompleted() {
    if (!log) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic flip removido na migracao pra useCachedFetch (state vem
    // do helper). Re-fetch garante consistencia.
    const res = await toggleSchoolLogCompleted(log.id, log.completed);
    if (!res.success) {
      toast.show({ message: res.error || t('toasts.common.updateFailed'), variant: 'error' });
    }
    await load();
  }

  function handleEdit() {
    if (!log) return;
    // Edit modal vive no /escola index — passar param pra abrir o editor direto.
    router.push({ pathname: '/escola', params: { openEditFor: log.id } } as never);
  }

  const isHomework = log?.log_type === 'homework';
  const isEvent = log ? getKind(log.log_type) === 'event' : false;

  // Build detail rows
  const rows: DetailRow[] = [];
  if (log) {
    if (log.child_full_name) {
      rows.push({ label: t('health.child'), value: log.child_full_name, icon: '👶' });
    }
    if (log.subject) {
      rows.push({ label: t('schoolPage.client.subjectLabel'), value: log.subject, icon: '📚' });
    }
    rows.push({ label: t('school.fieldDate'), value: formatLogDate(log.log_date), icon: '📅' });
    if (eventTime) {
      rows.push({ label: t('school.rowSchedule'), value: eventTime.slice(0, 5), icon: '🕐' });
    }
    if (log.score) {
      rows.push({ label: 'Nota', value: log.score, icon: '🏆', color: colors.brand });
    }
    if (log.description) {
      rows.push({ label: t('school.fieldNote'), value: log.description, icon: '📝' });
    }
    if (log.logged_by_name) {
      rows.push({ label: 'Registrado por', value: getDisplayName(log.logged_by_name, true), icon: '👤' });
    }
    if (log.created_at) {
      rows.push({ label: 'Criado em', value: formatCreatedAt(log.created_at), icon: '🕐' });
    }
  }

  const coparentReaders = reads.filter(r => r.user_id !== userId);
  const priorityMeta = log ? PRIORITY_META[log.priority] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg, backgroundColor: colors.bgElevated,
        borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
        flexDirection: 'row', alignItems: 'center', gap: spacing.md,
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}>
          {log ? SUBTYPE_LABEL[log.log_type] : 'Detalhe'}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : !log ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl }}>
          <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
            Registro não encontrado.{'\n'}Talvez tenha sido excluído.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 140 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero */}
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            padding: spacing.xl, marginBottom: spacing.xl, ...shadows.md,
            opacity: log.completed ? 0.6 : 1,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <View style={{
                width: 56, height: 56, borderRadius: 28,
                backgroundColor: `${colors.brand}15`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 28 }}>{SUBTYPE_ICON[log.log_type]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: font.sizes.xl, fontWeight: font.weights.bold, color: colors.text,
                  textDecorationLine: log.completed ? 'line-through' : 'none',
                }}>
                  {log.title}
                </Text>
                <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: font.weights.medium, marginTop: 2 }}>
                  {SUBTYPE_LABEL[log.log_type]}{isEvent ? ' · 📅 No calendário' : ''}
                </Text>
              </View>
            </View>

            {/* Priority chip */}
            {priorityMeta && log.priority !== 'info' ? (
              <View style={{ flexDirection: 'row', marginTop: spacing.md }}>
                <View style={{ backgroundColor: priorityMeta.chipBg, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full }}>
                  <Text style={{ color: priorityMeta.chipText, fontSize: font.sizes.xs, fontWeight: font.weights.bold, textTransform: 'uppercase' }}>
                    {t(`collab.priority${log.priority.charAt(0).toUpperCase() + log.priority.slice(1)}`)}
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Toggle complete (homework only) */}
            {isHomework ? (
              <TouchableOpacity
                onPress={handleToggleCompleted}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: log.completed }}
                accessibilityLabel={log.completed ? 'Desmarcar concluída' : 'Marcar como concluída'}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                  marginTop: spacing.md, paddingVertical: spacing.sm,
                }}
              >
                <View style={{
                  width: 22, height: 22, borderRadius: 6,
                  borderWidth: 2, borderColor: log.completed ? colors.brand : colors.borderLight,
                  backgroundColor: log.completed ? colors.brand : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {log.completed ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium }}>
                  {log.completed ? 'Concluída' : 'Marcar como concluída'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Detail rows */}
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            ...shadows.sm, overflow: 'hidden',
          }}>
            {rows.map((row, i) => (
              <View key={i} style={{
                flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
                padding: spacing.lg,
                borderTopWidth: i > 0 ? 0.5 : 0, borderTopColor: colors.borderLight,
              }}>
                {row.icon ? <Text style={{ fontSize: 14, marginTop: 2 }}>{row.icon}</Text> : null}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 2 }}>
                    {row.label}
                  </Text>
                  <Text style={{
                    fontSize: font.sizes.md, color: row.color || colors.text,
                    fontWeight: font.weights.medium,
                  }}>
                    {row.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Read receipts */}
          {coparentReaders.length > 0 ? (
            <View style={{
              backgroundColor: colors.bgSurface, borderRadius: radius.xl,
              padding: spacing.lg, marginTop: spacing.lg,
              borderWidth: 1, borderColor: colors.borderLight,
            }}>
              <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.xs }}>
                {t('collab.seen').toUpperCase()}
              </Text>
              {coparentReaders.map((r) => (
                <View key={r.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 4 }}>
                  <Ionicons name="checkmark-circle" size={14} color={colors.brand} />
                  <Text style={{ fontSize: font.sizes.sm, color: colors.text }}>
                    {formatReadAt(r.read_at)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Action bar */}
          <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl }}>
            <TouchableOpacity
              onPress={handleEdit}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Editar"
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
                paddingVertical: spacing.md, borderRadius: radius.md,
                backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.borderLight,
              }}
            >
              <Ionicons name="create-outline" size={18} color={colors.text} />
              <Text style={{ fontSize: font.sizes.md, color: colors.text, fontWeight: font.weights.semibold }}>
                Editar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleDelete}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Excluir"
              style={{
                flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
                paddingVertical: spacing.md, borderRadius: radius.md,
                backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
              }}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
              <Text style={{ fontSize: font.sizes.md, color: colors.error, fontWeight: font.weights.semibold }}>
                Excluir
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}
