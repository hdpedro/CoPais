import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useI18n } from 'src/i18n';
import { colors, spacing, radius, font, shadows } from 'src/design-system/tokens';

interface ModuleItem {
  icon: string;
  /** i18n key relative to `more.*` namespace */
  labelKey: string;
  route: string;
  color: string;
}

// All routes now point to NATIVE screens (no more /web/).
// Despesas removida — agora vive dentro de Financeiro ("Ver despesas").
const MODULES: ModuleItem[] = [
  { icon: '💰', labelKey: 'more.financial', route: '/financeiro', color: '#E8A228' },
  { icon: '❤️', labelKey: 'more.health', route: '/(tabs)/saude', color: '#E53935' },
  { icon: '📄', labelKey: 'more.documents', route: '/documentos', color: '#3b82f6' },
  { icon: '🎯', labelKey: 'more.events', route: '/eventos', color: '#D4735A' },
  { icon: '📋', labelKey: 'more.activities', route: '/atividades', color: '#5B9E85' },
  { icon: '🤝', labelKey: 'more.agreements', route: '/acordos', color: '#7C6FAE' },
  { icon: '🗳️', labelKey: 'more.decisions', route: '/decisoes', color: '#3b82f6' },
  { icon: '👶', labelKey: 'more.children', route: '/criancas', color: '#E8A228' },
  { icon: '🏫', labelKey: 'more.school', route: '/escola', color: '#5B9E85' },
  { icon: '🔒', labelKey: 'more.sensitive', route: '/temas-sensiveis', color: '#8A8A8A' },
  { icon: '📝', labelKey: 'more.notes', route: '/notas', color: '#E8A228' },
  { icon: '✅', labelKey: 'more.checkin', route: '/checkin', color: '#4CAF50' },
  { icon: '📅', labelKey: 'more.semana', route: '/semana', color: '#3b82f6' },
  { icon: '👨‍👩‍👧', labelKey: 'more.family', route: '/familia', color: '#7C6FAE' },
  { icon: '👤', labelKey: 'more.profile', route: '/perfil', color: '#2C2C2C' },
];

export default function MaisScreen() {
  const t = useI18n(s => s.t);
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120, paddingHorizontal: spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        accessibilityRole="header"
        style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, marginBottom: spacing['2xl'] }}
      >
        {t('more.title')}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {MODULES.map((mod, i) => {
          const label = t(mod.labelKey);
          return (
            <Animated.View
              key={mod.route}
              entering={FadeInDown.delay(i * 30).duration(300)}
              style={{ width: '30%' }}
            >
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(mod.route as Parameters<typeof router.push>[0]);
                }}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={label}
                accessibilityHint={t('more.openModule', { label })}
                style={{
                  backgroundColor: colors.bgElevated, borderRadius: radius.lg,
                  padding: spacing.lg, alignItems: 'center', gap: spacing.sm,
                  ...shadows.sm,
                }}
              >
                <View style={{
                  width: 40, height: 40, borderRadius: 12,
                  backgroundColor: `${mod.color}15`,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ fontSize: 20 }}>{mod.icon}</Text>
                </View>
                <Text style={{
                  fontSize: font.sizes.xs, fontWeight: font.weights.medium,
                  color: colors.text, textAlign: 'center',
                }} numberOfLines={1}>
                  {label}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </ScrollView>
  );
}
