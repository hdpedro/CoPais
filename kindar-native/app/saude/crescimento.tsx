/**
 * Crescimento — Registros de peso/altura/perimetro cefalico.
 *
 * 2026-05-05: hardening pós-bug report
 *   - synchronous ref guard contra double-tap duplicando registro
 *   - tap pra editar (carrega no form), long-press pra excluir
 *   - chave de FlatList agora estavel via id (era spread perigoso antes)
 */
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useRef, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, FlatList, TouchableOpacity, RefreshControl, ScrollView, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { useAuth } from 'src/store/auth';
import { getDisplayName } from 'src/lib/constants';
import { useCachedFetch } from 'src/lib/use-cached-fetch';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import EmptyState from 'src/components/ui/EmptyState';
import ChildPicker from 'src/components/ui/ChildPicker';
import SwipeToDelete from 'src/components/ui/SwipeToDelete';
import { SkeletonList } from 'src/components/ui/Skeleton';
import { DatePickerField, dateToIso } from 'src/components/ui/DateTimeField';
import { DecimalInput } from 'src/components/ui/MaskedInputs';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { calculatePercentile } from 'src/lib/who-growth-data';
import GrowthChart from 'src/components/saude/GrowthChart';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface GrowthRecord {
  id: string;
  child_id: string;
  measured_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
  childName: string;
}

interface ChildInfo {
  id: string;
  full_name: string;
  birth_date: string;
  sex: 'M' | 'F' | null;
}

interface CrescimentoCache {
  records: GrowthRecord[];
  children: ChildInfo[];
}

const EMPTY_CACHE: CrescimentoCache = { records: [], children: [] };

// Idade em meses pra percentil WHO. Espelha src/lib/who-growth-data.ts.
function monthsBetween(birthDate: string, measureDate: string): number {
  const b = new Date(birthDate + 'T12:00:00');
  const d = new Date(measureDate + 'T12:00:00');
  return Math.max(
    0,
    (d.getFullYear() - b.getFullYear()) * 12 +
      (d.getMonth() - b.getMonth()) +
      (d.getDate() - b.getDate()) / 30,
  );
}

/**
 * Premium UX: cor semântica por faixa de percentil (paridade PWA).
 *  - P15-P85 verde (normal): a maioria das crianças saudáveis
 *  - P3-P97 âmbar (atenção): faixa de monitoramento
 *  - <P3 ou >P97 vermelho (acompanhar): conversar com pediatra
 */
function percentileColor(p: number | null): string {
  if (p === null) return colors.textMuted;
  if (p >= 15 && p <= 85) return '#059669'; // emerald-600
  if (p >= 3 && p <= 97) return '#D97706'; // amber-600
  return '#DC2626'; // red-600
}
function percentileBg(p: number | null): string {
  if (p === null) return colors.bgSurface;
  if (p >= 15 && p <= 85) return '#D1FAE5'; // emerald-100
  if (p >= 3 && p <= 97) return '#FEF3C7'; // amber-100
  return '#FEE2E2'; // red-100
}

