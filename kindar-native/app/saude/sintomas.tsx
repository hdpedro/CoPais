/**
 * Diário de Sintomas — timeline de sintomas dos últimos 14 dias + registro rápido.
 * Mirrors PWA /saude/sintomas.
 */
import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
  Modal, TextInput,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from 'src/store/auth';
import { fetchSymptoms, createSymptomEntry, type SymptomEntry } from 'src/services/health';
import { fetchChildren, type Child } from 'src/services/children';
import EmptyState from 'src/components/ui/EmptyState';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import ModalBackdrop from 'src/components/ui/ModalBackdrop';
import ChildPicker from 'src/components/ui/ChildPicker';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { useToast } from 'src/components/ui/ToastProvider';
import { useI18n } from 'src/i18n';
import { useIntl } from 'src/lib/intl';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

/**
 * Enums DEVEM bater com o CHECK constraint do schema (migration 00037).
 * Valores aceitos pelo banco:
 *   symptom_type: febre | vomito | diarreia | tosse | dor | mancha | falta_apetite | outro
 *   intensity:    leve  | moderado | forte
 *
 * Bug Diogo 2026-05-13: a tela usava enums em INGLES (mild/moderate/severe)
 * e tipos em divergencia (cansaco/coriza/apetite — nao existem no schema;
 * faltavam mancha/falta_apetite). Resultado: TODO INSERT batia com
 * `23514 check_violation` e o user via "Erro: Nao foi possivel registrar".
 * Default `intensity='moderate'` garantia falha mesmo sem o user mexer.
 *
 * Paridade com PWA `src/app/(app)/saude/sintomas/SintomasClient.tsx`
 * (SYMPTOM_CONFIG + INTENSITY_CONFIG) — fonte de verdade da UI.
 */
// `labelKey` aponta para chaves i18n existentes (symptomDiary.*) — resolvidas
// com t() no render. Não chamar t() aqui (escopo de módulo).
const SYMPTOM_TYPES: { value: string; labelKey: string; icon: string; color: string }[] = [
  { value: 'febre', labelKey: 'symptomDiary.typeFever', icon: '🌡️', color: '#E53935' },
  { value: 'vomito', labelKey: 'symptomDiary.typeVomit', icon: '🤮', color: '#E8A228' },
  { value: 'diarreia', labelKey: 'symptomDiary.typeDiarrhea', icon: '💩', color: '#F59E0B' },
  { value: 'tosse', labelKey: 'symptomDiary.typeCough', icon: '😷', color: '#3B82F6' },
  { value: 'dor', labelKey: 'symptomDiary.typePain', icon: '🤕', color: '#9333EA' },
  { value: 'mancha', labelKey: 'symptomDiary.typeRash', icon: '🔴', color: '#EC4899' },
  { value: 'falta_apetite', labelKey: 'symptomDiary.typeNoAppetite', icon: '🍽️', color: '#C0876D' },
  { value: 'outro', labelKey: 'symptomDiary.typeOther', icon: '📝', color: '#8A8A8A' },
];

type Intensity = 'leve' | 'moderado' | 'forte';
const INTENSITIES: { value: Intensity; labelKey: string; color: string }[] = [
  { value: 'leve', labelKey: 'symptomDiary.intensityMild', color: '#4CAF50' },
  { value: 'moderado', labelKey: 'symptomDiary.intensityModerate', color: '#E8A228' },
  { value: 'forte', labelKey: 'symptomDiary.intensityStrong', color: '#E53935' },
];

// Finer relative time (agora / X min / Xh / Xd). Day-level "hoje/ontem" tem
// helper próprio (intl.formatRelativeDay); aqui é sub-dia, então reusamos as
// chaves já existentes e com paridade nos 5 locales (health.now/minutesAgo/
// hoursAgo/daysAgo). Numérico mantido, só o texto vai pelo t().
function formatRelative(iso: string): string {
  const t = useI18n.getState().t;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('health.now');
  if (mins < 60) return t('health.minutesAgo', { count: mins });
  const h = Math.floor(mins / 60);
  if (h < 24) return t('health.hoursAgo', { count: h });
  const days = Math.floor(h / 24);
  return t('health.daysAgo', { count: days });
}

