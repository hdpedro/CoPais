/**
 * Alergias — Lista + Criar alergia por criança (com type picker e severidade).
 */
import { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, RefreshControl, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from 'src/lib/supabase';
import { safeWrite } from 'src/services/offline';
import { notifyAction } from 'src/services/notify';
import { useAuth } from 'src/store/auth';
import { getDisplayName } from 'src/lib/constants';
import ScreenHeader from 'src/components/ui/ScreenHeader';
import { useToast } from 'src/components/ui/ToastProvider';
import EmptyState from 'src/components/ui/EmptyState';
import ChildPicker from 'src/components/ui/ChildPicker';
import SwipeToDelete from 'src/components/ui/SwipeToDelete';
import { SkeletonList } from 'src/components/ui/Skeleton';
import PrimaryButton from 'src/components/ui/PrimaryButton';
import { useCollabRealtime } from 'src/hooks/useCollabRealtime';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface Allergy { id: string; name: string; allergy_type: string; severity: string; reaction: string | null; childName: string; child_id: string; }

const SEV_ICONS: Record<string, { icon: string; color: string }> = {
  severe: { icon: '🔴', color: '#E53935' }, moderate: { icon: '🟡', color: '#E8A228' }, mild: { icon: '🟢', color: '#4CAF50' },
};

// Allergy types — match the labels PWA uses (`src/app/(app)/saude/alergias/nova/page.tsx`).
const TYPE_OPTIONS: { value: string; label: string; icon: string }[] = [
  { value: 'food', label: 'Alimentar', icon: '🍔' },
  { value: 'medication', label: 'Medicamento', icon: '💊' },
  { value: 'environmental', label: 'Ambiental', icon: '🌿' },
  { value: 'other', label: 'Outro', icon: '🔖' },
];

export default function AlergiasScreen() {
  const t = useI18n(s => s.t);
  const toast = useToast();
  const { userId, activeGroup } = useAuth();
  const [allergies, setAllergies] = useState<Allergy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('food');
  const [severity, setSeverity] = useState('mild');
  const [reaction, setReaction] = useState('');
  const [selectedChild, setSelectedChild] = useState('');
  const [children, setChildren] = useState<Array<{id: string; full_name: string}>>([]);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!activeGroup) return;
    const [{ data: a }, { data: c }] = await Promise.all([
      supabase.from('child_allergies').select('id, name, allergy_type, severity, reaction, child_id, children(full_name)').eq('group_id', activeGroup.groupId),
      supabase.from('children').select('id, full_name').eq('group_id', activeGroup.groupId),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllergies((a || []).map((x: any) => ({ ...x, childName: getDisplayName(x.children?.full_name) })));
    setChildren(c || []);
    if (c && c.length > 0 && !selectedChild) setSelectedChild(c[0].id);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Real-time: quando o co-responsável adiciona/edita/apaga uma alergia,
  // a lista atualiza sozinha + toast "Amanda adicionou uma alergia"
  useCollabRealtime({
    table: 'child_allergies',
    groupId: activeGroup?.groupId,
    onChange: load,
    displayLabel: 'alergia',
    myUserId: userId,
  });

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleCreate() {
    if (!name.trim() || !selectedChild || !userId || !activeGroup) return;
    setSaving(true);
    const result = await safeWrite({
      table: 'child_allergies', operation: 'insert',
      payload: { group_id: activeGroup.groupId, child_id: selectedChild, name: name.trim(), allergy_type: type, severity, reaction: reaction.trim() || null, created_by: userId },
    });
    if (result.success) {
      if (!result.queued) notifyAction('health_event_created', activeGroup.groupId, { title: `Alergia: ${name}`, childName: children.find(c => c.id === selectedChild)?.full_name?.split(' ')[0] || '' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false); setName(''); setReaction('');
      load();
    } else { toast.show({ message: result.error || t('toasts.common.saveFailed'), variant: 'error' }); }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    // Confirmação fica no SwipeToDelete (Alert.alert ali). Aqui executamos
    // direto. Mantém compat com long-press caller (sem swipe).
    await safeWrite({ table: 'child_allergies', operation: 'delete', payload: { id } });
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('health.allergies')} rightAction={{ icon: showForm ? 'close' : 'add', onPress: () => setShowForm(!showForm) }} />

      {showForm ? (
        <View style={{ padding: spacing.xl, backgroundColor: colors.bgElevated, borderBottomWidth: 0.5, borderBottomColor: colors.borderLight }}>
          <ChildPicker
            items={children}
            selectedId={selectedChild}
            onSelect={(id) => setSelectedChild(id ?? '')}
            containerStyle={{ marginBottom: spacing.md }}
            testID="alergia-form-child-picker"
          />
          <TextInput value={name} onChangeText={setName} placeholder="Nome da alergia" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.sm }} />

          {/* Type picker — was hardcoded to 'food' before */}
          <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary, marginBottom: 4 }}>Tipo</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {TYPE_OPTIONS.map(t => (
                <TouchableOpacity key={t.value} onPress={() => setType(t.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: type === t.value }}
                  accessibilityLabel={`Tipo ${t.label}`}
                  style={{
                    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full,
                    backgroundColor: type === t.value ? colors.brand : colors.bgSurface,
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                  }}>
                  <Text style={{ fontSize: 14 }}>{t.icon}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: type === t.value ? '#fff' : colors.text }}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
            {['mild', 'moderate', 'severe'].map(s => {
              const sevLabel = s === 'mild' ? 'Leve' : s === 'moderate' ? 'Moderada' : 'Grave';
              return (
                <TouchableOpacity key={s} onPress={() => setSeverity(s)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: severity === s }}
                  accessibilityLabel={`Severidade ${sevLabel}`}
                  style={{ flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center',
                    backgroundColor: severity === s ? `${(SEV_ICONS[s]?.color || colors.brand)}20` : colors.bgSurface,
                    borderWidth: severity === s ? 1.5 : 0, borderColor: SEV_ICONS[s]?.color }}>
                  <Text style={{ fontSize: 14 }}>{SEV_ICONS[s]?.icon}</Text>
                  <Text style={{ fontSize: font.sizes.xs, color: colors.text }}>{sevLabel}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput value={reaction} onChangeText={setReaction} placeholder="Reação (opcional)" placeholderTextColor={colors.textDim}
            style={{ backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, fontSize: font.sizes.md, color: colors.text, marginBottom: spacing.md }} />
          <PrimaryButton
            label="Adicionar alergia"
            onPress={handleCreate}
            loading={saving}
            disabled={!name.trim()}
            testID="alergia-save-button"
          />
        </View>
      ) : null}

      {loading && allergies.length === 0 ? (
        <View style={{ padding: spacing.lg }}>
          <SkeletonList count={3} />
        </View>
      ) : null}
      <FlatList data={loading && allergies.length === 0 ? [] : allergies} keyExtractor={item => item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 100, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        ListEmptyComponent={loading ? null : (
          <EmptyState
            icon="⚠️"
            title={t('empty.alergias.title')}
            description={t('empty.alergias.description')}
            action={{ label: t('empty.alergias.actionLabel'), onPress: () => setShowForm(true), accessibilityHint: t('empty.alergias.actionHint') }}
          />
        )}
        renderItem={({ item }) => {
          const sev = SEV_ICONS[item.severity] || SEV_ICONS.mild;
          return (
            <View style={{ marginBottom: spacing.sm }}>
              <SwipeToDelete
                onDelete={() => handleDelete(item.id)}
                confirmTitle="Apagar alergia"
                confirmMessage={`Remover "${item.name}" do registro de ${item.childName}? Esta ação não pode ser desfeita.`}
              >
                <View style={{ backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm,
                  flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderLeftWidth: 3, borderLeftColor: sev.color }}>
                  <Text style={{ fontSize: 18 }}>{sev.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text }}>{item.name}</Text>
                    <Text style={{ fontSize: font.sizes.xs, color: colors.textSecondary }}>
                      {item.childName} · {item.allergy_type}{item.reaction ? ` · ${item.reaction}` : ''}
                    </Text>
                  </View>
                </View>
              </SwipeToDelete>
            </View>
          );
        }}
      />
    </View>
  );
}
