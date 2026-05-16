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
    const useLock = await loadStore();
    secureStore.set('kindar_lock_enabled', '1');
    secureStore.set('kindar_lock_timeout', 'immediate');
    await useLock.getState().hydrate();

    const p = useLock.getState().requestUnlock();
    useLock.getState().markBackground();
    resolveAuth(true);
    await p;

    // Força a condição: flag false (finally rodou), isLocked=false, e
    // simula que lastBackgroundAt foi setado por OUTRO ciclo de
    // background (o user foi pro switcher e voltou depois do unlock).
    // Aqui sim queremos lockar — esse é o caminho correto de "voltou
    // do background com timeout=immediate".
    useLock.getState().markBackground();
    useLock.getState().evaluateOnForeground();
    expect(useLock.getState().isLocked).toBe(true);
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
