import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Brand colors inlined to bypass an EAS-side eager-bundle resolver bug
// that fails to resolve "../../src/design-system/tokens" from this file
// even though the file exists in the upload (local bundle works fine).
// Keep in sync with src/design-system/tokens.ts.
const colors = {
  brand: '#5B9E85',
  // Brand at ~16% alpha — Material Design 3 "secondary container" tom usado
  // como background do pill ativo. Bate visualmente com brandLight do design
  // system, mas inline aqui pelo mesmo motivo dos hardcodes acima.
  brandSoft: 'rgba(91,158,133,0.16)',
  textMuted: 'rgba(44,44,44,0.5)',
};

/**
 * MD3 Active Indicator pattern: pill de 56×32dp atrás do ícone do tab
 * focado. Spec ref: https://m3.material.io/components/navigation-bar/specs.
 *
 * Não fazemos label-styling diferente por focused (já há tint color via
 * tabBarActiveTintColor), porque o pill já é discriminator suficiente.
 */
type IconName = 'home' | 'calendar' | 'chatbubble' | 'pulse' | 'grid';
function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  return (
    <View
      style={{
        width: 56,
        height: 32,
        borderRadius: 16,
        backgroundColor: focused ? colors.brandSoft : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons
        name={(focused ? name : `${name}-outline`) as keyof typeof Ionicons.glyphMap}
        size={24}
        color={color}
      />
    </View>
  );
}

export default function TabLayout() {
  // Android edge-to-edge (newArchEnabled + Android 15+ default) faz a nav
  // bar do sistema ficar TRANSPARENTE SOBRE o conteúdo. Sem consumir
  // insets.bottom, a tab bar fica atrás dos gestos/botões do sistema:
  // usuário Aline 2026-05-13 não conseguia clicar nas tabs centrais
  // porque o gesture bar e o recents button do Android estavam sobrepondo
  // "Calendário" e "Chat". Fix: somar insets.bottom à altura E ao paddingBottom.
  // iOS já estava OK (paddingBottom: 28 cobria o Home Indicator por sorte) —
  // não tocar pra evitar regressão.
  const insets = useSafeAreaInsets();
  const tabBarHeight = Platform.OS === 'ios' ? 88 : 64 + insets.bottom;
  const paddingBottom = Platform.OS === 'ios' ? 28 : insets.bottom + 6;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(255,255,255,0.80)',
          borderTopColor: 'rgba(0,0,0,0.04)',
          borderTopWidth: 0.5,
          height: tabBarHeight,
          paddingBottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          // 11 = compromise entre 10sp (compacto) e 12sp (MD3 spec).
          // Melhora acessibilidade pra usuários com vista reduzida sem
          // esticar a barra além do necessário.
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="home" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendario"
        options={{
          title: 'Calendário',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="calendar" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="chatbubble" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="saude"
        options={{
          title: 'Saúde',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="pulse" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="mais"
        options={{
          title: 'Mais',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="grid" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
