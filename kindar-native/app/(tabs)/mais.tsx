import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colors, spacing, radius, font, shadows } from './_tokens';

interface ModuleItem {
  icon: string;
  label: string;
  route: string;
  color: string;
}

// All routes now point to NATIVE screens (no more /web/).
// Despesas removida — agora vive dentro de Financeiro ("Ver despesas").
const MODULES: ModuleItem[] = [
  { icon: '💰', label: 'Financeiro', route: '/financeiro', color: '#E8A228' },
  { icon: '❤️', label: 'Saúde', route: '/(tabs)/saude', color: '#E53935' },
  { icon: '📄', label: 'Documentos', route: '/documentos', color: '#3b82f6' },
  { icon: '🎯', label: 'Eventos', route: '/eventos', color: '#D4735A' },
  { icon: '📋', label: 'Atividades', route: '/atividades', color: '#5B9E85' },
  { icon: '🤝', label: 'Acordos', route: '/acordos', color: '#7C6FAE' },
  { icon: '🗳️', label: 'Decisões', route: '/decisoes', color: '#3b82f6' },
  { icon: '👶', label: 'Crianças', route: '/criancas', color: '#E8A228' },
  { icon: '🏫', label: 'Escola', route: '/escola', color: '#5B9E85' },
  { icon: '🔒', label: 'Temas Sensíveis', route: '/temas-sensiveis', color: '#8A8A8A' },
  { icon: '📝', label: 'Notas', route: '/notas', color: '#E8A228' },
  { icon: '✅', label: 'Check-in', route: '/checkin', color: '#4CAF50' },
  { icon: '📅', label: 'Semana', route: '/semana', color: '#3b82f6' },
  { icon: '👨‍👩‍👧', label: 'Família', route: '/familia', color: '#7C6FAE' },
  { icon: '👤', label: 'Perfil', route: '/perfil', color: '#2C2C2C' },
];

export default function MaisScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingBottom: 120, paddingHorizontal: spacing.lg }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={{ fontSize: font.sizes['2xl'], fontWeight: font.weights.extrabold, color: colors.text, marginBottom: spacing['2xl'] }}>
        Mais
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {MODULES.map((mod, i) => (
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
                {mod.label}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>
    </ScrollView>
  );
}
