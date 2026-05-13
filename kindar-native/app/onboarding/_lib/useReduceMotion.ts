import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Lê a preferência "Reduzir movimento" do SO. Verdadeiro quando o usuário
 * tem essa acessibilidade habilitada (iOS / Android) — use pra suprimir
 * animações decorativas (sparkles, pop) e cair em transições neutras.
 *
 * O valor inicial vem da API assíncrona `isReduceMotionEnabled` e atualiza
 * via listener `reduceMotionChanged` se o usuário alterar enquanto o app
 * estiver aberto.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduce(enabled);
    }).catch(() => {
      // Plataforma sem suporte — assume motion habilitado (default).
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return reduce;
}
