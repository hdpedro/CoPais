/**
 * Reusable screen header with back button and optional action.
 *
 * Acessibilidade (Regra 18 das Regras Canônicas):
 *  - Botão back tem `accessibilityRole="button"` + label `common.back`.
 *  - Ação direita aceita `accessibilityLabel` opcional (recomendado quando
 *    o ícone não é auto-explicativo: `add`/`close`/`share-outline` etc).
 *  - O `<Text>` do título é `accessibilityRole="header"` pra que screen
 *    readers (VoiceOver/TalkBack) anunciem como cabeçalho.
 *  - Tap targets ≥ 44pt via `hitSlop={12}` (paddingless TouchableOpacity).
 *
 * i18n (Regras Canônicas 1, 6):
 *  - `common.back` é o label fixo do botão voltar.
 *  - Quando o caller não passa `accessibilityLabel` para a `rightAction`,
 *    derivamos do ícone via `ui.a11y.iconDefault.*` em todos os 5 locales.
 */

import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, font } from '../../design-system/tokens';
import { useI18n } from '../../i18n';

interface ScreenHeaderRightAction {
  icon: string;
  onPress: () => void;
  /** Label pra screen readers. Default deriva do ícone via i18n. */
  accessibilityLabel?: string;
  /** Dica adicional pra screen readers (ex: "Abre formulário"). */
  accessibilityHint?: string;
}

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  rightAction?: ScreenHeaderRightAction;
}

// Mapeia o ícone Ionicon para a chave i18n de label default. Quando o caller
// não passa label próprio, este mapa resolve uma chave; a string em si vive
// em ui.a11y.iconDefault.* nos 5 locales.
const ICON_LABEL_KEYS: Record<string, string> = {
  add: 'add',
  close: 'close',
  'share-outline': 'share',
  share: 'share',
  pencil: 'edit',
  'pencil-outline': 'edit',
  'create-outline': 'edit',
  trash: 'delete',
  'trash-outline': 'delete',
  'ellipsis-horizontal': 'more',
  'ellipsis-vertical': 'more',
  'settings-outline': 'settings',
  'help-circle-outline': 'help',
};

export default function ScreenHeader({ title, showBack = true, rightAction }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const t = useI18n((s) => s.t);
  const rightLabel = rightAction
    ? (rightAction.accessibilityLabel
        ?? t(`ui.a11y.iconDefault.${ICON_LABEL_KEYS[rightAction.icon] ?? 'action'}`))
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
          accessibilityLabel={t('common.back')}
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
