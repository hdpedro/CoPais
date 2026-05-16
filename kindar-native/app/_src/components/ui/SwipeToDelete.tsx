/**
 * SwipeToDelete — gesto nativo iOS (deslizar pra esquerda) revela "Apagar".
 *
 * Substitui o pattern `onLongPress={() => Alert.alert('Apagar?')}` que era
 * UX escondida (usuário não descobre) e perigosa (long-press acidental
 * apagava sem aviso visível). Swipe é o padrão iOS Mail/Notes/Messages —
 * usuários esperam isso em listas.
 *
 * Decisões consolidadas:
 *  - Threshold de 80px (curto) pra revelar — barato de descobrir.
 *  - "Auto-close" no tap fora ou após onDelete.
 *  - Haptic Medium ao revelar; Heavy ao confirmar.
 *  - Action vermelha (`colors.error`) + label "Apagar" + ícone trash.
 *  - Confirmação opcional via `confirmTitle` / `confirmMessage` (default off:
 *    se item é catalog-like sem perda real, swipe direto apaga; pra
 *    registros médicos sempre confirmar).
 *  - Suporta `rightAction` extra ("Editar") opcional via prop, mostra
 *    botão azul antes do vermelho.
 *
 * Uso:
 *   <SwipeToDelete onDelete={() => handleDelete(item.id)} confirmMessage="Apagar...">
 *     <YourRowComponent />
 *   </SwipeToDelete>
 */
import { ReactNode } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { colors, spacing, radius, font } from '../../design-system/tokens';

interface SwipeToDeleteProps {
  children: ReactNode;
  onDelete: () => void;
  /** Mostra Alert antes de chamar onDelete. Default: confirma sempre. */
  confirmTitle?: string;
  confirmMessage?: string;
  /** Texto do botão. Default "Apagar". */
  deleteLabel?: string;
  /** Adiciona ação secundária (Editar) à esquerda do botão Apagar. */
  onEdit?: () => void;
  editLabel?: string;
  /** Desabilita swipe (ex: enquanto submitting). */
  disabled?: boolean;
}

export default function SwipeToDelete({
  children,
  onDelete,
  confirmTitle = 'Apagar registro',
  confirmMessage = 'Esta ação não pode ser desfeita. Deseja continuar?',
  deleteLabel = 'Apagar',
  onEdit,
  editLabel = 'Editar',
  disabled = false,
}: SwipeToDeleteProps) {
  function handleDelete(close: () => void) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      confirmTitle,
      confirmMessage,
      [
        { text: 'Cancelar', style: 'cancel', onPress: () => close() },
        {
          text: deleteLabel,
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            close();
            onDelete();
          },
        },
      ],
    );
  }

  function handleEdit(close: () => void) {
    if (!onEdit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    close();
    onEdit();
  }

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={(_progress, drag, swipeable) => (
        <RightActions
          drag={drag}
          onDelete={() => handleDelete(() => swipeable.close())}
          onEdit={onEdit ? () => handleEdit(() => swipeable.close()) : undefined}
          deleteLabel={deleteLabel}
          editLabel={editLabel}
        />
      )}
      onSwipeableWillOpen={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

function RightActions({
  drag,
  onDelete,
  onEdit,
  deleteLabel,
  editLabel,
}: {
  drag: SharedValue<number>;
  onDelete: () => void;
  onEdit?: () => void;
  deleteLabel: string;
  editLabel: string;
}) {
  // Largura combinada das ações depende de ter Edit ou não.
  const widthPerAction = 84;
  const totalWidth = onEdit ? widthPerAction * 2 : widthPerAction;

  const animatedStyle = useAnimatedStyle(() => {
    // drag vai negativo (esq) — translateX = totalWidth + drag (vai pra zero).
    const translateX = drag.value + totalWidth;
    return { transform: [{ translateX }] };
  });

  return (
    <Reanimated.View style={[{ flexDirection: 'row', width: totalWidth }, animatedStyle]}>
      {onEdit ? (
        <TouchableOpacity
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={editLabel}
          style={{
            width: widthPerAction,
            backgroundColor: colors.brand,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Ionicons name="pencil" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
            {editLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={deleteLabel}
        style={{
          width: widthPerAction,
          backgroundColor: colors.error,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
          // Quando é a primeira/única ação, herda o radius do card pra não
          // ficar quina dura na ponta.
          borderTopRightRadius: radius.lg,
          borderBottomRightRadius: radius.lg,
        }}
      >
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontSize: font.sizes.xs, fontWeight: font.weights.semibold }}>
          {deleteLabel}
        </Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// Re-export pra casos avançados (caller quer fechar manualmente após action).
export type { SwipeableMethods };
