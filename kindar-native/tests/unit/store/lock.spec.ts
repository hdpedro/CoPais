/**
 * Lock store — testes unitários do invariante de race condition entre
 * o callback do AppState e a Promise do prompt biométrico.
 *
 * O store é JS puro com side effect único em biometric-lock; mockamos
 * o módulo pra controlar o tempo de resolução da Promise e reproduzir
 * a race em ordem determinística.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AuthenticateResult } from '../../../app/_src/services/biometric-lock';

// Controle manual da Promise de autenticação biométrica.
let pendingResolve: ((r: AuthenticateResult) => void) | null = null;
const authenticateMock = vi.fn<(msg?: string) => Promise<AuthenticateResult>>(
  () => new Promise<AuthenticateResult>((resolve) => { pendingResolve = resolve; }),
);

// Mock zero-side-effect do biometric-lock — preserva o tipo.
vi.mock('../../../app/_src/services/biometric-lock', () => ({
  authenticate: (msg?: string) => authenticateMock(msg),
  getBiometricCapability: vi.fn(),
}));

// SecureStore mockado: in-memory KV. Suficiente pro hydrate/setEnabled/setTimeout.
const secureStore = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (k: string) => secureStore.get(k) ?? null),
  setItemAsync: vi.fn(async (k: string, v: string) => { secureStore.set(k, v); }),
}));

// react-native mock: só precisamos de Platform.OS para o gate de SecureStore.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

// error-reporter mock — telemetria via reportError não toca rede nos testes.
vi.mock('../../../app/_src/lib/error-reporter', () => ({
  reportError: vi.fn(),
  installGlobalErrorHandlers: vi.fn(),
}));

// Import depois dos mocks pra garantir que a fábrica zustand pegue os mocks.
async function loadStore() {
  // Reset de módulos isola o estado entre testes (zustand é singleton).
  vi.resetModules();
  pendingResolve = null;
  authenticateMock.mockClear();
  secureStore.clear();
  const mod = await import('../../../app/_src/store/lock');
  return mod.useLock;
}

function resolveAuth(success: boolean, error?: string) {
  if (!pendingResolve) throw new Error('authenticate() não foi chamado ainda');
  const r = pendingResolve;
  pendingResolve = null;
  r(success ? { success: true } : { success: false, error });
}

describe('lock store — invariantes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('hydrate marca isLocked=true quando enabled persistido', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();
    expect(useLock.getState().enabled).toBe(true);
    expect(useLock.getState().isLocked).toBe(true);
    expect(useLock.getState().hydrated).toBe(true);
  });

  test('requestUnlock seta isAuthenticating durante o prompt e limpa em sucesso', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    expect(useLock.getState().isAuthenticating).toBe(true);
    expect(useLock.getState().isLocked).toBe(true); // ainda travado

    resolveAuth(true);
    const r = await p;
    expect(r.success).toBe(true);
    expect(useLock.getState().isLocked).toBe(false);
    expect(useLock.getState().isAuthenticating).toBe(false);
    expect(useLock.getState().lastBackgroundAt).toBeNull();
    expect(useLock.getState().lastUnlockAt).not.toBeNull();
  });

  test('requestUnlock concorrente retorna in_flight sem reabrir prompt', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();

    const p1 = useLock.getState().requestUnlock();
    const p2 = useLock.getState().requestUnlock();
    const r2 = await p2;
    expect(r2).toEqual({ success: false, error: 'in_flight' });
    expect(authenticateMock).toHaveBeenCalledTimes(1);

    resolveAuth(true);
    await p1;
  });

  test('falha no prompt mantém isLocked=true e libera isAuthenticating', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    resolveAuth(false, 'user_cancel');
    const r = await p;
    expect(r).toEqual({ success: false, error: 'user_cancel' });
    expect(useLock.getState().isLocked).toBe(true);
    expect(useLock.getState().isAuthenticating).toBe(false);
  });

  test('markBackground é no-op durante autenticação', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    useLock.getState().markBackground(); // simulação do AppState pisca-pisca
    expect(useLock.getState().lastBackgroundAt).toBeNull();

    resolveAuth(true);
    await p;
    expect(useLock.getState().lastBackgroundAt).toBeNull();
  });

  test('evaluateOnForeground é no-op durante autenticação', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', 'immediate');
    await useLock.getState().hydrate();

    // Cenário: app foi pro background há tempos (manualmente registrado),
    // user desbloqueou, agora está autenticando de novo. Durante o prompt
    // o callback de AppState 'active' não pode forçar isLocked=true.
    useLock.setState({ isLocked: false, lastBackgroundAt: Date.now() - 10_000 });
    const p = useLock.getState().requestUnlock();

    useLock.getState().evaluateOnForeground();
    expect(useLock.getState().isLocked).toBe(false);

    resolveAuth(true);
    await p;
    expect(useLock.getState().isLocked).toBe(false);
  });

  test('RACE: AppState callback chega depois do unlock — não re-trava', async () => {
    // Cenário exato do bug do user: prompt sobe, iOS pisca pra background
    // (markBackground bloqueado pela flag), success resolve unlock, AppState
    // volta pra 'active' e dispara evaluateOnForeground. Sem o fix, o
    // listener calcularia elapsed contra lastBackgroundAt e re-locaria com
    // timeout='immediate'. Com o fix, lastBackgroundAt=null + flag fecharam
    // ambos os caminhos.
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', 'immediate');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    // 1) iOS muda AppState pra background durante o prompt.
    useLock.getState().markBackground();
    // 2) User passa no Face ID.
    resolveAuth(true);
    await p;
    expect(useLock.getState().isLocked).toBe(false);
    expect(useLock.getState().isAuthenticating).toBe(false);

    // 3) AppState volta pra 'active' DEPOIS do unlock — sequência típica
    //    quando a Promise resolve antes do callback do listener.
    useLock.getState().evaluateOnForeground();

    expect(useLock.getState().isLocked).toBe(false); // não re-trava
  });

  test('RACE: variante onde evaluateOnForeground roda antes do finally', async () => {
    // Variante mais sutil: se em algum runtime futuro o finally rodar
    // ASSINCRONAMENTE (microtask diferente), evaluateOnForeground poderia
    // pegar isAuthenticating já false. Defesa em profundidade: o success
    // path zera lastBackgroundAt no MESMO set do isLocked=false, então
    // mesmo um evaluateOnForeground tardio (após o finally) retorna no
    // early-return de lastBackgroundAt==null.
    //
    // 2026-05-17: adicionamos cooldown de 1500ms no markBackground/
    // evaluateOnForeground pós-unlock (defesa contra piscadas do AppState
    // do iOS após Face ID). 2026-05-18: subiu pra 3000ms + grace flag
    // depois que primeira tentativa não resolveu em devices reais.
    // Pra testar o caminho LEGÍTIMO de "background return depois do
    // unlock", simulamos passagem de tempo > 3000ms E consumimos o
    // grace flag com uma transição prévia.
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', 'immediate');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    useLock.getState().markBackground();
    resolveAuth(true);
    await p;

    // Consome o grace flag (primeira transição pós-unlock).
    useLock.getState().markBackground();
    expect(useLock.getState().postUnlockGrace).toBe(false);

    // Avança Date.now em 3.5s pra escapar do cooldown pós-unlock.
    // No real device, esse seria o user efetivamente ficando no outro app
    // por mais que 3s.
    const realNow = Date.now;
    const fakeNow = realNow() + 3500;
    Date.now = () => fakeNow;
    try {
      // Força a condição: flag false (finally rodou), isLocked=false, e
      // simula que lastBackgroundAt foi setado por OUTRO ciclo de
      // background (o user foi pro switcher e voltou depois do unlock).
      // Aqui sim queremos lockar — esse é o caminho correto de "voltou
      // do background com timeout=immediate" APÓS cooldown e grace
      // consumidos.
      useLock.getState().markBackground();
      useLock.getState().evaluateOnForeground();
      expect(useLock.getState().isLocked).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });

  test('COOLDOWN: piscadas do AppState <3000ms pós-unlock não re-lockam (Face ID loop fix 2)', async () => {
    // Cenário: user volta do outro app → desbloqueia → iOS dispara
    // piscadas residuais de AppState (active → background → active) em
    // <3s. SEM cooldown, markBackground populava lastBackgroundAt, e
    // o próximo evaluateOnForeground re-lockava instantaneamente com
    // timeout='immediate'.
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', 'immediate');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    resolveAuth(true);
    await p;
    expect(useLock.getState().isLocked).toBe(false);

    // Sequência de piscadas dentro de 3s — devem ser no-op
    useLock.getState().markBackground();
    expect(useLock.getState().lastBackgroundAt).toBe(null); // não setou
    useLock.getState().evaluateOnForeground();
    expect(useLock.getState().isLocked).toBe(false); // não re-lockou
    useLock.getState().markBackground();
    useLock.getState().evaluateOnForeground();
    expect(useLock.getState().isLocked).toBe(false); // continua destravado
  });

  test('GRACE FLAG: primeira transição pós-unlock é consumida mesmo após cooldown (Face ID loop fix 3)', async () => {
    // Cenário (2026-05-18, descoberto após user reportar loop persistir
    // mesmo com cooldown 1500ms): em devices reais, iOS pode entregar a
    // AppState 'active' do prompt-close > 3s após o Promise resolver,
    // furando o cooldown temporal. O grace flag é defesa em profundidade:
    // garante que pelo menos a PRIMEIRA transição pós-unlock seja absorvida.
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', 'immediate');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    resolveAuth(true);
    await p;
    expect(useLock.getState().isLocked).toBe(false);
    expect(useLock.getState().postUnlockGrace).toBe(true);

    // Avança o tempo PRA ALÉM do cooldown — simula iOS entregando a
    // transição com atraso.
    const realNow = Date.now;
    const fakeNow = realNow() + 5000;
    Date.now = () => fakeNow;
    try {
      // Simula 'background' tardio do prompt-close — mesmo fora do
      // cooldown temporal, o grace flag absorve.
      useLock.getState().markBackground();
      expect(useLock.getState().lastBackgroundAt).toBe(null); // grace consumiu
      expect(useLock.getState().postUnlockGrace).toBe(false); // flag consumido

      // 'active' subsequente — não há lastBackgroundAt setado, retorna early.
      useLock.getState().evaluateOnForeground();
      expect(useLock.getState().isLocked).toBe(false); // não re-lockou
    } finally {
      Date.now = realNow;
    }
  });

  test('GRACE FAILSAFE: flag não fica stuck se nenhum AppState event chegar', async () => {
    // Defesa contra cenário teórico onde AppState callback nunca dispara
    // pós-unlock — o grace flag tem failsafe de 5000ms (vide POST_UNLOCK_GRACE_FAILSAFE_MS).
    // Usa fake timers do vitest pra avançar.
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    resolveAuth(true);
    await p;
    expect(useLock.getState().postUnlockGrace).toBe(true);

    // Avança fake timers pelo failsafe completo.
    await vi.advanceTimersByTimeAsync(6000);
    expect(useLock.getState().postUnlockGrace).toBe(false);
  });

  test('setEnabled(false) destrava imediatamente', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    await useLock.getState().hydrate();
    expect(useLock.getState().isLocked).toBe(true);

    await useLock.getState().setEnabled(false);
    expect(useLock.getState().enabled).toBe(false);
    expect(useLock.getState().isLocked).toBe(false);
  });

  test('timeout immediate: qualquer background tranca; timeout 1m respeita janela', async () => {
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', '1m');
    await useLock.getState().hydrate();
    useLock.setState({ isLocked: false }); // simula já desbloqueado

    // Background há 30s — abaixo do threshold de 1m.
    useLock.setState({ lastBackgroundAt: Date.now() - 30_000 });
    useLock.getState().evaluateOnForeground();
    expect(useLock.getState().isLocked).toBe(false);

    // Background há 70s — passou do threshold.
    useLock.setState({ lastBackgroundAt: Date.now() - 70_000 });
    useLock.getState().evaluateOnForeground();
    expect(useLock.getState().isLocked).toBe(true);
  });
});
