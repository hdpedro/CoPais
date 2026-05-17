/**
 * ModalBackdrop — Wrapper que adiciona tap-outside-to-close em <Modal>.
 *
 * O <Modal> nativo do RN não fecha quando user toca no backdrop semi-transparente.
 * Padrão iOS é fechar. Este wrapper resolve.
 *
 * Uso:
 *   <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
 *     <ModalBackdrop onClose={close}>
 *       <YourContent /> {/* não fecha quando toca dentro *\/}
 *     </ModalBackdrop>
 *   </Modal>
 *
 * Decisões:
 *  - `transparent` no <Modal> é obrigatório (senão backdrop não aparece).
 *  - Conteúdo é renderizado dentro de um Pressable que stop-propagation
 *    (toques dentro não fecham).
 *  - Backdrop tem rgba(0,0,0,0.5) por default — configurável via `dim`.
 *  - Alinhamento: por default conteúdo é centralizado vertical/horizontal.
 *    `align="bottom"` puxa pro rodapé (action sheets); `align="top"` mantém
 *    no topo (dropdown).
 *  - `accessibilityViewIsModal=true` no conteúdo pra screen reader.
 *  - hardware-back no Android (`onRequestClose` é wired pelo caller).
 */
import { ReactNode } from 'react';
import { Pressable, View, ViewStyle, KeyboardAvoidingView, Platform } from 'react-native';
import { useI18n } from '../../i18n';

interface ModalBackdropProps {
  children: ReactNode;
  onClose: () => void;
  /** Opacidade do backdrop. Default 0.5. */
  dim?: number;
  /** Posição vertical do conteúdo. Default "center". */
  align?: 'center' | 'top' | 'bottom';
  /** Padding horizontal interno. Default 16. */
  padding?: number;
  /** Permite que o backdrop feche. Default true. Pass false pra modais críticos
   *  (delete confirm, pricing) onde acidente custa caro. */
  tapToClose?: boolean;
  /** Estilo extra do container do conteúdo. */
  contentStyle?: ViewStyle;
  /** Override do a11y label do backdrop (padrão `common.close` no locale ativo). */
  closeAccessibilityLabel?: string;
}

export default function ModalBackdrop({
  children,
  onClose,
  dim = 0.5,
  align = 'center',
  padding = 16,
  tapToClose = true,
  contentStyle,
  closeAccessibilityLabel,
}: ModalBackdropProps) {
  const justify = align === 'top' ? 'flex-start' : align === 'bottom' ? 'flex-end' : 'center';
  const t = useI18n((s) => s.t);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <Pressable
        accessibilityLabel={closeAccessibilityLabel ?? t('common.close')}
        accessibilityRole="button"
        onPress={tapToClose ? onClose : undefined}
        style={{
          flex: 1,
          backgroundColor: `rgba(0,0,0,${dim})`,
          justifyContent: justify,
          alignItems: 'center',
          paddingHorizontal: padding,
        }}
      >
        <Pressable
          // stop-propagation: tap dentro do conteúdo NÃO fecha
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
          style={[{ width: '100%' }, contentStyle]}
        >
          {children}
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  );
}