function groupByDate(entries: SymptomEntry[]): { date: string; items: SymptomEntry[] }[] {
  const map: Record<string, SymptomEntry[]> = {};
  entries.forEach(e => {
    const key = e.recorded_at.slice(0, 10);
    if (!map[key]) map[key] = [];
    map[key].push(e);
  });
  const keys = Object.keys(map).sort((a, b) => (a < b ? 1 : -1));
  return keys.map(k => ({ date: k, items: map[k] }));
}

export default function SintomasScreen() {
  const t = useI18n(s => s.t);
  const intl = useIntl();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { activeGroup, userId } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [entries, setEntries] = useState<SymptomEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [symptomType, setSymptomType] = useState('febre');
  const [intensity, setIntensity] = useState<Intensity>('moderado');
  const [temperature, setTemperature] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (activeGroup) {
      fetchChildren(activeGroup.groupId).then(list => {
        setChildren(list);
        if (list.length > 0) setSelectedChildId(list[0].id);
      });
    }
  }, [activeGroup]);

  const load = useCallback(async () => {
    if (!selectedChildId) { setLoading(false); return; }
    setEntries(await fetchSymptoms(selectedChildId, 14));
    setLoading(false);
  }, [selectedChildId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await load();
    setRefreshing(false);
  }

  async function handleSubmit() {
    if (!activeGroup || !userId || !selectedChildId) return;
    const tempNum = temperature.trim() ? parseFloat(temperature.replace(',', '.')) : undefined;
    if (symptomType === 'febre' && tempNum !== undefined && (tempNum < 30 || tempNum > 45)) {
      toast.show({ message: t('toasts.validation.fillRequired'), variant: 'warning' });
      return;
    }
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await createSymptomEntry({
      groupId: activeGroup.groupId,
      childId: selectedChildId,
      symptomType,
      intensity,
      temperature: tempNum,
      notes: notes.trim() || undefined,
      createdBy: userId,
    });
    setSubmitting(false);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setComposerOpen(false);
      setSymptomType('febre');
      setIntensity('moderado');
      setTemperature('');
      setNotes('');
      await load();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Mostrar a mensagem real do Supabase quando houver — ajuda o usuario
      // a entender o problema (offline, validacao, RLS) em vez do generico
      // "Nao foi possivel". Bug Diogo 2026-05-13 ficou invisivel por meses
      // porque o alert generico escondia o `23514 check_violation` real.
      const detail = (result as { error?: string }).error;
      toast.show({ message: detail || t('toasts.common.saveFailed'), variant: 'error' });
    }
  }

  const grouped = groupByDate(entries);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text }}>
          {t('symptomDiary.title')}
        </Text>
      </View>

      {/* Seletor de criança (componente consolidado) */}
      <ChildPicker
        items={children}
        selectedId={selectedChildId}
        onSelect={(id) => { setSelectedChildId(id); setLoading(true); }}
        containerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}
        testID="sintomas-child-picker"
      />

      {loading ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        >
          {grouped.length === 0 ? (
            <EmptyState
              icon="🩹"
              title={t('empty.sintomas.title')}
              description={t('empty.sintomas.description')}
            />
          ) : (
            grouped.map(group => (
              <View key={group.date} style={{ marginBottom: spacing.lg }}>
                <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm }}>
                  {intl.formatRelativeDay(group.date)}
                </Text>
                {group.items.map(e => {
                  const typeCfg = SYMPTOM_TYPES.find(st => st.value === e.symptom_type) || SYMPTOM_TYPES[SYMPTOM_TYPES.length - 1];
                  const intensityCfg = INTENSITIES.find(i => i.value === e.intensity);
                  return (
                    <View
                      key={e.id}
                      style={{
                        backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                        padding: spacing.lg, marginBottom: spacing.sm, ...shadows.sm,
                        borderLeftWidth: 3, borderLeftColor: typeCfg.color,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                        <Text style={{ fontSize: 22 }}>{typeCfg.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                            {t(typeCfg.labelKey)}
                            {e.temperature != null ? ` · ${e.temperature.toFixed(1)}°C` : ''}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            {intensityCfg ? (
                              <Text style={{ fontSize: font.sizes.xs, color: intensityCfg.color, fontWeight: font.weights.medium }}>
                                {t(intensityCfg.labelKey)}
                              </Text>
                            ) : null}
                            <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                              · {formatRelative(e.recorded_at)}
                              {e.authorName ? ` · ${e.authorName}` : ''}
                            </Text>
                          </View>
                        </View>
                      </View>
                      {e.notes ? (
                        <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 20 }}>
                          {e.notes}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* FAB */}
      {selectedChildId ? (
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setComposerOpen(true); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('symptoms.fabNew')}
          style={{
            position: 'absolute', bottom: insets.bottom + 20, right: 20,
            width: 56, height: 56, borderRadius: 28, backgroundColor: colors.brand,
            alignItems: 'center', justifyContent: 'center', ...shadows.md,
          }}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}

      {/* Composer modal */}
      <Modal visible={composerOpen} animationType="slide" transparent onRequestClose={() => setComposerOpen(false)}>
        <ModalBackdrop onClose={() => setComposerOpen(false)} align="bottom" dim={0.4} padding={0}>
          <View style={{
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'],
            padding: spacing.xl, paddingBottom: 40, maxHeight: '90%',
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: spacing.lg }} />
            <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text, marginBottom: spacing.md }}>
              {t('symptoms.composerTitle')}
            </Text>

            <ScrollView style={{ flexShrink: 1 }}>
              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('health.type')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
                {SYMPTOM_TYPES.map(st => {
                  const active = symptomType === st.value;
                  return (
                    <TouchableOpacity
                      key={st.value}
                      onPress={() => setSymptomType(st.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t(st.labelKey)}
                      style={{
                        paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
                        backgroundColor: active ? `${st.color}20` : colors.bg,
                        borderWidth: 1, borderColor: active ? st.color : colors.borderLight,
                        flexDirection: 'row', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Text style={{ fontSize: 14 }}>{st.icon}</Text>
                      <Text style={{ fontSize: font.sizes.sm, color: active ? st.color : colors.text, fontWeight: active ? font.weights.semibold : font.weights.normal }}>
                        {t(st.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {symptomType === 'febre' ? (
                <>
                  <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>{t('symptoms.temperatureC')}</Text>
                  <TextInput
                    value={temperature}
                    onChangeText={setTemperature}
                    placeholder="37.5"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    maxLength={5}
                    style={{
                      backgroundColor: colors.bg, borderRadius: radius.md,
                      borderWidth: 1, borderColor: colors.borderLight,
                      paddingHorizontal: spacing.md, paddingVertical: spacing.md,
                      fontSize: font.sizes.md, color: colors.text,
                      marginBottom: spacing.lg,
                    }}
                  />
                </>
              ) : null}

              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>{t('symptomDiary.intensity')}</Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg }}>
                {INTENSITIES.map(i => {
                  const active = intensity === i.value;
                  return (
                    <TouchableOpacity
                      key={i.value}
                      onPress={() => setIntensity(i.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={`${t('symptomDiary.intensity')} ${t(i.labelKey)}`}
                      style={{
                        flex: 1, paddingVertical: 10, borderRadius: radius.md,
                        backgroundColor: active ? i.color : 'transparent',
                        borderWidth: 1, borderColor: active ? i.color : colors.borderLight,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: active ? '#fff' : i.color, fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                        {t(i.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>{t('symptomDiary.notes')}</Text>
              <TextInput
                value={notes} onChangeText={setNotes}
                placeholder={t('symptoms.notesPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                style={{
                  backgroundColor: colors.bg, borderRadius: radius.md,
                  borderWidth: 1, borderColor: colors.borderLight,
                  paddingHorizontal: spacing.md, paddingVertical: spacing.md,
                  fontSize: font.sizes.md, color: colors.text, minHeight: 80, textAlignVertical: 'top',
                  marginBottom: spacing.lg,
                }}
              />

              <PrimaryButton
                label={t('symptomDiary.register')}
                onPress={handleSubmit}
                loading={submitting}
                testID="saude-sintomas-submit"
              />
            </ScrollView>
          </View>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}
