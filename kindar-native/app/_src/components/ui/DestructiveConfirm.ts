/**
 * DestructiveConfirm — Helper pra Alert.alert de operações destrutivas com
 * contexto enriquecido (Stripe/Linear style).
 *
 * Resolve a queixa "não sei o que vai quebrar" antes de apagar.
 *
 * Uso:
 *   const ok = await confirmDestructive({
 *     title: 'Apagar Dra. Marina',
 *     subject: 'Dra. Marina (Pediatra)',
 *     consequences: [
 *       { count: 12, label: 'consultas usam ela como profissional', impact: 'sem-vinculo' },
 *       { count: 3, label: 'receitas registradas por ela', impact: 'preservado' },
 *     ],
 *     destructiveLabel: 'Apagar',
 *   });
 *   if (!ok) return;
 *   await performDelete();
 *
 * Diferença vs Alert.alert direto: monta uma mensagem clara com bullets +
 * indicadores visuais (text-only — Alert nativo não permite views custom)
 * + haptic Warning antes / Success após.
 */
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

export type ImpactKind = 'sem-vinculo' | 'preservado' | 'apagado' | 'cascata';

export interface Consequence {
  count: number;
  /** Texto descritivo. Não inclua o número — o helper monta "X — label". */
  label: string;
  impact: ImpactKind;
}

const IMPACT_BULLET: Record<ImpactKind, string> = {
  'sem-vinculo': '⚠️',
  'preservado': '✓',
  'apagado': '✗',
  'cascata': '⚠️',
};

const IMPACT_SUFFIX: Record<ImpactKind, string> = {
  'sem-vinculo': '— vão ficar sem vínculo',
  'preservado': '— ficam intactos',
  'apagado': '— serão apagados também',
  'cascata': '— afetados em cascata',
};

export interface DestructiveConfirmOptions {
  title: string;
  /** Nome curto do recurso (mostrado no header). Ex: "Dra. Marina". */
  subject?: string;
  /** Bullets de impacto. Vazio = só pergunta confirmação simples. */
  consequences?: Consequence[];
  /** Texto adicional (ex: "Esta ação não pode ser desfeita."). */
  warning?: string;
  /** Label do botão destrutivo. Default "Apagar". */
  destructiveLabel?: string;
  /** Label do botão cancel. Default "Cancelar". */
  cancelLabel?: string;
}

/**
 * Mostra Alert destrutivo com contexto. Resolve `true` se user confirmou,
 * `false` se cancelou.
 */
export function confirmDestructive(opts: DestructiveConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    const parts: string[] = [];
    if (opts.subject) parts.push(opts.subject + '\n');

    if (opts.consequences && opts.consequences.length > 0) {
      const lines = opts.consequences
        .filter(c => c.count > 0)
        .map(c => {
          const bullet = IMPACT_BULLET[c.impact];
          const noun = c.count === 1 ? singularize(c.label) : c.label;
          return `${bullet} ${c.count} ${noun} ${IMPACT_SUFFIX[c.impact]}`;
        });
      if (lines.length > 0) {
        parts.push(lines.join('\n'));
      }
    }

    if (opts.warning) {
      parts.push('\n' + opts.warning);
    } else {
      parts.push('\nEsta ação não pode ser desfeita.');
    }

    const message = parts.join('\n').trim();

    Alert.alert(
      opts.title,
      message,
      [
        {
          text: opts.cancelLabel ?? 'Cancelar',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: opts.destructiveLabel ?? 'Apagar',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            resolve(true);
          },
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Tenta singularizar um substantivo PT-BR. Heurística simples — suficiente
 * pros labels que vamos passar ("consultas", "receitas", "alergias", etc.).
 */
function singularize(noun: string): string {
  // "alergias" → "alergia", "consultas" → "consulta"
  if (noun.endsWith('ias')) return noun.slice(0, -1);
  // "profissionais" → "profissional"
  if (noun.endsWith('ais')) return noun.slice(0, -2) + 'al';
  // "consultas" → "consulta"; "receitas" → "receita"
  if (noun.endsWith('s') && !noun.endsWith('ês')) return noun.slice(0, -1);
  return noun;
}
