/**
 * Escola — Informacoes escolares por crianca + timeline de registros (school_logs).
 *
 * Paridade com:
 *   - PWA `/criancas/[id]?tab=educacao` → child_education (info estatica)
 *   - PWA `/escola` → school_logs (timeline de notas/reunioes/lembretes/etc.)
 *
 * Antes do 2026-04-27 essa tela so editava `child_education`. A timeline
 * de `school_logs` era PWA-only — fechado por essa migracao.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, RefreshControl, TouchableOpacity, Modal, TextInput,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { fetchChildren, fetchChildEducation, upsertChildEducation, type ChildEducation } from 'src/services/children';
import {
  fetchSchoolLogs, createSchoolLog, updateSchoolLog, deleteSchoolLog, toggleSchoolLogCompleted,
  fetchSchoolLogEventTime, fetchSchoolLogReads, markSchoolLogRead,
  EVENT_SUBTYPES, NOTE_SUBTYPES, SUBTYPE_LABEL, SUBTYPE_ICON, SUBTYPE_HINT, getKind,
  type SchoolLog, type SchoolLogType, type SchoolKind, type SchoolPriority, type SchoolLogRead,
} from 'src/services/school';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import { useToast } from 'src/components/ui/ToastProvider';
import EmptyState from 'src/components/ui/EmptyState';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { TimePickerField, DatePickerField } from 'src/components/ui/DateTimeField';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';
import { track, EVENTS } from 'src/lib/analytics';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';

interface ChildSchool {
  childId: string;
  childFullName: string;
  childName: string;
  education: ChildEducation | null;
}

interface ChildOption {
  id: string;
  full_name: string;
  short_name: string;
}

type Tab = 'info' | 'logs';

// Use SUBTYPE_LABEL / SUBTYPE_ICON from services/school.ts so PWA + native
// share a single source of truth (icons, copy, kind grouping).
const TYPE_LABELS = SUBTYPE_LABEL;
const TYPE_ICONS = SUBTYPE_ICON;

// Priority metadata — mirror of PWA EscolaClient PRIORITY_META.
// rank drives the "unread first, then urgent first" sort below.
// O label de exibição NÃO mora aqui: é resolvido no render via
// t('collab.priority{Info|Important|Urgent}') pra reagir à troca de idioma.
const PRIORITY_META: Record<SchoolPriority, { chipBg: string; chipText: string; rank: number }> = {
  info:      { chipBg: 'rgba(107,114,128,0.15)', chipText: '#4B5563',  rank: 0 },
  important: { chipBg: 'rgba(245,158,11,0.18)',  chipText: '#B45309',  rank: 1 },
  urgent:    { chipBg: 'rgba(239,68,68,0.18)',   chipText: '#B91C1C',  rank: 2 },
};

type ComposerStage =
  | { stage: 'closed' }
  | { stage: 'pick-kind' }
  | { stage: 'pick-subtype'; kind: SchoolKind }
  | { stage: 'form'; subtype: SchoolLogType };

function displayTime(t: string | null): string {
  if (!t) return '';
  return t.slice(0, 5);
}

function todayIso(): string {
  // Data LOCAL — toISOString() retornaria UTC, que vira o dia seguinte
  // depois das 21h no Brasil (UTC-3) e o log fica com a data errada.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function EscolaScreen() {
  const { activeGroup, userId } = useAuth();
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();
  const groupId = activeGroup?.groupId ?? null;

  // log_date é YYYY-MM-DD; intl.formatDate normaliza pra meio-dia local.
  const formatLogDate = (iso: string): string => intl.formatDate(iso);

  // Read-receipt: "agora" / "há N min" (reusa health.*) → mesmo dia mostra
  // a hora, dias anteriores mostram data curta. Tudo locale-aware via intl.
  const formatReadAt = (iso: string): string => {
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return t('health.now');
    if (diffMin < 60) return t('health.minutesAgo', { count: diffMin });
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay ? intl.formatTime(d) : intl.formatDateShort(d);
  };

  // Deep link from calendar: tap on event with school_log_id sets ?highlight=<id>
  // → land directly on Registros tab.
  // Deep link from /escola/[id] detail page: ?openEditFor=<id> auto-abre o
  // editor pra esse log assim que a lista carregar.
  const { highlight, openEditFor } = useLocalSearchParams<{ highlight?: string; openEditFor?: string }>();
  const [tab, setTab] = useState<Tab>(highlight || openEditFor ? 'logs' : 'info');

  // Info tab state
  const [editing, setEditing] = useState<ChildSchool | null>(null);
  const [saving, setSaving] = useState(false);
  const [schoolName, setSchoolName] = useState('');
  const [schoolAddress, setSchoolAddress] = useState('');
  const [schoolPhone, setSchoolPhone] = useState('');
  const [grade, setGrade] = useState('');
  const [className, setClassName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [coordinatorName, setCoordinatorName] = useState('');
  const [entryTime, setEntryTime] = useState('');
  const [exitTime, setExitTime] = useState('');
  const [extracurriculars, setExtracurriculars] = useState('');

  // Logs tab state
  const [composer, setComposer] = useState<ComposerStage>({ stage: 'closed' });
  const [editingLog, setEditingLog] = useState<SchoolLog | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [logChildId, setLogChildId] = useState<string | null>(null);
  const [logSubtype, setLogSubtype] = useState<SchoolLogType>('exam');
  const [logTitle, setLogTitle] = useState('');
  const [logDescription, setLogDescription] = useState('');
  const [logDate, setLogDate] = useState<string>(todayIso());
  const [logEventTime, setLogEventTime] = useState<string>('');
  const [logSubject, setLogSubject] = useState<string>('');
  const [logScore, setLogScore] = useState<string>('');
  const [logPriority, setLogPriority] = useState<SchoolPriority>('info');
  const [filterKind, setFilterKind] = useState<'all' | SchoolKind>('all');

  // Optimistic local reads — instant feedback when user opens a card.
  // Server-authoritative reads come back in the next loadLogs() cycle.
  const [optimisticReads, setOptimisticReads] = useState<Set<string>>(new Set());
  // Expanded card — tapping a card expands it AND marks it read. Only
  // one expansion at a time. Deep link from push starts expanded.
  const [expandedLogId, setExpandedLogId] = useState<string | null>(highlight || null);

  interface EscolaInfoCache { schools: ChildSchool[]; childOptions: ChildOption[] }
  const { data: infoData, loading, refresh: load } = useCachedFetch<EscolaInfoCache>({
    cacheKey: groupId ? `escola_info_${groupId}` : null,
    tag: 'escola:info:load',
    empty: { schools: [], childOptions: [] },
    fetcher: async () => {
      const children = await fetchChildren(groupId!);
      const results: ChildSchool[] = [];
      const opts: ChildOption[] = [];
      for (const child of children) {
        const edu = await fetchChildEducation(child.id);
        results.push({
          childId: child.id,
          childFullName: child.full_name,
          childName: child.full_name.split(' ')[0],
          education: edu,
        });
        opts.push({
          id: child.id,
          full_name: child.full_name,
          short_name: child.full_name.split(' ')[0],
        });
      }
      return { schools: results, childOptions: opts };
    },
  });
  const schools = infoData.schools;
  const childOptions = infoData.childOptions;

  interface EscolaLogsCache { logs: SchoolLog[]; reads: SchoolLogRead[] }
  const { data: logsData, loading: logsLoading, refresh: loadLogs } = useCachedFetch<EscolaLogsCache>({
    cacheKey: groupId ? `escola_logs_${groupId}` : null,
    tag: 'escola:logs:load',
    empty: { logs: [], reads: [] },
    fetcher: async () => {
      const [rows, readsRows] = await Promise.all([
        fetchSchoolLogs(groupId!),
        fetchSchoolLogReads(groupId!),
      ]);
      const serverReadIds = new Set(
        readsRows.filter((r) => r.user_id === userId).map((r) => r.log_id),
      );
      setOptimisticReads((prev) => {
        const next = new Set<string>();
        for (const id of prev) if (!serverReadIds.has(id)) next.add(id);
        return next;
      });
      return { logs: rows, reads: readsRows };
    },
  });
  const logs = logsData.logs;
  const reads = logsData.reads;

  // Push deep link → explicit open. Fire notification_opened AND
  // mark as read. Mirrors PWA EscolaClient behavior — without this,
  // tapping a push notification didn't actually mark the record as
  // read, so the badge stayed "Novo" until the user tapped the card
  // a second time.
  useEffect(() => {
    if (!highlight) return;
    track(EVENTS.NOTIFICATION_OPENED, { record_type: 'school_log', record_id: highlight });
    // Defer the markAsRead until the logs list is loaded — without this,
    // we'd mark a record we haven't fetched yet (RPC still works, just
    // racy with the optimistic local state). loadLogs runs on useFocusEffect.
    const target = logs.find((l) => l.id === highlight);
    if (target && isUnread(target)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticReads((prev) => new Set(prev).add(highlight));
      void markSchoolLogRead(highlight);
    }
    // Re-run when logs land — first pass before fetch will see logs.length=0
    // and bail; the second pass picks up the loaded target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, logs.length]);

  // Deep link de /escola/[id] detail page: ?openEditFor=<id> → abre editor.
  // Fires UMA vez quando o log da lista é carregado. Sem isso, o user voltava
  // do detalhe sem o editor abrir — UX quebrada.
  const editTriggered = useRef(false);
  useEffect(() => {
    if (!openEditFor || editTriggered.current) return;
    const target = logs.find((l) => l.id === openEditFor);
    if (target) {
      editTriggered.current = true;
      void openEditLog(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEditFor, logs.length]);

  // ── Read-receipt helpers ───────────────────────────────────────────
  // Indexed by log_id for O(1) lookup. Memoized so mutation only happens
  // on construction; subsequent renders reuse the same Map.
  const readsByLogId = useMemo(() => {
    const map = new Map<string, SchoolLogRead[]>();
    for (const r of reads) {
      const arr = map.get(r.log_id) || [];
      arr.push(r);
      map.set(r.log_id, arr);
    }
    return map;
  }, [reads]);

  function isUnread(log: SchoolLog): boolean {
    if (optimisticReads.has(log.id)) return false;
    const logReads = readsByLogId.get(log.id) || [];
    return !logReads.some((r) => r.user_id === userId);
  }

  function coparentReaders(log: SchoolLog): SchoolLogRead[] {
    const logReads = readsByLogId.get(log.id) || [];
    return logReads.filter((r) => r.user_id !== userId);
  }

  // Per CLAUDE.md "Collaborative Records": mark read ONLY on explicit
  // open — never on scroll/mount/preload. Tap toggles expansion AND
  // marks read on first open.
  function handleOpenCard(log: SchoolLog) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const wasExpanded = expandedLogId === log.id;
    setExpandedLogId(wasExpanded ? null : log.id);
    if (wasExpanded) return;
    if (isUnread(log)) {
      setOptimisticReads((prev) => new Set(prev).add(log.id));
      void markSchoolLogRead(log.id);
    }
  }

  // useCachedFetch ja roda useFocusEffect internamente (load + loadLogs).

  // Real-time entre coparentes: novos registros escolares aparecem na hora.
  useCollabRealtime({
    table: 'school_logs',
    groupId: activeGroup?.groupId,
    onChange: loadLogs,
    // school_log não tem chave i18n no useCollabRealtime ainda — refresh
    // silencioso é suficiente (Foundation Collab já manda push priority).
    myUserId: userId,
  });

  function openEditor(child: ChildSchool) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const e = child.education;
    setSchoolName(e?.school_name || '');
    setSchoolAddress(e?.school_address || '');
    setSchoolPhone(e?.school_phone || '');
    setGrade(e?.grade || '');
    setClassName(e?.class_name || '');
    setTeacherName(e?.teacher_name || '');
    setCoordinatorName(e?.coordinator_name || '');
    setEntryTime(displayTime(e?.entry_time || null));
    setExitTime(displayTime(e?.exit_time || null));
    setExtracurriculars((e?.extracurricular_activities || []).join(', '));
    setEditing(child);
  }

  async function handleSave() {
    if (!editing || !groupId) return;
    // Telefone: se preenchido, precisa ter dígitos de verdade (não só símbolos/
    // letras). Bug dias.m.augusto 2026-06-06: o form aceitava "(/))/((((NN((/)".
    if (schoolPhone.trim() && schoolPhone.replace(/\D/g, '').length < 8) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: t('school.phoneInvalid'), variant: 'error' });
      return;
    }
    const entryIso = entryTime ? `${entryTime}:00` : null;
    const exitIso = exitTime ? `${exitTime}:00` : null;
    const extras = extracurriculars.split(',').map(s => s.trim()).filter(Boolean);
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await upsertChildEducation({
      childId: editing.childId, groupId,
      school_name: schoolName.trim() || null,
      school_address: schoolAddress.trim() || null,
      school_phone: schoolPhone.trim() || null,
      grade: grade.trim() || null,
      class_name: className.trim() || null,
      teacher_name: teacherName.trim() || null,
      coordinator_name: coordinatorName.trim() || null,
      entry_time: entryIso,
      exit_time: exitIso,
      extracurricular_activities: extras.length > 0 ? extras : null,
    });
    setSaving(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(null);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  function resetLogForm(initialSubtype: SchoolLogType) {
    setLogChildId(childOptions[0]?.id ?? null);
    setLogSubtype(initialSubtype);
    setLogTitle('');
    setLogDescription('');
    setLogDate(todayIso());
    setLogEventTime('');
    setLogSubject('');
    setLogScore('');
    setLogPriority('info');
  }

  function openCreateLog() {
    if (childOptions.length === 0) {
      toast.show({ message: t('toasts.school.needChildFirst'), variant: 'info' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setComposer({ stage: 'pick-kind' });
  }

  function pickSubtype(subtype: SchoolLogType) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    resetLogForm(subtype);
    setComposer({ stage: 'form', subtype });
  }

  function closeComposer() {
    setComposer({ stage: 'closed' });
  }

  async function openEditLog(log: SchoolLog) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogChildId(log.child_id);
    setLogSubtype(log.log_type);
    setLogTitle(log.title);
    setLogDescription(log.description || '');
    setLogDate(log.log_date);
    setLogSubject(log.subject || '');
    setLogScore(log.score || '');
    setLogPriority(log.priority || 'info');
    // event_time lives only on the calendar mirror, fetch it for prefill.
    const eventTime = getKind(log.log_type) === 'event' ? await fetchSchoolLogEventTime(log.id) : null;
    setLogEventTime(eventTime ? eventTime.slice(0, 5) : '');
    setEditingLog(log);
  }

  async function handleSaveNewLog() {
    if (!groupId || !userId) return;
    if (!logTitle.trim()) {
      toast.show({ message: t('toasts.school.titleRequired'), variant: 'error' });
      return;
    }
    if (!logChildId) {
      toast.show({ message: t('toasts.school.childRequired'), variant: 'error' });
      return;
    }
    if (logSubtype === 'exam' && !logSubject.trim()) {
      toast.show({ message: t('toasts.school.subjectRequired'), variant: 'error' });
      return;
    }
    setSavingLog(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await createSchoolLog({
      groupId,
      childId: logChildId,
      subtype: logSubtype,
      title: logTitle,
      description: logDescription,
      logDate,
      eventTime: logEventTime || null,
      subject: logSubject || null,
      score: logScore || null,
      priority: logPriority,
    });
    setSavingLog(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      closeComposer();
      await loadLogs();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  async function handleSaveEditLog() {
    if (!editingLog) return;
    if (!logTitle.trim()) {
      toast.show({ message: t('toasts.school.titleRequired'), variant: 'error' });
      return;
    }
    if (!logChildId) {
      toast.show({ message: t('toasts.school.childRequired'), variant: 'error' });
      return;
    }
    if (logSubtype === 'exam' && !logSubject.trim()) {
      toast.show({ message: t('toasts.school.subjectRequired'), variant: 'error' });
      return;
    }
    setSavingLog(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await updateSchoolLog(editingLog.id, {
      title: logTitle,
      description: logDescription,
      subtype: logSubtype,
      childId: logChildId,
      logDate,
      eventTime: getKind(logSubtype) === 'event' ? (logEventTime || null) : null,
      subject: logSubtype === 'exam' ? logSubject : null,
      score: logSubtype === 'exam' ? (logScore || null) : null,
      priority: logPriority,
    });
    setSavingLog(false);
    if (res.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingLog(null);
      await loadLogs();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: res.error || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  async function handleDeleteLog(log: SchoolLog) {
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
              await loadLogs();
            } else {
              toast.show({ message: res.error || t('toasts.common.deleteFailed'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  async function handleToggleCompleted(log: SchoolLog) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Optimistic flip removido na migracao pra useCachedFetch (state vem
    // do helper, nao mais setLogs local). Re-fetch garante consistencia.
    const res = await toggleSchoolLogCompleted(log.id, log.completed);
    if (!res.success) {
      toast.show({ message: res.error || t('toasts.common.updateFailed'), variant: 'error' });
    }
    await loadLogs();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('schoolPage.headerTitle')} />

      <View style={{ flexDirection: 'row', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        <TabPill label={t('school.tabInfo')} active={tab === 'info'} onPress={() => setTab('info')} />
        {/* Registros tab shows total count and (em parênteses) the unread
            count when there are new ones — so user sees at a glance "8 (3 novos)". */}
        <TabPill
          label={(() => {
            const total = logs.length;
            const unread = logs.filter(isUnread).length;
            if (total === 0) return t('health.records');
            if (unread > 0) return unread === 1
              ? t('school.tabLogsCountUnreadOne', { total })
              : t('school.tabLogsCountUnread', { total, unread });
            return t('school.tabLogsCount', { total });
          })()}
          active={tab === 'logs'}
          onPress={() => setTab('logs')}
        />
      </View>

      {tab === 'info' ? (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.brand} />}>
          {loading && schools.length === 0 ? <SkeletonList count={3} /> : null}
          {schools.length === 0 && !loading ? <EmptyState icon="🏫" title={t('empty.escolaChildren.title')} /> : null}
          {schools.map(s => {
            const e = s.education;
            return (
              <TouchableOpacity
                key={s.childId}
                activeOpacity={0.8}
                onPress={() => openEditor(s)}
                accessibilityRole="button"
                accessibilityLabel={t('school.editInfoA11y', { name: s.childName })}
                style={{ backgroundColor: colors.bgElevated, borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.md, ...shadows.sm }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>{s.childName}</Text>
                  <Ionicons name="create-outline" size={18} color={colors.brand} />
                </View>
                {e?.school_name ? <Row icon="🏫" label={t('nav.school')} value={e.school_name} /> :
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, fontStyle: 'italic' }}>{t('school.tapToRegister')}</Text>}
                {e?.grade ? <Row icon="📚" label={t('school.rowGrade')} value={e.grade} /> : null}
                {e?.class_name ? <Row icon="🎒" label={t('children.className')} value={e.class_name} /> : null}
                {e?.teacher_name ? <Row icon="👩‍🏫" label={t('school.rowTeacher')} value={e.teacher_name} /> : null}
                {e?.coordinator_name ? <Row icon="🗂️" label={t('school.rowCoordinator')} value={e.coordinator_name} /> : null}
                {e?.entry_time ? <Row icon="🕐" label={t('school.rowSchedule')} value={`${displayTime(e.entry_time)} - ${displayTime(e.exit_time)}`} /> : null}
                {e?.school_address ? <Row icon="📍" label={t('health.address')} value={e.school_address} /> : null}
                {e?.school_phone ? <Row icon="📞" label={t('health.phone')} value={e.school_phone} /> : null}
                {e?.extracurricular_activities && e.extracurricular_activities.length > 0 ? (
                  <Row icon="⚽" label={t('school.rowExtras')} value={e.extracurricular_activities.join(', ')} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
            refreshControl={<RefreshControl refreshing={false} onRefresh={loadLogs} tintColor={colors.brand} />}>
            {/* Filter chips */}
            {logs.length > 0 ? (
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md }}>
                <Chip label={t('school.filterAll')} active={filterKind === 'all'} onPress={() => setFilterKind('all')} />
                <Chip label={t('school.filterEvents')} active={filterKind === 'event'} onPress={() => setFilterKind('event')} />
                <Chip label={t('school.filterNotes')} active={filterKind === 'note'} onPress={() => setFilterKind('note')} />
              </View>
            ) : null}

            {logsLoading && logs.length === 0 ? (
              <View style={{ marginTop: spacing.lg }}>
                <SkeletonList count={4} />
              </View>
            ) : logs.length === 0 ? (
              <EmptyState
                icon="📚"
                title={t('empty.escolaLogs.title')}
                description={t('empty.escolaLogs.description')}
              />
            ) : (
              logs
                .filter(l => filterKind === 'all' || getKind(l.log_type) === filterKind)
                // Sort: data da atividade DESC (chronológico, mais recente primeiro)
                // → priority DESC → unread first (tiebreaks dentro do mesmo dia).
                //
                // Bug Barata 2026-05-14: sort anterior era "unread first → priority
                // → date" e parecia bagunçado pro user porque scrambla a ordem
                // chronológica. Os chips "Novo" + borda colorida já destacam o
                // status; reordenar por isso confunde a expectativa "ordenado por
                // data da atividade pra fazer sentido".
                .slice()
                .sort((a, b) => {
                  const dateCmp = b.log_date.localeCompare(a.log_date);
                  if (dateCmp !== 0) return dateCmp;
                  const pa = PRIORITY_META[a.priority]?.rank ?? 0;
                  const pb = PRIORITY_META[b.priority]?.rank ?? 0;
                  if (pa !== pb) return pb - pa;
                  const ua = isUnread(a) ? 1 : 0;
                  const ub = isUnread(b) ? 1 : 0;
                  return ub - ua;
                })
                .map((log) => {
                const isHomework = log.log_type === 'homework';
                const isEvent = getKind(log.log_type) === 'event';
                const isHighlighted = highlight && log.id === highlight;
                const unread = isUnread(log);
                const expanded = expandedLogId === log.id;
                const priorityMeta = PRIORITY_META[log.priority] || PRIORITY_META.info;
                const readers = coparentReaders(log);

                return (
                  <TouchableOpacity
                    key={log.id}
                    activeOpacity={0.85}
                    onPress={() => handleOpenCard(log)}
                    accessibilityRole="button"
                    accessibilityLabel={`${log.title}. ${TYPE_LABELS[log.log_type]}${log.child_full_name ? t('school.cardA11yOfChild', { child: log.child_full_name }) : ''}${unread ? `. ${t('collab.new')}` : ''}`}
                    accessibilityState={{ expanded, selected: unread }}
                    style={{
                      backgroundColor: unread ? 'rgba(192,112,85,0.06)' : colors.bgElevated,
                      borderRadius: radius.xl,
                      padding: spacing.lg,
                      marginBottom: spacing.sm,
                      opacity: log.completed ? 0.6 : 1,
                      borderLeftWidth: 4,
                      borderLeftColor: unread
                        ? colors.brand
                        : log.priority === 'urgent'
                          ? '#EF4444'
                          : log.priority === 'important'
                            ? '#F59E0B'
                            : 'transparent',
                      borderWidth: isHighlighted ? 2 : 0,
                      borderColor: isHighlighted ? colors.brand : 'transparent',
                      ...shadows.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                      {isHomework ? (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); handleToggleCompleted(log); }}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: log.completed }}
                          accessibilityLabel={log.completed ? t('school.uncheckA11y', { title: log.title }) : t('school.checkA11y', { title: log.title })}
                          hitSlop={8}
                          style={{ marginTop: 2 }}
                        >
                          <View
                            style={{
                              width: 22, height: 22, borderRadius: 6,
                              borderWidth: 2,
                              borderColor: log.completed ? colors.brand : colors.borderLight,
                              backgroundColor: log.completed ? colors.brand : 'transparent',
                              alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            {log.completed ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                          </View>
                        </TouchableOpacity>
                      ) : null}

                      <Text style={{ fontSize: 22 }}>{TYPE_ICONS[log.log_type]}</Text>

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
                            <Text
                              style={{
                                fontSize: font.sizes.md,
                                fontWeight: font.weights.semibold,
                                color: colors.text,
                                textDecorationLine: log.completed ? 'line-through' : 'none',
                              }}
                              numberOfLines={2}
                            >
                              {log.title}
                            </Text>
                            {unread ? (
                              <View style={{ backgroundColor: colors.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{t('collab.new')}</Text>
                              </View>
                            ) : null}
                            {log.priority !== 'info' ? (
                              <View style={{ backgroundColor: priorityMeta.chipBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
                                <Text style={{ color: priorityMeta.chipText, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
                                  {t(`collab.priority${log.priority.charAt(0).toUpperCase() + log.priority.slice(1)}`)}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginLeft: spacing.sm }}>
                            {formatLogDate(log.log_date)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                          {TYPE_LABELS[log.log_type]}
                          {log.subject ? ` · ${log.subject}` : ''}
                          {log.child_full_name ? ` · ${log.child_full_name}` : ''}
                          {isEvent ? ' · 📅' : ''}
                        </Text>
                        {log.score ? (
                          <Text style={{ fontSize: font.sizes.sm, color: colors.brand, fontWeight: font.weights.semibold, marginTop: 4 }}>
                            {t('school.scoreLabel', { score: log.score })}
                          </Text>
                        ) : null}
                        {log.description ? (
                          <Text
                            style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.xs }}
                            numberOfLines={expanded ? undefined : 2}
                          >
                            {log.description}
                          </Text>
                        ) : null}
                        {log.logged_by_name ? (
                          <Text style={{ fontSize: font.sizes.xs, color: colors.textDim, marginTop: 4 }}>
                            {t('schoolPage.by')} {log.logged_by_name}
                          </Text>
                        ) : null}

                        {/* Read receipts — only when expanded, only when coparent has read */}
                        {expanded && readers.length > 0 ? (
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs, columnGap: spacing.md, rowGap: 2 }}>
                            {readers.map((r) => (
                              <Text key={r.user_id} style={{ fontSize: 11, color: colors.brand }}>
                                ✓ {t('collab.seen')} · {formatReadAt(r.read_at)}
                              </Text>
                            ))}
                          </View>
                        ) : null}

                        {/* Edit/Delete only visible when expanded — keeps the
                            collapsed card clean and reduces accidental taps. */}
                        {expanded ? (
                          <View
                            style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm }}
                            onStartShouldSetResponder={() => true}
                          >
                            <TouchableOpacity
                              onPress={(e) => { e.stopPropagation(); openEditLog(log); }}
                              accessibilityRole="button"
                              accessibilityLabel={t('school.editLogA11y', { title: log.title })}
                              hitSlop={8}
                            >
                              <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                                {t('common.edit')}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={(e) => { e.stopPropagation(); handleDeleteLog(log); }}
                              accessibilityRole="button"
                              accessibilityLabel={t('school.deleteLogA11y', { title: log.title })}
                              hitSlop={8}
                            >
                              <Text style={{ fontSize: font.sizes.xs, color: colors.error, fontWeight: font.weights.medium }}>
                                {t('common.delete')}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <TouchableOpacity
            onPress={openCreateLog}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('school.newLog')}
            style={{
              position: 'absolute',
              bottom: spacing['3xl'],
              right: spacing.xl,
              backgroundColor: colors.brand,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radius.full,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
              ...shadows.md,
            }}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: font.weights.semibold, fontSize: font.sizes.md }}>
              {t('school.newLog')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Editor de Informacoes (child_education) */}
      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <ModalBackdrop onClose={() => setEditing(null)} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '90%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              {t('school.editTitle', { name: editing?.childName ?? '' })}
            </Text>
            <ScrollView style={{ flexShrink: 1 }}>
              <Label>{t('children.schoolName')}</Label>
              <Input value={schoolName} onChangeText={setSchoolName} placeholder={t('children.schoolNamePlaceholder')} />

              <Label>{t('children.grade')}</Label>
              <Input value={grade} onChangeText={setGrade} placeholder={t('children.gradePlaceholder')} />

              <Label>{t('children.className')}</Label>
              <Input value={className} onChangeText={setClassName} placeholder={t('children.classNamePlaceholder')} />

              <Label>{t('children.teacherName')}</Label>
              <Input value={teacherName} onChangeText={setTeacherName} placeholder={t('children.teacherNamePlaceholder')} />

              <Label>{t('children.coordinatorName')}</Label>
              <Input value={coordinatorName} onChangeText={setCoordinatorName} placeholder={t('children.coordinatorNamePlaceholder')} />

              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TimePickerField label={t('school.entryShort')} value={entryTime || null} onChange={setEntryTime} placeholder="07:30" />
                </View>
                <View style={{ flex: 1 }}>
                  <TimePickerField label={t('school.exitShort')} value={exitTime || null} onChange={setExitTime} placeholder="12:00" />
                </View>
              </View>

              <Label>{t('health.address')}</Label>
              <Input value={schoolAddress} onChangeText={setSchoolAddress} placeholder={t('children.schoolAddressPlaceholder')} />

              <Label>{t('health.phone')}</Label>
              <Input value={schoolPhone} onChangeText={(text) => setSchoolPhone(text.replace(/[^\d\s()+\-]/g, ''))} placeholder="(11) 99999-9999" keyboardType="phone-pad" maxLength={20} />

              <Label>{t('school.extrasLabel')}</Label>
              <Input value={extracurriculars} onChangeText={setExtracurriculars} placeholder={t('children.extracurricularPlaceholder')} />

              <View style={{ marginTop: spacing.md }}>
                <PrimaryButton
                  label={t('common.save')}
                  onPress={handleSave}
                  loading={saving}
                  testID="escola-save-info"
                />
              </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Composer 3-stage: pick-kind → pick-subtype → form */}
      <Modal
        visible={composer.stage !== 'closed'}
        animationType="slide"
        transparent
        onRequestClose={closeComposer}
      >
        <ModalBackdrop onClose={closeComposer} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />

            {composer.stage === 'pick-kind' ? (
              <>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.lg }}>
                  {t('schoolPage.client.composerWhatRegister')}
                </Text>
                <KindCard
                  emoji="📅"
                  title={t('newForm.catEvent')}
                  description={t('school.kindEventDesc')}
                  example={t('school.kindEventExample')}
                  accentBg={`${colors.secondary}10`}
                  accentBorder={`${colors.secondary}40`}
                  onPress={() => setComposer({ stage: 'pick-subtype', kind: 'event' })}
                />
                <View style={{ height: spacing.sm }} />
                <KindCard
                  emoji="📝"
                  title={t('school.kindNote')}
                  description={t('school.kindNoteDesc')}
                  example={t('school.kindNoteExample')}
                  accentBg={`${colors.brand}10`}
                  accentBorder={`${colors.brand}40`}
                  onPress={() => setComposer({ stage: 'pick-subtype', kind: 'note' })}
                />
              </>
            ) : null}

            {composer.stage === 'pick-subtype' ? (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <TouchableOpacity
                    onPress={() => setComposer({ stage: 'pick-kind' })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: colors.secondary, fontWeight: font.weights.medium }}>{`‹ ${t('common.back')}`}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                    {composer.kind === 'event' ? t('school.headerEvent') : t('school.headerNote')}
                  </Text>
                  <View style={{ width: 60 }} />
                </View>
                <ScrollView style={{ maxHeight: 460 }}>
                  {(composer.kind === 'event' ? EVENT_SUBTYPES : NOTE_SUBTYPES).map((s) => (
                    <SubtypeRow
                      key={s}
                      icon={SUBTYPE_ICON[s]}
                      label={SUBTYPE_LABEL[s]}
                      hint={SUBTYPE_HINT[s]}
                      onPress={() => pickSubtype(s)}
                    />
                  ))}
                  {composer.kind === 'event' ? (
                    <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.secondary}08`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.secondary}30` }}>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                        {t('schoolPage.client.composerEventsAutoCalendar')}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : null}

            {composer.stage === 'form' ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
                  <TouchableOpacity
                    onPress={() => setComposer({ stage: 'pick-subtype', kind: getKind(composer.subtype) })}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.back')}
                  >
                    <Text style={{ fontSize: font.sizes.sm, color: colors.secondary, fontWeight: font.weights.medium }}>{`‹ ${t('common.back')}`}</Text>
                  </TouchableOpacity>
                  <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                    {SUBTYPE_ICON[composer.subtype]} {SUBTYPE_LABEL[composer.subtype]}
                  </Text>
                  <View style={{ width: 60 }} />
                </View>

                <Label>{t('schoolPage.client.childLabel')}</Label>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                  {childOptions.map((c) => (
                    <Chip key={c.id} label={c.short_name} active={logChildId === c.id} onPress={() => setLogChildId(c.id)} />
                  ))}
                </View>

                {composer.subtype === 'exam' ? (
                  <>
                    <Label>{t('schoolPage.client.subjectLabel')}</Label>
                    <Input value={logSubject} onChangeText={setLogSubject} placeholder={t('schoolPage.client.subjectPlaceholder')} />
                  </>
                ) : null}

                <Label>{composer.subtype === 'exam' ? t('school.contentLabel') : t('school.titleLabel')}</Label>
                <Input
                  value={logTitle}
                  onChangeText={setLogTitle}
                  placeholder={composer.subtype === 'exam' ? t('school.contentPlaceholder') : t('school.titlePlaceholderDynamic', { label: SUBTYPE_LABEL[composer.subtype] })}
                />

                <Label>{t('newForm.date')}</Label>
                <DatePickerField value={logDate} onChange={(d) => setLogDate(d || todayIso())} />

                {getKind(composer.subtype) === 'event' ? (
                  <>
                    <Label>{t('schoolPage.client.timeOptional')}</Label>
                    <TimePickerField value={logEventTime || null} onChange={(tv) => setLogEventTime(tv || '')} />
                  </>
                ) : null}

                {composer.subtype === 'exam' ? (
                  <>
                    <Label>{t('schoolPage.client.gradeOptional')}</Label>
                    <Input value={logScore} onChangeText={setLogScore} placeholder={t('school.scorePlaceholder')} />
                  </>
                ) : null}

                <Label>{t('schoolPage.client.noteOptional')}</Label>
                <Input
                  value={logDescription}
                  onChangeText={setLogDescription}
                  placeholder={t('newForm.additionalDetails')}
                  multiline
                />

                <Label>{t('collab.priorityLabel')}</Label>
                <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
                  {(['info', 'important', 'urgent'] as const).map((p) => (
                    <Chip
                      key={p}
                      label={t(`collab.priority${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                      active={logPriority === p}
                      onPress={() => setLogPriority(p)}
                    />
                  ))}
                </View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: spacing.sm }}>
                  {t('collab.priorityUrgentHint')}
                </Text>

                {getKind(composer.subtype) === 'event' ? (
                  <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.secondary}08`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.secondary}30` }}>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                      {t('schoolPage.client.eventAutoCalendar')}
                    </Text>
                  </View>
                ) : null}

                <View style={{ marginTop: spacing.lg }}>
                  <PrimaryButton
                    label={t('schoolPage.register')}
                    onPress={handleSaveNewLog}
                    loading={savingLog}
                    testID="escola-save-new-log"
                  />
                </View>
              </ScrollView>
            ) : null}
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Editar registro existente — todos os campos editáveis. Mudar
          subtype entre kind=event/note recria/remove o espelho do calendário. */}
      <Modal visible={!!editingLog} animationType="slide" transparent onRequestClose={() => setEditingLog(null)}>
        <ModalBackdrop onClose={() => setEditingLog(null)} align="bottom" dim={0.4} padding={0}>
          <View style={{ backgroundColor: colors.bgElevated, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: 40, maxHeight: '92%' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              {SUBTYPE_ICON[logSubtype]} {t('school.editLogTitle', { label: SUBTYPE_LABEL[logSubtype].toLowerCase() })}
            </Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Label>{t('schoolPage.client.typeLabel')}</Label>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs, paddingVertical: 2 }}>
                {[...EVENT_SUBTYPES, ...NOTE_SUBTYPES].map((s) => (
                  <Chip
                    key={s}
                    label={`${SUBTYPE_ICON[s]} ${SUBTYPE_LABEL[s]}`}
                    active={logSubtype === s}
                    onPress={() => setLogSubtype(s)}
                  />
                ))}
              </ScrollView>

              <Label>{t('schoolPage.client.childLabel')}</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm }}>
                {childOptions.map((c) => (
                  <Chip key={c.id} label={c.short_name} active={logChildId === c.id} onPress={() => setLogChildId(c.id)} />
                ))}
              </View>

              {logSubtype === 'exam' ? (
                <>
                  <Label>{t('schoolPage.client.subjectLabel')}</Label>
                  <Input value={logSubject} onChangeText={setLogSubject} placeholder={t('schoolPage.client.subjectPlaceholder')} />
                </>
              ) : null}

              <Label>{logSubtype === 'exam' ? t('school.contentLabel') : t('school.titleLabel')}</Label>
              <Input
                value={logTitle}
                onChangeText={setLogTitle}
                placeholder={logSubtype === 'exam' ? t('school.contentPlaceholder') : t('school.titlePlaceholderDynamic', { label: SUBTYPE_LABEL[logSubtype] })}
              />

              <Label>{t('newForm.date')}</Label>
              <DatePickerField value={logDate} onChange={(d) => setLogDate(d || todayIso())} />

              {getKind(logSubtype) === 'event' ? (
                <>
                  <Label>{t('schoolPage.client.timeOptional')}</Label>
                  <TimePickerField value={logEventTime || null} onChange={(tv) => setLogEventTime(tv || '')} />
                </>
              ) : null}

              {logSubtype === 'exam' ? (
                <>
                  <Label>{t('school.scoreOptionalShort')}</Label>
                  <Input value={logScore} onChangeText={setLogScore} placeholder={t('school.scorePlaceholder')} />
                </>
              ) : null}

              <Label>{t('schoolPage.client.noteOptional')}</Label>
              <Input value={logDescription} onChangeText={setLogDescription} placeholder={t('newForm.additionalDetails')} multiline />

              <Label>{t('collab.priorityLabel')}</Label>
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm }}>
                {(['info', 'important', 'urgent'] as const).map((p) => (
                  <Chip
                    key={p}
                    label={t(`collab.priority${p.charAt(0).toUpperCase() + p.slice(1)}`)}
                    active={logPriority === p}
                    onPress={() => setLogPriority(p)}
                  />
                ))}
              </View>

              {getKind(logSubtype) === 'event' ? (
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.secondary}08`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.secondary}30` }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.secondary, fontWeight: font.weights.medium }}>
                    {t('school.appearsInCalendarOn', { date: (() => {
                      try { return intl.formatDate(logDate); } catch { return logDate; }
                    })() })}
                  </Text>
                </View>
              ) : editingLog && getKind(editingLog.log_type) === 'event' ? (
                <View style={{ marginTop: spacing.md, padding: spacing.md, backgroundColor: `${colors.warning}10`, borderRadius: radius.md, borderWidth: 1, borderColor: `${colors.warning}40` }}>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.warning, fontWeight: font.weights.medium }}>
                    {t('schoolPage.client.editRemovedFromCalendar')}
                  </Text>
                </View>
              ) : null}

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton
                  label={t('common.save')}
                  onPress={handleSaveEditLog}
                  loading={savingLog}
                  testID="escola-save-edit-log"
                />
              </View>
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}

function TabPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.sm,
        borderRadius: radius.full,
        backgroundColor: active ? colors.brand : colors.bgElevated,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.borderLight,
      }}
    >
      <Text
        style={{
          color: active ? '#fff' : colors.text,
          fontWeight: font.weights.semibold,
          fontSize: font.sizes.sm,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs + 2,
        borderRadius: radius.full,
        backgroundColor: active ? colors.brand : colors.bgSurface,
        borderWidth: 1,
        borderColor: active ? colors.brand : colors.borderLight,
      }}
    >
      <Text
        style={{
          color: active ? '#fff' : colors.text,
          fontSize: font.sizes.xs,
          fontWeight: font.weights.medium,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
      <Text style={{ fontSize: 14 }}>{icon}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.textMuted, width: 90 }}>{label}</Text>
      <Text style={{ fontSize: font.sizes.sm, color: colors.text, fontWeight: font.weights.medium, flex: 1 }}>{value}</Text>
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4, marginTop: spacing.sm, fontWeight: font.weights.medium }}>{children}</Text>;
}

function KindCard({
  emoji, title, description, example, accentBg, accentBorder, onPress,
}: {
  emoji: string; title: string; description: string; example: string;
  accentBg: string; accentBorder: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      style={{
        backgroundColor: accentBg,
        borderColor: accentBorder,
        borderWidth: 1.5,
        borderRadius: radius.lg,
        padding: spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <Text style={{ fontSize: 36 }}>{emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>{title}</Text>
        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>{description}</Text>
        <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontStyle: 'italic', marginTop: 4 }}>{example}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function SubtypeRow({
  icon, label, hint, onPress,
}: { icon: string; label: string; hint?: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.md,
        backgroundColor: colors.bgSurface,
        borderRadius: radius.md,
        marginBottom: spacing.xs,
      }}
    >
      <Text style={{ fontSize: 26 }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>{label}</Text>
        {hint ? <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.textMuted}
      style={{
        backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight,
        paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
        fontSize: font.sizes.md, color: colors.text,
        minHeight: 44,
      }}
    />
  );
}
