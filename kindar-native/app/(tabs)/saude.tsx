import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useHealth } from '@/hooks/useHealth';
import { colors, spacing, radius, font, shadows } from '@/design-system/tokens';

const STATUS_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  healthy: { icon: '🟢', color: '#4CAF50', bg: 'rgba(76,175,80,0.08)' },
  monitoring: { icon: '🟡', color: '#E8A228', bg: 'rgba(232,162,40,0.08)' },
  treatment: { icon: '🔴', color: '#E53935', bg: 'rgba(229,57,53,0.08)' },
};

const EVENT_ICONS: Record<string, { icon: string; color: string }> = {
  illness: { icon: '🤒', color: '#E53935' },
  medication: { icon: '💊', color: '#3b82f6' },
  appointment: { icon: '🏥', color: '#5B9E85' },
  observation: { icon: '📝', color: '#E8A228' },
  allergy: { icon: '⚠️', color: '#D4735A' },
  dose: { icon: '💉', color: '#7C6FAE' },
};

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 7) return `${diffDays} dias atras`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function SaudeScreen() {
  const insets = useSafeAreaInsets();
  const { data, loading, refresh } = useHealth();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Filter data by selected child
  const childStates = data?.childStates || [];
  const timeline = (data?.timeline || []).filter(
    e => !selectedChildId || e.childId === selectedChildId
  ).slice(0, 20);

  const selectedState = selectedChildId
    ? childStates.find(c => c.childId === selectedChildId)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120, paddingHorizontal: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.delay(0).duration(400)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xl }}>
            <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text }}>
              Saude
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/saude/registrar');
              }}
              testID="saude-fab-registrar"
              accessibilityLabel="Registrar"
              style={{
                backgroundColor: colors.brand, borderRadius: radius.full,
                flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
              }}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: font.sizes.sm, fontWeight: font.weights.semibold }}>
                Registrar
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Child selector (if multiple children) */}
        {childStates.length > 1 ? (
          <Animated.View entering={FadeInDown.delay(50).duration(400)}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.lg }}>
              <TouchableOpacity
                onPress={() => setSelectedChildId(null)}
                style={{
                  paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
                  borderRadius: radius.full, marginRight: spacing.sm,
                  backgroundColor: !selectedChildId ? colors.brand : colors.bgElevated,
                }}
              >
                <Text style={{
                  fontSize: font.sizes.sm, fontWeight: font.weights.medium,
                  color: !selectedChildId ? '#fff' : colors.textSecondary,
                }}>
                  Todos
                </Text>
              </TouchableOpacity>
              {childStates.map(c => (
                <TouchableOpacity
                  key={c.childId}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedChildId(c.childId === selectedChildId ? null : c.childId);
                  }}
                  style={{
                    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
                    borderRadius: radius.full, marginRight: spacing.sm,
                    backgroundColor: selectedChildId === c.childId ? colors.brand : colors.bgElevated,
                  }}
                >
                  <Text style={{
                    fontSize: font.sizes.sm, fontWeight: font.weights.medium,
                    color: selectedChildId === c.childId ? '#fff' : colors.textSecondary,
                  }}>
                    {c.childName}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* Status Cards */}
        {(selectedChildId ? [selectedState!].filter(Boolean) : childStates).map((child, i) => {
          const cfg = STATUS_CONFIG[child.status];
          return (
            <Animated.View key={child.childId} entering={FadeInDown.delay(100 + i * 50).duration(400)}>
              <View style={{
                backgroundColor: colors.bgElevated, borderRadius: radius.xl,
                padding: spacing.xl, marginBottom: spacing.md,
                borderLeftWidth: 4, borderLeftColor: cfg.color,
                ...shadows.sm,
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                    <Text style={{ fontSize: 20 }}>{cfg.icon}</Text>
                    <View>
                      <Text style={{ fontSize: font.sizes.lg, fontWeight: font.weights.bold, color: colors.text }}>
                        {child.childName}
                      </Text>
                      <Text style={{ fontSize: font.sizes.sm, color: cfg.color, fontWeight: font.weights.medium }}>
                        {child.statusLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: spacing.md }}>
                  {child.detail}
                </Text>

                {/* Quick stats */}
                <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
                  {child.activeIllnessCount > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={{ fontSize: 12 }}>🤒</Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {child.activeIllnessCount} doenca{child.activeIllnessCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                  ) : null}
                  {child.activeMedCount > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={{ fontSize: 12 }}>💊</Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {child.activeMedCount} med{child.activeMedCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                  ) : null}
                  {child.allergyCount > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                      <Text style={{ fontSize: 12 }}>⚠️</Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {child.allergyCount} alergia{child.allergyCount > 1 ? 's' : ''}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Animated.View>
          );
        })}

        {/* Sub-modules Grid */}
        <Animated.View entering={FadeInDown.delay(250).duration(400)}>
          <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.md }}>
            Modulos
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xl }}>
            {[
              { icon: '⚠️', label: 'Alergias', route: '/saude/alergias', testID: 'saude-mod-alergias' },
              { icon: '💊', label: 'Medicamentos', route: '/saude/medicamentos', testID: 'saude-mod-medicamentos' },
              { icon: '🏥', label: 'Consultas', route: '/saude/consultas', testID: 'saude-mod-consultas' },
              { icon: '💉', label: 'Vacinas', route: '/saude/vacinas', testID: 'saude-mod-vacinas' },
              { icon: '📏', label: 'Crescimento', route: '/saude/crescimento', testID: 'saude-mod-crescimento' },
              { icon: '👨‍⚕️', label: 'Profissionais', route: '/saude/profissionais', testID: 'saude-mod-profissionais' },
              { icon: '🤒', label: 'Doencas', route: '/saude/doencas', testID: 'saude-mod-doencas' },
              { icon: '🩹', label: 'Sintomas', route: '/saude/sintomas', testID: 'saude-mod-sintomas' },
              { icon: '📸', label: 'Receita OCR', route: '/saude/receita', testID: 'saude-mod-receita' },
              { icon: '🚨', label: 'Emergencia', route: '/saude/emergencia', testID: 'saude-mod-emergencia' },
              { icon: '📤', label: 'Exportar', route: '/saude/export', testID: 'saude-mod-exames' },
              { icon: '📋', label: 'Timeline', route: '/saude/timeline', testID: 'saude-mod-timeline' },
            ].map(mod => (
              <TouchableOpacity key={mod.route} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(mod.route as Parameters<typeof router.push>[0]); }}
                testID={mod.testID}
                accessibilityLabel={mod.label}
                style={{ width: '31%', backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: spacing.xs, ...shadows.sm }}>
                <Text style={{ fontSize: 20 }}>{mod.icon}</Text>
                <Text style={{ fontSize: font.sizes.xs, color: colors.text, fontWeight: font.weights.medium, textAlign: 'center' }}>{mod.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* Timeline Header */}
        <Animated.View entering={FadeInDown.delay(300).duration(400)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.md }}>
            <Text style={{ fontSize: font.sizes.xs, fontWeight: font.weights.semibold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>
              Historico
            </Text>
            {timeline.length > 0 ? (
              <TouchableOpacity onPress={() => router.push('/saude/timeline')}>
                <Text style={{ fontSize: font.sizes.xs, color: colors.brand, fontWeight: font.weights.medium }}>
                  Ver tudo
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </Animated.View>

        {/* Timeline Events */}
        {loading && !data ? (
          <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: spacing['4xl'] }}>
            Carregando...
          </Text>
        ) : timeline.length === 0 ? (
          <View style={{
            backgroundColor: colors.bgElevated, borderRadius: radius.xl,
            padding: spacing['3xl'], alignItems: 'center', ...shadows.sm,
          }}>
            <Text style={{ fontSize: 32, marginBottom: spacing.md }}>🩺</Text>
            <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, textAlign: 'center' }}>
              Nenhum registro de saude
            </Text>
            <Text style={{ fontSize: font.sizes.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs }}>
              Toque em {'\u201C'}Registrar{'\u201D'} para adicionar o primeiro evento
            </Text>
          </View>
        ) : (
          timeline.map((event, i) => {
            const cfg = EVENT_ICONS[event.type] || EVENT_ICONS.observation;
            return (
              <Animated.View key={event.id + '-' + i} entering={FadeInDown.delay(350 + i * 30).duration(300)}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/saude/detalhe?id=${event.id}&type=${event.type}`);
                  }}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: 'row', gap: spacing.md,
                    backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                    padding: spacing.lg, marginBottom: spacing.sm,
                    ...shadows.sm,
                  }}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 18,
                    backgroundColor: `${cfg.color}15`,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ fontSize: 16 }}>{cfg.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Text style={{ fontSize: font.sizes.md, fontWeight: font.weights.medium, color: colors.text, flex: 1 }}>
                        {event.title}
                      </Text>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted, marginLeft: spacing.sm }}>
                        {formatRelativeDate(event.date)}
                      </Text>
                    </View>
                    {event.subtitle ? (
                      <Text numberOfLines={1} style={{ fontSize: font.sizes.sm, color: colors.textSecondary, marginTop: 2 }}>
                        {event.subtitle}
                      </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                      <Text style={{ fontSize: font.sizes.xs, color: colors.textMuted }}>
                        {event.childName}
                      </Text>
                      {event.createdByName ? (
                        <Text style={{ fontSize: font.sizes.xs, color: colors.textDim }}>
                          por {event.createdByName}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textDim} style={{ alignSelf: 'center' }} />
                </TouchableOpacity>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