export default function CrescimentoScreen() {
  const t = useI18n(s => s.t);
  // Deep-link da aba Saúde: card Peso/Altura manda ?childId= pra pré-selecionar
  // a criança certa (sem isso o ChildPicker cai sempre no primeiro filho).
  const { childId: paramChildId } = useLocalSearchParams<{ childId?: string }>();
  const { userId, activeGroup } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedChild, setSelectedChild] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [headCm, setHeadCm] = useState('');
  const [dateIso, setDateIso] = useState<string>(dateToIso(new Date()));
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const toast = useToast();

  // Synchronous guard against double-tap duplication. setState is async,
  // so disabled={saving} alone allows ~2-3 taps to slip through before
  // React rerenders the disabled state. A ref blocks the second call
  // immediately. Cleared after the network round-trip.
  const submittingRef = useRef(false);

  const { data, loading, refresh } = useCachedFetch<CrescimentoCache>({
    cacheKey: activeGroup ? `saude_crescimento_${activeGroup.groupId}` : null,
    tag: 'saude:crescimento:load',
    empty: EMPTY_CACHE,
    fetcher: async () => {
      const [{ data: r }, { data: c }] = await Promise.all([
        supabase.from('growth_records').select('id, child_id, measured_date, weight_kg, height_cm, head_cm, children(full_name)')
          .eq('group_id', activeGroup!.groupId).order('measured_date', { ascending: false }),
        supabase.from('children').select('id, full_name, birth_date, sex').eq('group_id', activeGroup!.groupId),
      ]);
      return {
        records: (r || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name) })),
        children: (c || []) as ChildInfo[],
      };
    },
  });
  const records = data.records;
  const children = data.children;

  useEffect(() => {
    if (!selectedChild && children.length > 0) {
      const preferred = paramChildId && children.some(c => c.id === paramChildId)
        ? paramChildId
        : children[0].id;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedChild(preferred);
    }
  }, [children, selectedChild, paramChildId]);

  useCollabRealtime({
    table: 'growth_records',
    groupId: activeGroup?.groupId,
    onChange: refresh,
    displayLabel: 'medida',
    myUserId: userId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // Realtime extra: refletir mudancas vindas de outro dispositivo (ou do
  // co-pai) sem precisar refresh manual. Filtra por group_id pra nao
  // receber broadcast de outros grupos. (useCollabRealtime acima ja faz
  // isso pra eventos colaborativos; esse canal extra cobre o caso de
  // multi-device do mesmo user.)
  useEffect(() => {
    if (!activeGroup) return;
    const ch = supabase
      // sufixo aleatorio: nome unico por mount evita "after subscribe()" no
      // duplo-toque (mesma classe do chat, PR #95). Cleanup abaixo remove o canal.
      .channel(`growth:list:${activeGroup.groupId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'growth_records', filter: `group_id=eq.${activeGroup.groupId}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeGroup?.groupId, refresh]);

  function resetForm() {
    setEditingId(null);
    setWeight('');
    setHeight('');
    setHeadCm('');
    setDateIso(dateToIso(new Date()));
  }

  function startEdit(record: GrowthRecord) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingId(record.id);
    setSelectedChild(record.child_id);
    setWeight(record.weight_kg?.toString().replace('.', ',') || '');
    setHeight(record.height_cm?.toString().replace('.', ',') || '');
    setHeadCm(record.head_cm?.toString().replace('.', ',') || '');
    setDateIso(record.measured_date);
    setShowForm(true);
  }

  async function handleSubmit() {
    // Sync guard — kicks in BEFORE state propagation so a 2nd rapid tap
    // is dropped immediately.
    if (submittingRef.current) return;
    if ((!weight && !height && !headCm) || !selectedChild || !userId || !activeGroup) {
      toast.show({ message: t('toasts.validation.fillRequired'), variant: 'error' });
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      // Normalize input: alguns usuarios digitam altura em metros (1.7) em
      // vez de cm (170). Bug Hailla/Bernardo 2026-05-11: Bernardo cadastrado
      // com height_cm=1.5, Guilherme com height_cm=1.7. Cards de saude
      // mostram '1.5cm' / '1.7cm' (errado visualmente).
      // Regra: se valor for < 3 e razoavel pra metros (0.3-2.5), multiplica
      // por 100. Acima de 3, assume que ja esta em cm.
      const rawHeight = height ? parseFloat(height.replace(',', '.')) : null;
      const normHeight = rawHeight != null && rawHeight > 0 && rawHeight < 3
        ? Math.round(rawHeight * 100)
        : rawHeight;
      // Sanity check: peso > 500 = improvavel (kg). Avisa user.
      const rawWeight = weight ? parseFloat(weight.replace(',', '.')) : null;
      if (rawWeight != null && (rawWeight < 0.5 || rawWeight > 250)) {
        toast.show({ message: t('toasts.growth.weightOutOfRange'), variant: 'warning' });
        submittingRef.current = false;
        setSaving(false);
        return;
      }
      if (normHeight != null && (normHeight < 20 || normHeight > 230)) {
        toast.show({ message: t('toasts.growth.heightOutOfRange'), variant: 'warning' });
        submittingRef.current = false;
        setSaving(false);
        return;
      }
      const payload = {
        group_id: activeGroup.groupId,
        child_id: selectedChild,
        measured_date: dateIso,
        weight_kg: rawWeight,
        height_cm: normHeight,
        head_cm: headCm ? parseFloat(headCm.replace(',', '.')) : null,
        created_by: userId,
      };
      const result = editingId
        ? await safeWrite({ table: 'growth_records', operation: 'update', payload: { id: editingId, ...payload } })
        : await safeWrite({ table: 'growth_records', operation: 'insert', payload });
      if (result.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowForm(false);
        resetForm();
        await refresh();
      } else {
        toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' });
      }
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  }

  // Mantido como `confirmMessage` builder pra passar ao SwipeToDelete + delete
  // direto (Alert.alert vive no componente). Antes era Alert + execute aqui.
  function buildDeleteConfirmMessage(record: GrowthRecord): string {
    const summary = [
      record.weight_kg ? `${record.weight_kg}kg` : null,
      record.height_cm ? `${record.height_cm}cm` : null,
      record.head_cm ? `PC ${record.head_cm}cm` : null,
    ].filter(Boolean).join(' · ');
    const dateBr = record.measured_date.split('-').reverse().join('/');
    return `${record.childName} · ${dateBr}${summary ? `\n${summary}` : ''}\n\nEsta ação não pode ser desfeita.`;
  }

  async function performDelete(record: GrowthRecord) {
    const dateBr = record.measured_date.split('-').reverse().join('/');
    const r = await safeWrite({ table: 'growth_records', operation: 'delete', payload: { id: record.id } });
    if (r.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ message: `Registro de ${dateBr} removido`, variant: 'success' });
      await refresh();
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show({ message: r.error || 'Não consegui excluir. Tente de novo.', variant: 'error' });
    }
  }

  function toggleForm() {
    if (showForm) {
      resetForm();
    }
    setShowForm(!showForm);
  }

  // ─── Premium UX (paridade PWA): per-child view ──────────────────
  //   Chips no topo selecionam UM filho. Stat hero (peso/altura/PC) +
  //   percentil WHO calculado pelo birth_date+sex. Lista filtrada pelo
  //   filho ativo. Single source of truth: `selectedChild` controla
  //   filtro da lista E pre-seleciona no form.
  const activeChild = children.find((c) => c.id === selectedChild);
  const childRecords = selectedChild
    ? records.filter((r) => r.child_id === selectedChild)
    : records;
  const latestForChild = childRecords[0] || null;
  const weightP =
    latestForChild && activeChild?.sex && latestForChild.weight_kg
      ? calculatePercentile(
          monthsBetween(activeChild.birth_date, latestForChild.measured_date),
          Number(latestForChild.weight_kg),
          activeChild.sex,
          'weight',
        )
      : null;
  const heightP =
    latestForChild && activeChild?.sex && latestForChild.height_cm
      ? calculatePercentile(
          monthsBetween(activeChild.birth_date, latestForChild.measured_date),
          Number(latestForChild.height_cm),
          activeChild.sex,
          'height',
        )
      : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('health.growth')} rightAction={{ icon: showForm ? 'close' : 'add', onPress: toggleForm }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          {editingId ? (
            <View style={{ marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="create-outline" size={14} color={colors.brand} />
              <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.semibold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Editando medida
              </Text>
            </View>
          ) : null}
          <ChildPicker
            items={children}
            selectedId={selectedChild}
            onSelect={(id) => setSelectedChild(id ?? '')}
            containerStyle={{ marginBottom: spacing.md }}
            testID="crescimento-form-child-picker"
          />
          <View style={{ marginBottom: spacing.sm }}>
            <DatePickerField value={dateIso} onChange={setDateIso} placeholder="Data da medida" maximumDate={new Date()} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <DecimalInput value={weight} onChangeText={setWeight} placeholder="Peso" unit="kg" maxIntegerDigits={3} maxDecimalDigits={2} />
            </View>
            <View style={{ flex: 1 }}>
              <DecimalInput value={height} onChangeText={setHeight} placeholder="Altura" unit="cm" maxIntegerDigits={3} maxDecimalDigits={1} />
            </View>
          </View>
          <View style={{ marginBottom: spacing.md }}>
            <DecimalInput value={headCm} onChangeText={setHeadCm} placeholder="Perímetro cefálico (opcional)" unit="cm" maxIntegerDigits={3} maxDecimalDigits={1} />
          </View>
          <PrimaryButton
            label={editingId ? 'Salvar alterações' : 'Registrar medida'}
            onPress={handleSubmit}
            loading={saving}
            testID="crescimento-save-button"
          />
        </View>
      ) : null}

      {loading && records.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={4} />
        </View>
      ) : null}

      <FlatList
        data={loading && childRecords.length === 0 ? [] : childRecords}
        keyExtractor={item => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListHeaderComponent={
          <View>
            {/* Child chips — chave UX: filtram a lista E pre-selecionam pro form */}
            {!showForm && children.length > 1 ? (
              <ScrollViewRow
                items={children.map((c) => ({
                  id: c.id,
                  label: c.full_name.split(' ')[0],
                }))}
                selectedId={selectedChild}
                onSelect={(id) => setSelectedChild(id)}
              />
            ) : null}

            {/* Stat hero card — peso/altura/PC com percentil WHO colorido.
                Cards tappable: ao tocar, abre o form com a última medida
                pré-carregada pra editar (ou complementar PC vazio).
                Premium UX: usuário toca o card "Cabeça —" e o form já abre
                com Peso+Altura preservados, basta preencher PC + Salvar. */}
            {!showForm && latestForChild ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: spacing.sm,
                  marginBottom: spacing.md,
                }}
              >
                <StatCard
                  label="Peso"
                  value={latestForChild.weight_kg ? `${latestForChild.weight_kg}` : '—'}
                  unit="kg"
                  percentile={weightP}
                  onPress={() => startEdit(latestForChild)}
                />
                <StatCard
                  label="Altura"
                  value={latestForChild.height_cm ? `${latestForChild.height_cm}` : '—'}
                  unit="cm"
                  percentile={heightP}
                  onPress={() => startEdit(latestForChild)}
                />
                <StatCard
                  label="Cabeça"
                  value={latestForChild.head_cm ? `${latestForChild.head_cm}` : '—'}
                  unit="cm"
                  percentile={null}
                  onPress={() => startEdit(latestForChild)}
                />
              </View>
            ) : null}

            {!showForm && latestForChild ? (
              <Text
                style={{
                  fontSize: font.sizes.xs,
                  color: colors.textMuted,
                  textAlign: 'center',
                  marginBottom: spacing.md,
                }}
              >
                Última medida em {latestForChild.measured_date.split('-').reverse().join('/')}
              </Text>
            ) : null}

            {/* Gráfico OMS — curvas premium do PWA (paridade visual completa).
                Alimentado pelos `childRecords` filtrados pelo chip ativo.
                Aparece quando há criança ativa COM birth_date+sex (sem isso
                não dá pra calcular percentil). Ocultos no modo form pra não
                competir com inputs. */}
            {!showForm && activeChild && activeChild.birth_date && activeChild.sex ? (
              <GrowthChart
                records={childRecords}
                birthDate={activeChild.birth_date}
                childName={activeChild.full_name}
                childSex={activeChild.sex}
              />
            ) : null}

            {childRecords.length > 0 ? (
              <Text
                style={{
                  fontSize: font.sizes.xs,
                  color: colors.textMuted,
                  fontWeight: font.weights.semibold,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  marginBottom: spacing.sm,
                  paddingHorizontal: spacing.xs,
                }}
              >
                Histórico
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={loading ? null : (
          <EmptyState
            icon="📏"
            title={t('empty.crescimento.title')}
            description={t('empty.crescimento.description')}
            action={{ label: t('empty.crescimento.actionLabel'), onPress: () => setShowForm(true), accessibilityHint: t('empty.crescimento.actionHint') }}
          />
        )}
        renderItem={({ item }) => (
          <View style={{ marginBottom: spacing.sm }}>
            <SwipeToDelete
              onDelete={() => performDelete(item)}
              onEdit={() => startEdit(item)}
              confirmTitle="Excluir registro de crescimento?"
              confirmMessage={buildDeleteConfirmMessage(item)}
            >
              <TouchableOpacity
                onPress={() => startEdit(item)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Editar medida de ${item.childName} em ${item.measured_date?.split('-').reverse().join('/')}`}
                accessibilityState={{ selected: editingId === item.id }}
                style={{
                  backgroundColor: colors.bgElevated,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  ...shadows.sm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                  borderWidth: editingId === item.id ? 2 : 0,
                  borderColor: editingId === item.id ? colors.brand : 'transparent',
                }}
              >
                {/* Avatar circular emerald (paridade PWA) */}
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: '#D1FAE5',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 16 }}>📏</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.semibold, color: colors.text }}>
                    {item.weight_kg ? `${item.weight_kg} kg` : ''}
                    {item.weight_kg && item.height_cm ? ' — ' : ''}
                    {item.height_cm ? `${item.height_cm} cm` : ''}
                    {!item.weight_kg && !item.height_cm && item.head_cm ? `PC ${item.head_cm} cm` : ''}
                  </Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginTop: 2 }}>
                    {item.measured_date?.split('-').reverse().join('/')}
                    {selectedChild ? '' : ` · ${item.childName}`}
                    {item.head_cm && (item.weight_kg || item.height_cm) ? ` · PC ${item.head_cm} cm` : ''}
                  </Text>
                </View>
                {/* Ações explícitas — paridade PWA + descoberta sem depender
                    de swipe (gesture invisível). Bug Henrique 2026-05-20:
                    "Não tem opção de editar e excluir". stopPropagation no
                    onPress dos ícones pra não disparar o card todo. */}
                <TouchableOpacity
                  onPress={(e) => { e.stopPropagation(); startEdit(item); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Editar medida"
                  style={{ padding: 6 }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    // Alert.alert confirma antes de excluir — mesma UX do
                    // SwipeToDelete wrapper. performDelete chama safeWrite.
                    Alert.alert(
                      'Excluir medida?',
                      buildDeleteConfirmMessage(item),
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        { text: 'Excluir', style: 'destructive', onPress: () => performDelete(item) },
                      ],
                    );
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Excluir medida"
                  style={{ padding: 6 }}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            </SwipeToDelete>
          </View>
        )}
      />
      {/* Toast agora é global via ToastProvider em _layout.tsx */}
    </View>
  );
}

/* ───────────────────────────────────────────────────────────────────
 * Premium helpers — StatCard com percentil + ScrollViewRow de chips.
 * Inlined no arquivo pra manter co-localizado com a tela única que usa.
 * ─────────────────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string;
  unit: string;
  percentile: number | null;
  /** Tappable: ao tocar, abre o form (criar/editar). Bug Henrique 2026-05-20:
   *  "Cabeça não tem onde preencher" — StatCard era só display. Agora tap
   *  abre o form com a última medida pré-carregada pra editar/complementar. */
  onPress?: () => void;
}

function StatCard({ label, value, unit, percentile, onPress }: StatCardProps) {
  const hasPercentile = percentile !== null;
  const pColor = percentileColor(percentile);
  const pBg = percentileBg(percentile);
  const isEmpty = value === '—';
  const body = (
    <>
      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginBottom: 4 }}>
        {label}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontSize: 22, fontWeight: font.weights.bold, color: colors.text, lineHeight: 26, textAlign: 'center' }}>
        {value}
      </Text>
      {hasPercentile ? (
        <View
          style={{
            marginTop: 4,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: radius.full,
            backgroundColor: pBg,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: font.weights.semibold, color: pColor }}>
            P{percentile}
          </Text>
        </View>
      ) : (
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 10, color: colors.textMuted, marginTop: 4 }}>{unit}</Text>
      )}
      {isEmpty && onPress ? (
        <Text style={{ fontSize: 9, color: colors.brand, marginTop: 2, fontWeight: font.weights.semibold }}>
          + tocar
        </Text>
      ) : null}
    </>
  );
  const style = {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
    alignItems: 'center' as const,
  };
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={isEmpty ? `Adicionar ${label}` : `Editar ${label}`}
        style={style}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={style}>{body}</View>;
}

interface ScrollViewRowProps {
  items: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
}

function ScrollViewRow({ items, selectedId, onSelect }: ScrollViewRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
    >
      {items.map((item) => {
        const isActive = item.id === selectedId;
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelect(item.id)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: 8,
              borderRadius: radius.full,
              backgroundColor: isActive ? colors.brand : colors.bgElevated,
              borderWidth: isActive ? 0 : 1,
              borderColor: colors.borderLight,
              minWidth: 80,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontSize: font.sizes.sm,
                fontWeight: font.weights.semibold,
                color: isActive ? '#fff' : colors.text,
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
