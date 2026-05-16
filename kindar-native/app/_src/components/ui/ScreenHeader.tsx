/**
 * Reusable screen header with back button and optional action.
 *
 * Acessibilidade (Regra 18 das Regras Canônicas):
 *  - Botão back tem `accessibilityRole="button"` + label "Voltar".
 *  - Ação direita aceita `accessibilityLabel` opcional (recomendado quando
 *    o ícone não é auto-explicativo: `add`/`close`/`share-outline` etc).
 *  - O `<Text>` do título é `accessibilityRole="header"` pra que screen
 *    readers (VoiceOver/TalkBack) anunciem como cabeçalho.
 *  - Tap targets ≥ 44pt via `hitSlop={12}` (paddingless TouchableOpacity).
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, font } from '../../design-system/tokens';

interface ScreenHeaderRightAction {
  icon: string;
  onPress: () => void;
  /** Label pra screen readers. Default deriva do ícone (add → "Adicionar"). */
  accessibilityLabel?: string;
  /** Dica adicional pra screen readers (ex: "Abre formulário"). */
  accessibilityHint?: string;
}

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: ScreenHeaderRightAction;
}

const ICON_LABEL_DEFAULTS: Record<string, string> = {
  add: 'Adicionar',
  close: 'Fechar',
  'share-outline': 'Compartilhar',
  share: 'Compartilhar',
  'pencil': 'Editar',
  'pencil-outline': 'Editar',
  'create-outline': 'Editar',
  'trash': 'Apagar',
  'trash-outline': 'Apagar',
  'ellipsis-horizontal': 'Mais ações',
  'ellipsis-vertical': 'Mais ações',
  'settings-outline': 'Configurações',
  'help-circle-outline': 'Ajuda',
};

export default function ScreenHeader({ title, showBack = true, rightAction }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const rightLabel = rightAction
    ? (rightAction.accessibilityLabel ?? ICON_LABEL_DEFAULTS[rightAction.icon] ?? 'Ação')
    : '';

  return (
    <View style={{
      paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md,
      paddingHorizontal: spacing.lg, backgroundColor: colors.bgElevated,
      borderBottomWidth: 0.5, borderBottomColor: colors.borderLight,
      flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    }}>
      {showBack ? (
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <Text
        accessibilityRole="header"
        style={{ fontSize: font.sizes.lg, fontWeight: font.weights.semibold, color: colors.text, flex: 1 }}
      >
        {title}
      </Text>
      {rightAction ? (
        <TouchableOpacity
          onPress={rightAction.onPress}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={rightLabel}
          accessibilityHint={rightAction.accessibilityHint}
        >
          <Ionicons name={rightAction.icon as keyof typeof Ionicons.glyphMap} size={22} color={colors.brand} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
