/**
 * TabTamanhos (Native) — paridade do PWA TabTamanhos.tsx.
 *
 * Foundation Collab #7 (migration 00086). UX:
 *  - Glanceability first: card "Tamanhos" com valor + freshness badge.
 *  - Tap-to-edit em qualquer linha (modal mini).
 *  - Empty rows ("—") tappable pra primeiro registro.
 *  - Check-in passivo: banner "Ainda usa X?" pra entries staled.
 *  - Histórico expansível, edit/delete inline.
 *  - kind='other' com custom_label livre (Pijama, Vestido, etc.).
 *
 * Strings via i18n (childSizes.*). Pattern espelha TabSaude/TabDocumentos.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  fetchSizes, recordSize, updateSize, deleteSize,
  type CurrentSize, type ChildSizeRecord, type SizeKind,
} from 'src/services/child-sizes';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { reportError } from 'src/lib/error-reporter';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Props {
  childId: string;
  groupId: string;
}

const PRIMARY_KINDS: readonly SizeKind[] = ['shoe', 'pants', 'shirt', 'coat'];

const STALE_DAYS: Record<SizeKind, number> = {
  shoe: 150,
  pants: 240,
  shirt: 240,
  coat: 365,
  other: 240,
};

function kindIcon(kind: SizeKind): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'shoe': return 'footsteps-outline';
    case 'pants': return 'shirt-outline'; // closest icon
    case 'shirt': return 'shirt';
    case 'coat': return 'snow-outline';
    case 'other': return 'pricetag-outline';
  }
}

function freshnessColor(daysSince: number, kind: SizeKind): string {
  const stale = STALE_DAYS[kind];
  if (daysSince <= 30) return '#10B981'; // emerald
  if (daysSince <= stale) return '#6B7280'; // gray
  return '#D97706'; // amber-700
}

function freshnessBg(daysSince: number, kind: SizeKind): string {
  const stale = STALE_DAYS[kind];
  if (daysSince <= 30) return '#D1FAE5'; // emerald-100
  if (daysSince <= stale) return '#F3F4F6'; // gray-100
  return '#FEF3C7'; // amber-100
}

interface EditModalState {
  mode: 'create' | 'edit';
  kind: SizeKind;
  customLabel: string | null;
  sizeId?: string;
  sizeValue: string;
  recordedOn: string;
  notes: string;
  /** Erro inline persistente até user editar/recancelar — não some como toast.
   *  Bug Henrique 2026-05-19: toast efêmero deixava o user achando que "nada
   *  aconteceu" sem feedback claro do motivo. */
  error: string | null;
}

