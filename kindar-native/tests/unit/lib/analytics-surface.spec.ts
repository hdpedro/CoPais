/**
 * analytics — surface contract test.
 *
 * Por que esse teste existe:
 *
 *   Em 2026-05-22 um refactor do soft prompt iOS introduziu chamadas a
 *   `analytics.capture(...)` em `app/_layout.tsx`. A função exportada é
 *   `track(...)`, então `analytics.capture` era `undefined` sob
 *   `import * as analytics`. O TypeError silencioso quebrou o handler
 *   `handleSoftPromptAccept` antes da chamada crítica a
 *   `registerForPushNotificationsAsync({ forceRequest: true })`. Resultado:
 *   ZERO `apns_token` em produção (Supabase `jquaysfeeuwvoydsgssi`) entre
 *   2026-05-22 e o fix de 2026-05-25 — nenhum user iOS recebia push.
 *
 *   tsc teria pegado, mas o native nunca rodou typecheck em CI (workflow
 *   `typecheck.yml` exclui kindar-native explicitamente). Este teste é a
 *   linha de defesa que NÃO depende de `tsc --noEmit` para travar
 *   regressões equivalentes.
 *
 * Contrato:
 *   - A superfície pública de `analytics` exporta SOMENTE as funções de
 *     comportamento listadas em EXPECTED_FUNCTIONS abaixo + o catálogo
 *     EVENTS + tipo EventName + getAnalyticsClient.
 *   - Em particular: `capture` NÃO deve existir como export — esse foi o
 *     typo da regressão histórica. Adicionar `capture` reintroduziria a
 *     mesma pegadinha em qualquer lugar que faça `import * as analytics`.
 *   - Eventos novos críticos (soft prompt + push register) precisam estar
 *     no catálogo — sem isso, callers que rodam `tsc --noEmit` vão receber
 *     `Type X is not assignable to EventName`, falhando rápido.
 *
 * Se você QUISER intencionalmente adicionar `capture` como alias de
 * `track`, atualize este teste e documente o motivo no commit. A intenção
 * aqui é deixar o reviewer parar e pensar antes de reintroduzir o nome
 * que já causou um incidente.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

// `react-native` traz Flow syntax e quebra o parser do Rolldown/Vite — o
// mesmo padrão usado em `lock-telemetry.spec.ts`. Mockamos só Platform
// porque é tudo que `analytics.ts` consome do RN. PostHog é mockado
// como classe vazia pra `new PostHog(...)` não estourar.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
vi.mock('posthog-react-native', () => ({
  default: class PostHogMock {
    register() {}
    identify() {}
    capture() {}
    reset() {}
  },
}));

type AnalyticsModule = typeof import('../../../app/_src/lib/analytics');
let analytics: AnalyticsModule;

beforeAll(async () => {
  analytics = await import('../../../app/_src/lib/analytics');
});

afterAll(() => {
  vi.doUnmock('react-native');
  vi.doUnmock('posthog-react-native');
});

const EXPECTED_FUNCTIONS = [
  'initAnalytics',
  'getAnalyticsClient',
  'track',
  'identify',
  'reset',
] as const;

const FORBIDDEN_EXPORTS = [
  'capture', // bug histórico 2026-05-22 — vide cabeçalho.
] as const;

const CRITICAL_EVENTS_IN_CATALOG = [
  'soft_prompt_shown',
  'soft_prompt_accepted',
  'soft_prompt_declined',
  'soft_prompt_outcome',
  'push_token_obtained',
  'push_token_empty',
  'push_token_obtain_failed',
  'push_token_register_succeeded',
  'push_token_register_failed',
] as const;

describe('analytics — superfície pública', () => {
  test.each(EXPECTED_FUNCTIONS)('exporta função "%s"', (name) => {
    expect(typeof (analytics as unknown as Record<string, unknown>)[name]).toBe('function');
  });

  test.each(FORBIDDEN_EXPORTS)('NÃO exporta "%s" (regressão histórica)', (name) => {
    expect((analytics as unknown as Record<string, unknown>)[name]).toBeUndefined();
  });

  test('exporta catálogo EVENTS como objeto não-vazio', () => {
    expect(typeof analytics.EVENTS).toBe('object');
    expect(Object.keys(analytics.EVENTS).length).toBeGreaterThan(20);
  });

  test.each(CRITICAL_EVENTS_IN_CATALOG)(
    'evento crítico "%s" está no catálogo EVENTS',
    (eventName) => {
      const values = Object.values(analytics.EVENTS) as string[];
      expect(values).toContain(eventName);
    },
  );
});
