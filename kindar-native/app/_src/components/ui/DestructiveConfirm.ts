/**
 * DestructiveConfirm — Helper pra Alert.alert de operações destrutivas com
 * contexto enriquecido (Stripe/Linear style).
 *
 * Resolve a queixa "não sei o que vai quebrar" antes de apagar.
 *
 * Uso:
 *   const ok = await confirmDestructive({
 *     title: t('saude.professionals.removeTitle', { name: 'Dra. Marina' }),
 *     subject: 'Dra. Marina (Pediatra)',
 *     consequences: [
 *       {
 *         count: 12,
 *         label: t('saude.professionals.consequences.appointmentsOther'),
 *         labelSingular: t('saude.professionals.consequences.appointmentsOne'),
 *         impact: 'sem-vinculo',
 *       },
 *     ],
 *     destructiveLabel: t('action.delete'),
 *   });
 *   if (!ok) return;
 *   await performDelete();
 *
 * Diferença vs Alert.alert direto: monta uma mensagem clara com bullets +
 * indicadores visuais (text-only — Alert nativo não permite views custom)
 * + haptic Warning antes / Success após.
 *
 * i18n (Regras Canônicas 1, 6, 7):
 *  - `DestructiveConfirm` é um módulo TS puro (sem hooks). Pode ser chamado de
 *    qualquer lugar, inclusive fora de árvore React.
 *  - Por isso, os defaults (label do botão destrutivo / cancelar / warning /
 *    sufixos de impacto) usam o `useI18n` store direto (`getState()`),
 *    consultado no momento da chamada. Isso respeita o locale ativo sem
 *    forçar callers a passarem `t`.
 *  - Caller pode sempre OVERRIDE qualquer string (destructiveLabel,
 *    cancelLabel, warning) com sua própria t-traduzida.
 *  - Plural do `count` agora é resolvido por `labelSingular` OPCIONAL no
 *    `Consequence`. Quando o caller passa ambos, count===1 usa singular
 *    e count≥2 usa `label`. Pra back-compat, callers antigos que só passam
 *    `label` caem na heurística PT-BR `singularize()` — i18n incompleta
 *    nesses callsites mas não quebra produção.
 */
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useI18n } from '../../i18n';

export type ImpactKind = 'sem-vinculo' | 'preservado' | 'apagado' | 'cascata';

export interface Consequence {
  count: number;
  /** Texto descritivo plural. Não inclua o número — o helper monta "X — label". */
  label: string;
  /** Forma singular pro caso count===1. Quando omitido, cai na heurística
   *  `singularize()` PT-BR (debt — preferir sempre passar). */
  labelSingular?: string;
  impact: ImpactKind;
}

const IMPACT_BULLET: Record<ImpactKind, string> = {
  'sem-vinculo': '⚠️',
  'preservado': '✓',
  'apagado': '✗',
  'cascata': '⚠️',
};

const IMPACT_SUFFIX_KEY: Record<ImpactKind, string> = {
  'sem-vinculo': 'ui.destructiveConfirm.impactSuffixSemVinculo',
  'preservado': 'ui.destructiveConfirm.impactSuffixPreservado',
  'apagado': 'ui.destructiveConfirm.impactSuffixApagado',
  'cascata': 'ui.destructiveConfirm.impactSuffixCascata',
};

export interface DestructiveConfirmOptions {
  title: string;
  /** Nome curto do recurso (mostrado no header). Ex: "Dra. Marina". */
  subject?: string;
  /** Bullets de impacto. Vazio = só pergunta confirmação simples. */
  consequences?: Consequence[];
  /** Texto adicional. Default `ui.destructiveConfirm.defaultWarning` no locale ativo. */
  warning?: string;
  /** Label do botão destrutivo. Default `ui.destructiveConfirm.destructiveLabel`. */
  destructiveLabel?: string;
  /** Label do botão cancel. Default `common.cancel`. */
  cancelLabel?: string;
}

/**
 * Mostra Alert destrutivo com contexto. Resolve `true` se user confirmou,
 * `false` se cancelou.
 */
export function confirmDestructive(opts: DestructiveConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // Snapshot do `t` no momento da chamada — usar getState() em vez de hook
    // porque essa função é chamada de event handlers, não de React tree.
    const t = useI18n.getState().t;

    const parts: string[] = [];
    if (opts.subject) parts.push(opts.subject + '\n');

    if (opts.consequences && opts.consequences.length > 0) {
      const lines = opts.consequences
        .filter(c => c.count > 0)
        .map(c => {
          const bullet = IMPACT_BULLET[c.impact];
          const noun = c.count === 1
            ? (c.labelSingular ?? singularize(c.label))
            : c.label;
          const suffix = t(IMPACT_SUFFIX_KEY[c.impact]);
          return `${bullet} ${c.count} ${noun} ${suffix}`;
        });
      if (lines.length > 0) {
        parts.push(lines.join('\n'));
      }
    }

    if (opts.warning) {
      parts.push('\n' + opts.warning);
    } else {
      parts.push('\n' + t('ui.destructiveConfirm.defaultWarning'));
    }

    const message = parts.join('\n').trim();

    Alert.alert(
      opts.title,
      message,
      [
        {
          text: opts.cancelLabel ?? t('common.cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: opts.destructiveLabel ?? t('ui.destructiveConfirm.destructiveLabel'),
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
 * Tenta singularizar um substantivo PT-BR. Heurística simples — fallback
 * pra callers que ainda não passam `labelSingular` explícito. Funciona pros
 * labels que vamos passar ("consultas", "receitas", "alergias", etc.) mas
 * só em pt-BR — outras línguas ficam com a forma plural mesmo se count===1.
 *
 * @deprecated callsites devem passar `labelSingular` no `Consequence`.
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