export default function TabTamanhos({ childId, groupId }: Props) {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentSizes, setCurrentSizes] = useState<CurrentSize[]>([]);
  const [history, setHistory] = useState<ChildSizeRecord[]>([]);
  const [modal, setModal] = useState<EditModalState | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchSizes(childId);
    setCurrentSizes(r.currentSizes);
    setHistory(r.history);
    setLoading(false);
  }, [childId]);

  useEffect(() => { load(); }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  function freshnessLabel(daysSince: number): string {
    if (daysSince === 0) return t('childSizes.recordedToday');
    if (daysSince === 1) return t('childSizes.recordedYesterday');
    if (daysSince < 30) return t('childSizes.recordedDaysAgo', { count: daysSince });
    if (daysSince < 60) return t('childSizes.recordedMonthAgo');
    const months = Math.floor(daysSince / 30);
    if (months < 12) return t('childSizes.recordedMonthsAgo', { count: months });
    const years = Math.floor(daysSince / 365);
    return years === 1
      ? t('childSizes.recordedYearAgo')
      : t('childSizes.recordedYearsAgo', { count: years });
  }

  function kindLabel(kind: SizeKind, customLabel: string | null): string {
    if (kind === 'other') return customLabel || t('childSizes.kind.other');
    return t(`childSizes.kind.${kind}`);
  }

  // Indexar atuais por key
  const currentByKey = new Map<string, CurrentSize>();
  for (const s of currentSizes) {
    const key = s.kind === 'other' ? `other:${s.custom_label || ''}` : s.kind;
    currentByKey.set(key, s);
  }
  const otherRows = currentSizes.filter(s => s.kind === 'other');

  // Check-in passivo
  const staleCheckin = currentSizes.find(s => s.days_since_recorded > STALE_DAYS[s.kind]) || null;

  function openCreateModal(kind: SizeKind) {
    setModal({
      mode: 'create',
      kind,
      customLabel: null,
      sizeValue: '',
      recordedOn: new Date().toISOString().slice(0, 10),
      notes: '',
      error: null,
    });
  }
  function openEditModal(s: CurrentSize | ChildSizeRecord) {
    setModal({
      mode: 'edit',
      kind: s.kind,
      customLabel: s.custom_label,
      sizeId: 'size_id' in s ? s.size_id : s.id,
      sizeValue: s.size_value,
      recordedOn: 'recorded_on' in s ? s.recorded_on : new Date().toISOString().slice(0, 10),
      notes: 'notes' in s ? (s.notes ?? '') : '',
      error: null,
    });
  }
  function closeModal() {
    if (busy) return; // não fecha durante save em curso
    setModal(null);
  }
  // Helper pra atualizar modal sem perder error/state intacto. Limpa erro
  // automaticamente quando user altera algum campo (sinal de retry).
  function updateModal(patch: Partial<EditModalState>) {
    setModal((m) => (m ? { ...m, ...patch, error: patch.error ?? null } : null));
  }

  async function handleSubmitModal() {
    if (!modal) return;
    // Validação inline: erro fica VISÍVEL no banner até user corrigir.
    if (!modal.sizeValue.trim()) {
      updateModal({ error: t('childSizes.errorSizeRequired') });
      return;
    }
    if (modal.kind === 'other' && !modal.customLabel?.trim()) {
      updateModal({ error: t('childSizes.errorCustomLabelRequired') });
      return;
    }
    // Sanity check de data — sem validar aqui, server rejeita com 400
    // genérico ("Dados inválidos"). Antecipa pra UX clara.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(modal.recordedOn)) {
      updateModal({ error: t('childSizes.errorDateInvalid') });
      return;
    }
    setBusy(true);
    updateModal({ error: null }); // limpa erro anterior ao iniciar nova tentativa
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Telemetria pré-call (severity=info) — se algo der errado, temos contexto.
    reportError(new Error(`[child-sizes] save.start ${Date.now()}`), {
      severity: 'info',
      filePath: 'app/_src/components/criancas/TabTamanhos.tsx',
      metadata: {
        event: 'child_size_save_start',
        mode: modal.mode,
        kind: modal.kind,
        childId,
        groupId,
        sizeValueLen: modal.sizeValue.length,
      },
    });

    let r: { success: boolean; error?: string };
    try {
      if (modal.mode === 'create') {
        r = await recordSize({
          childId, groupId,
          kind: modal.kind,
          customLabel: modal.kind === 'other' ? modal.customLabel : null,
          sizeValue: modal.sizeValue,
          recordedOn: modal.recordedOn,
          notes: modal.notes || null,
        });
      } else if (modal.sizeId) {
        r = await updateSize({
          childId,
          sizeId: modal.sizeId,
          sizeValue: modal.sizeValue,
          recordedOn: modal.recordedOn,
          notes: modal.notes || null,
          customLabel: modal.kind === 'other' ? modal.customLabel : undefined,
        });
      } else {
        r = { success: false, error: 'missing sizeId' };
      }
    } catch (e) {
      // Exception durante fetch (network down, fingerprint, etc) — não
      // deixa engulir silencioso.
      r = { success: false, error: e instanceof Error ? e.message : 'erro inesperado' };
    }
    setBusy(false);

    // Telemetria pós-call — sucesso ou falha.
    reportError(new Error(`[child-sizes] save.result ${Date.now()}`), {
      severity: 'info',
      filePath: 'app/_src/components/criancas/TabTamanhos.tsx',
      metadata: {
        event: r.success ? 'child_size_save_success' : 'child_size_save_failure',
        mode: modal.mode,
        kind: modal.kind,
        errorMessage: r.error || null,
      },
    });

    if (r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({
        message: modal.mode === 'create'
          ? t('childSizes.toastSaved')
          : t('childSizes.toastUpdated'),
        variant: 'success',
      });
      setModal(null);
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Erro fica no banner inline (persistente) — sem dependência de toast.
      updateModal({ error: r.error || t('toasts.common.saveFailed') });
    }
  }

  async function handleConfirmStaleSize(s: CurrentSize) {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const r = await recordSize({
      childId, groupId,
      kind: s.kind,
      customLabel: s.kind === 'other' ? s.custom_label : null,
      sizeValue: s.size_value,
      isConfirmation: true,
    });
    setBusy(false);
    if (r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    }
  }

  function handleDelete(sizeId: string) {
    Alert.alert(
      t('childSizes.confirmDelete'),
      '',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('childSizes.delete'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const r = await deleteSize({ childId, sizeId });
            setBusy(false);
            if (r.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setModal(null);
              await load();
            } else {
              toast.show({ message: r.error || t('toasts.common.saveFailed'), variant: 'error' });
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
    >
      {/* Check-in passivo */}
      {staleCheckin ? (
        <View style={{
          backgroundColor: '#FEF3C7', borderColor: '#FDE68A', borderWidth: 1,
          borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg,
          flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
        }}>
          <Ionicons name="time-outline" size={20} color="#D97706" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: font.sizes.sm, color: '#78350F', fontWeight: font.weights.semibold }}>
              {t('childSizes.staleCheckinTitle', {
                kind: kindLabel(staleCheckin.kind, staleCheckin.custom_label),
                size: staleCheckin.size_value,
              })}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: '#92400E', marginTop: 2 }}>
              {freshnessLabel(staleCheckin.days_since_recorded)}
            </Text>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <TouchableOpacity
                onPress={() => handleConfirmStaleSize(staleCheckin)}
                disabled={busy}
                style={{
                  paddingVertical: 6, paddingHorizontal: spacing.md,
                  backgroundColor: '#D97706', borderRadius: radius.md,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
                  {t('childSizes.confirmStill')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openEditModal(staleCheckin)}
                disabled={busy}
                style={{
                  paddingVertical: 6, paddingHorizontal: spacing.md,
                  backgroundColor: '#fff', borderWidth: 1, borderColor: '#FCD34D', borderRadius: radius.md,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#78350F', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
                  {t('childSizes.updateNow')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      {/* Card: Tamanhos atuais */}
      <View style={{
        backgroundColor: colors.bgElevated, borderRadius: radius.xl,
        ...shadows.sm, marginBottom: spacing.lg,
      }}>
        <View style={{
          padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
        }}>
          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
            {t('childSizes.currentTitle')}
          </Text>
          <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
            {t('childSizes.currentSubtitle')}
          </Text>
        </View>
        {PRIMARY_KINDS.map((kind) => {
          const current = currentByKey.get(kind);
          return (
            <TouchableOpacity
              key={kind}
              onPress={() => current ? openEditModal(current) : openCreateModal(kind)}
              activeOpacity={0.7}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.md,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
              }}
            >
              <Ionicons name={kindIcon(kind)} size={22} color={colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text }}>
                  {t(`childSizes.kind.${kind}`)}
                </Text>
                {current ? (
                  current.creator_first_name ? (
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                      {t('childSizes.byParent', { parent: current.creator_first_name })}
                    </Text>
                  ) : null
                ) : (
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {t('childSizes.tapToRegister')}
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                  {current ? current.size_value : '—'}
                </Text>
                {current ? (
                  <View style={{
                    backgroundColor: freshnessBg(current.days_since_recorded, kind),
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full,
                  }}>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: font.weights.medium,
                      color: freshnessColor(current.days_since_recorded, kind),
                    }}>
                      {freshnessLabel(current.days_since_recorded)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })}
        {/* Outros (custom_label distintos) */}
        {otherRows.map((s) => (
          <TouchableOpacity
            key={`other-${s.custom_label}-${s.size_id}`}
            onPress={() => openEditModal(s)}
            activeOpacity={0.7}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.md,
              paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
              borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
            }}
          >
            <Ionicons name={kindIcon('other')} size={22} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, textTransform: 'capitalize' }}>
                {s.custom_label}
              </Text>
              {s.creator_first_name ? (
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                  {t('childSizes.byParent', { parent: s.creator_first_name })}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                {s.size_value}
              </Text>
              <View style={{
                backgroundColor: freshnessBg(s.days_since_recorded, 'other'),
                paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full,
              }}>
                <Text style={{
                  fontSize: 10,
                  fontWeight: font.weights.medium,
                  color: freshnessColor(s.days_since_recorded, 'other'),
                }}>
                  {freshnessLabel(s.days_since_recorded)}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          padding: spacing.lg,
        }}>
          <TouchableOpacity onPress={() => openCreateModal('other')}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold }}>
              + {t('childSizes.addOther')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowHistory(s => !s)}>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium }}>
              {showHistory ? t('childSizes.hideHistory') : t('childSizes.showHistory')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Histórico */}
      {showHistory ? (
        <View style={{
          backgroundColor: colors.bgElevated, borderRadius: radius.xl, ...shadows.sm,
        }}>
          <View style={{ padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
              {t('childSizes.historyTitle')}
            </Text>
            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
              {t('childSizes.historySubtitle', { count: history.length })}
            </Text>
          </View>
          {history.length === 0 ? (
            <Text style={{ padding: spacing.xl, fontSize: font.sizes.sm, color: colors.textMuted, textAlign: 'center' }}>
              {t('childSizes.historyEmpty')}
            </Text>
          ) : (
            history.map((row) => (
              <View key={row.id} style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
                paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
                borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
              }}>
                <Ionicons name={kindIcon(row.kind)} size={18} color={colors.textSecondary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.sm, fontWeight: font.weights.semibold, color: colors.text, textTransform: 'capitalize' }}>
                    {kindLabel(row.kind, row.custom_label)}
                    {row.is_confirmation ? (
                      <Text style={{ color: colors.textMuted, fontWeight: font.weights.medium }}>
                        {' · '}{t('childSizes.confirmedSuffix')}
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }} numberOfLines={1}>
                    {row.recorded_on.split('-').reverse().join('/')}
                    {row.creator_first_name ? ` · ${row.creator_first_name}` : ''}
                    {row.notes ? ` · ${row.notes}` : ''}
                  </Text>
                </View>
                <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.bold, color: colors.text }}>
                  {row.size_value}
                </Text>
                <TouchableOpacity onPress={() => openEditModal(row)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="create-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(row.id)} hitSlop={8} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      ) : null}

      {/* Modal de Create/Edit */}
      <Modal visible={!!modal} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, backgroundColor: colors.bg }}
        >
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: spacing.md,
            padding: spacing.lg, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
          }}>
            <Ionicons name={modal ? kindIcon(modal.kind) : 'pricetag-outline'} size={22} color={colors.text} />
            <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
              {modal
                ? (modal.mode === 'create'
                    ? t('childSizes.modalCreateTitle', { kind: kindLabel(modal.kind, modal.customLabel) })
                    : t('childSizes.modalEditTitle', { kind: kindLabel(modal.kind, modal.customLabel) }))
                : ''}
            </Text>
            <TouchableOpacity onPress={closeModal} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          {modal ? (
            <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
              {/* Banner de erro inline — persiste até user retentar/corrigir.
                  Não some como toast (bug Henrique 2026-05-19). */}
              {modal.error ? (
                <View
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{
                    backgroundColor: '#FEE2E2',
                    borderColor: '#FCA5A5',
                    borderWidth: 1,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    gap: spacing.sm,
                  }}
                >
                  <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                  <Text style={{ flex: 1, color: '#7F1D1D', fontSize: font.sizes.sm, lineHeight: 18 }}>
                    {modal.error}
                  </Text>
                </View>
              ) : null}
              {modal.kind === 'other' ? (
                <View>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 6 }}>
                    {t('childSizes.fieldCustomLabel')}
                  </Text>
                  <TextInput
                    value={modal.customLabel ?? ''}
                    onChangeText={(v) => updateModal({ customLabel: v })}
                    placeholder={t('childSizes.fieldCustomLabelPlaceholder')}
                    placeholderTextColor={colors.textMuted}
                    maxLength={40}
                    style={{
                      backgroundColor: colors.bgElevated, borderRadius: radius.md,
                      borderWidth: 1, borderColor: colors.borderLight,
                      paddingHorizontal: spacing.md, paddingVertical: 10,
                      fontSize: font.sizes.md, color: colors.text,
                    }}
                  />
                </View>
              ) : null}
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 6 }}>
                  {t('childSizes.fieldSizeValue')}
                </Text>
                <TextInput
                  value={modal.sizeValue}
                  onChangeText={(v) => updateModal({ sizeValue: v })}
                  placeholder={modal.kind === 'shoe' ? t('childSizes.shoePlaceholder') : t('childSizes.clothesPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  maxLength={24}
                  inputMode={modal.kind === 'shoe' ? 'decimal' : 'text'}
                  autoFocus={modal.kind !== 'other'}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingHorizontal: spacing.md, paddingVertical: 10,
                    fontSize: font.sizes.md, color: colors.text,
                  }}
                />
              </View>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 6 }}>
                  {t('childSizes.fieldDate')}
                </Text>
                {/* Pra evitar dependência de DateTimePicker pesado, input simples
                    YYYY-MM-DD. Native UX trade-off: usar default = hoje + permitir
                    edit manual. Pode upgrade pra date picker em Fase 2. */}
                <TextInput
                  value={modal.recordedOn}
                  onChangeText={(v) => updateModal({ recordedOn: v })}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={colors.textMuted}
                  maxLength={10}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingHorizontal: spacing.md, paddingVertical: 10,
                    fontSize: font.sizes.md, color: colors.text,
                  }}
                />
              </View>
              <View>
                <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, fontWeight: font.weights.medium, marginBottom: 6 }}>
                  {t('childSizes.fieldNotes')}
                </Text>
                <TextInput
                  value={modal.notes}
                  onChangeText={(v) => updateModal({ notes: v })}
                  placeholder={t('childSizes.fieldNotesPlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  maxLength={500}
                  style={{
                    backgroundColor: colors.bgElevated, borderRadius: radius.md,
                    borderWidth: 1, borderColor: colors.borderLight,
                    paddingHorizontal: spacing.md, paddingVertical: 10,
                    fontSize: font.sizes.md, color: colors.text,
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
                {modal.mode === 'edit' && modal.sizeId ? (
                  <TouchableOpacity
                    onPress={() => modal.sizeId && handleDelete(modal.sizeId)}
                    disabled={busy}
                    style={{
                      paddingVertical: 12, paddingHorizontal: spacing.md,
                      borderRadius: radius.md, opacity: busy ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ color: colors.error, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                      {t('childSizes.delete')}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={closeModal}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.cancel')}
                  accessibilityState={{ disabled: busy }}
                  style={{ paddingVertical: 12, paddingHorizontal: spacing.md, opacity: busy ? 0.4 : 1 }}
                >
                  <Text style={{ color: colors.textMuted, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                    {t('common.cancel')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmitModal}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={busy ? t('common.saving') : t('common.save')}
                  accessibilityState={{ busy, disabled: busy }}
                  style={{
                    paddingVertical: 12, paddingHorizontal: spacing.lg,
                    backgroundColor: colors.brand, borderRadius: radius.md,
                    opacity: busy ? 0.6 : 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 100,
                    justifyContent: 'center',
                  }}
                >
                  {busy ? (
                    <>
                      <ActivityIndicator size="small" color="#fff" />
                      <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                        {t('common.saving')}
                      </Text>
                    </>
                  ) : (
                    <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                      {t('common.save')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}
