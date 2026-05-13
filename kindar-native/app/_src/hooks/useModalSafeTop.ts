/**
 * useModalSafeTop — hook compartilhado pra resolver o bug "status bar do
 * Android sobrepõe header de modal".
 *
 * # O bug
 *
 * `<Modal presentationStyle="pageSheet">` é uma feature iOS-only. No iOS
 * renderiza como page sheet com top inset automático (~50dp). No Android,
 * o `presentationStyle` é ignorado e o modal vira fullscreen — com a
 * status bar TRANSPARENTE SOBRE o conteúdo (consequência de
 * `newArchEnabled: true` + Android 15+ edge-to-edge default).
 *
 * Resultado visual no Android: o relógio do sistema (13:53) e os ícones
 * de status (sinal, bateria, notificações) ficam sobre o "Cancelar",
 * "Título" e "Enviar" do header — usuária Aline reportou 2026-05-13.
 *
 * # A solução
 *
 * Aplicar `paddingTop: insets.top` no header SOMENTE no Android. No iOS
 * o pageSheet já dá o inset visual e `insets.top` retorna ~0 quando
 * renderizado como sheet, então deixar o branch de Platform garante
 * que não temos efeito visual indesejado.
 *
 * # Uso
 *
 * ```tsx
 * import { useModalSafeTopPadding } from '@/hooks/useModalSafeTop';
 *
 * function MyModal() {
 *   const modalTopPadding = useModalSafeTopPadding();
 *   return (
 *     <Modal presentationStyle="pageSheet" ...>
 *       <View style={{ paddingTop: 16 + modalTopPadding }}>
 *         ...header content...
 *       </View>
 *     </Modal>
 *   );
 * }
 * ```
 *
 * # Migração dos 28 modais existentes
 *
 * Cada modal pode adotar conforme for revisitado. Lista mantida em
 * .claude/CLAUDE.md "Android edge-to-edge modal fix". Não há urgência
 * em migrar todos ao mesmo tempo — modais que o user nunca abre podem
 * ficar com o bug original sem impacto perceptível.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Retorna o paddingTop adicional pra cobrir a status bar do Android em
 * modais. Zero no iOS (pageSheet já cobre). Use como `+ this` no header.
 */
export function useModalSafeTopPadding(): number {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'android' ? insets.top : 0;
}
