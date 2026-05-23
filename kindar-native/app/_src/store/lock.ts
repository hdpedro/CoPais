/**
 * Lock Store — Kindar Native
 *
 * Estado e preferencias de bloqueio biometrico (Face ID / Touch ID).
 * Padrao: WhatsApp/1Password/Apps bancarios.
 *
 * Persistencia: SecureStore (encrypted at rest, igual ao Keychain do iOS).
 * NAO usamos AsyncStorage aqui — preferencia de seguranca fica em
 * keystore criptografado pra evitar tampering em devices comprometidos.
 *
 * Estado runtime (isLocked, lastUnlockAt) NAO persiste — em cold start
 * o app sempre comeca bloqueado se enabled=true (igual WhatsApp).
 *
 * Timeouts:
 * - immediate: bloqueia toda vez que sai do foreground
 * - 1m / 15m / 1h: graca period antes de pedir biometria de novo
 *
 * AppState 'background' SEMPRE registra timestamp pra calculo do timeout
 * E imediatamente esconde a UI (privacy mode no app switcher).
 */

import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { authenticate as biometricAuthenticate, type AuthenticateResult } from '../services/biometric-lock';
import { logLockTelemetry } from '../lib/lock-telemetry';

/**
 * Cooldown pós-unlock — janela em que markBackground e evaluateOnForeground
 * são no-op pra absorver AppState piscadas tardias do iOS após Face ID
 * (2026-05-17: subido pra 3000ms depois que 1500ms se mostrou insuficiente
 * em devices reais). Compatível com fluxo legítimo "voltei do app e
 * desbloqueei — agora vou genuinamente pra outro app de novo": qualquer
 * background dentro de 3s vai ser ignorado, mas o próximo background fora
 * dessa janela bloqueia normalmente.
 */
const POST_UNLOCK_COOLDOWN_MS = 3000;

/**
 * Failsafe pra limpar `postUnlockGrace` se nenhum AppState event chegar
 * pra consumir o flag (cenário teórico improvável mas defensivo).
 */
const POST_UNLOCK_GRACE_FAILSAFE_MS = 5000;

/**
 * Telemetria opt-in pro diagnóstico do Face ID loop em produção.
 * Filtragem por volume centralizada em lock-telemetry.ts (eventos de
 * transição esperada silenciados quando LOCK_VERBOSE=false; decisões raras
 * preservadas). Discord notify ignora 'info' — sem ruído no canal.
 */
const logLockEvent = (event: string, extra?: Record<string, unknown>): void =>
  logLockTelemetry('lock', event, extra);

const KEY_ENABLED = 'kindar_lock_enabled';
const KEY_TIMEOUT = 'kindar_lock_timeout';

export type LockTimeout = 'immediate' | '1m' | '15m' | '1h';

const TIMEOUT_MS: Record<LockTimeout, number> = {
  immediate: 0,
  '1m': 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

export const TIMEOUT_LABELS: Record<LockTimeout, string> = {
  immediate: 'Imediatamente',
  '1m': 'Apos 1 minuto',
  '15m': 'Apos 15 minutos',
  '1h': 'Apos 1 hora',
};

interface LockState {
  // Preferencias persistidas
  enabled: boolean;
  timeout: LockTimeout;
  hydrated: boolean;

  // Runtime
  isLocked: boolean;
  /** Quando o user desbloqueou pela ultima vez (epoch ms). */
  lastUnlockAt: number | null;
  /** Quando o app foi pra background pela ultima vez (epoch ms). */
  lastBackgroundAt: number | null;
  /**
   * True enquanto o prompt biometrico nativo esta visivel. O iOS troca
   * o AppState pra inactive/background transientemente durante o prompt
   * — isso NAO e backgrounding genuino e nao deve disparar re-lock.
   * markBackground e evaluateOnForeground sao no-op enquanto essa flag
   * estiver ligada, eliminando a race condition entre o callback do
   * AppState e a resolucao da Promise do authenticateAsync.
   */
  isAuthenticating: boolean;

  /**
   * Flag setado em sucesso de requestUnlock; consumido na PRÓXIMA
   * transição de AppState que reche markBackground ou evaluateOnForeground.
   * Failsafe limpa após {@link POST_UNLOCK_GRACE_FAILSAFE_MS} caso nenhum
   * AppState event chegue.
   *
   * Por quê tanto isso quanto o cooldown 3s? Defesa em profundidade:
   * - Cooldown 3s: barra qualquer transição dentro da janela temporal.
   *   Cobre OS-level lag onde 'background' transient chega tarde mas
   *   ainda dentro da janela.
   * - Grace flag: cobre o cenário onde a transição chega > 3s
   *   após o unlock (ex: device sob carga pesada). Pelo menos a PRIMEIRA
   *   transição pós-unlock é absorvida, garantindo que pisca-piscas iOS
   *   nunca causem re-lock spurioso. Trade-off aceito: se user
   *   genuinamente background dentro de 5s do unlock, o primeiro
   *   background será silenciado (mas o próximo bloqueia).
   */
  postUnlockGrace: boolean;

  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setTimeout: (timeout: LockTimeout) => Promise<void>;
  /**
   * Dispara o prompt biometrico nativo e, em sucesso, desbloqueia
   * atomicamente. Re-entrante: chamadas concorrentes retornam
   * `{ success: false, error: 'in_flight' }` sem efeito ate a anterior
   * resolver.
   */
  requestUnlock: (promptMessage?: string) => Promise<AuthenticateResult>;
  /** Forca lock — usado quando app vai pra background. */
  lock: () => void;
  /** Registra timestamp do background — chamado no AppState change. */
  markBackground: () => void;
  /** Avalia se deve bloquear ao voltar pro foreground. */
  evaluateOnForeground: () => void;
}

// SecureStore so funciona em iOS/Android. Web/Expo Go fallback gracioso.
const isSecureStoreAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

async function readBool(key: string, fallback: boolean): Promise<boolean> {
  if (!isSecureStoreAvailable) return fallback;
  try {
    const v = await SecureStore.getItemAsync(key);
    return v === '1';
  } catch {
    return fallback;
  }
}

async function writeBool(key: string, value: boolean): Promise<void> {
  if (!isSecureStoreAvailable) return;
  try {
    await SecureStore.setItemAsync(key, value ? '1' : '0');
  } catch {}
}

async function readString<T extends string>(key: string, fallback: T, valid: readonly T[]): Promise<T> {
  if (!isSecureStoreAvailable) return fallback;
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v && (valid as readonly string[]).includes(v)) return v as T;
    return fallback;
  } catch {
    return fallback;
  }
}

async function writeString(key: string, value: string): Promise<void> {
  if (!isSecureStoreAvailable) return;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {}
}

const VALID_TIMEOUTS: readonly LockTimeout[] = ['immediate', '1m', '15m', '1h'];

export const useLock = create<LockState>((set, get) => ({
  enabled: false,
  timeout: 'immediate',
  hydrated: false,
  isLocked: false,
  lastUnlockAt: null,
  lastBackgroundAt: null,
  isAuthenticating: false,
  postUnlockGrace: false,

  hydrate: async () => {
    const [enabled, timeout] = await Promise.all([
      readBool(KEY_ENABLED, false),
      readString<LockTimeout>(KEY_TIMEOUT, 'immediate', VALID_TIMEOUTS),
    ]);
    // Cold start: se lock ta ligado, app comeca bloqueado.
    set({
      enabled,
      timeout,
      hydrated: true,
      isLocked: enabled,
    });
  },

  setEnabled: async (enabled: boolean) => {
    await writeBool(KEY_ENABLED, enabled);
    set({ enabled });
    // Se desligou, garante que o app nao fica preso travado.
    if (!enabled) set({ isLocked: false });
  },

  setTimeout: async (timeout: LockTimeout) => {
    await writeString(KEY_TIMEOUT, timeout);
    set({ timeout });
  },

  requestUnlock: async (promptMessage = 'Desbloquear Kindar') => {
    if (get().isAuthenticating) {
      logLockEvent('requestUnlock.skip.in_flight');
      return { success: false, error: 'in_flight' };
    }
    set({ isAuthenticating: true });
    logLockEvent('requestUnlock.start', {
      isLocked: get().isLocked,
      lastUnlockAt: get().lastUnlockAt,
      lastBackgroundAt: get().lastBackgroundAt,
    });

    // Failsafe timeout (60s): se algo travar a Promise de
    // biometricAuthenticate (PostHog AppState side-effect, app suspendido
    // pelo iOS sem callback, native bridge stale, etc.), force-reset a flag
    // pra evitar lock permanente. Padrão de "circuit breaker" pra prompts
    // nativos. 60s é generoso — prompt biométrico raramente passa 10s.
    const failsafeTimer = setTimeout(() => {
      if (get().isAuthenticating) {
        // eslint-disable-next-line no-console
        console.warn('[lock] requestUnlock failsafe: 60s elapsed without resolve, force-resetting isAuthenticating');
        logLockEvent('requestUnlock.failsafe.timeout');
        set({ isAuthenticating: false });
      }
    }, 60_000);

    try {
      const result = await biometricAuthenticate(promptMessage);
      if (result.success) {
        // Limpa lastBackgroundAt junto com o unlock pra evitar que um
        // evaluateOnForeground tardio (caso a flag isAuthenticating
        // tenha sido limpa antes do callback) calcule elapsed contra
        // um timestamp obsoleto e re-trave.
        //
        // postUnlockGrace=true: a PRÓXIMA transição de AppState (background
        // ou active) será consumida sem efeito. Cobre iOS piscadas tardias
        // que escapam do cooldown temporal.
        set({
          isLocked: false,
          lastUnlockAt: Date.now(),
          lastBackgroundAt: null,
          postUnlockGrace: true,
        });
        logLockEvent('requestUnlock.success', { unlockAt: Date.now() });

        // Failsafe — se nenhum AppState event chegar pra consumir o grace
        // flag, limpa pra evitar que o flag bloqueie marking legítimo
        // pra sempre. 5s é gordo o suficiente pro AppState 'active' chegar
        // depois de qualquer Face ID prompt razoável.
        setTimeout(() => {
          if (get().postUnlockGrace) {
            logLockEvent('postUnlockGrace.failsafe.clear');
            set({ postUnlockGrace: false });
          }
        }, POST_UNLOCK_GRACE_FAILSAFE_MS);
      } else {
        logLockEvent('requestUnlock.failure', { error: result.error });
      }
      return result;
    } finally {
      clearTimeout(failsafeTimer);
      set({ isAuthenticating: false });
      logLockEvent('requestUnlock.finally');
    }
  },

  lock: () => {
    if (get().enabled) set({ isLocked: true });
  },

  markBackground: () => {
    // O prompt biometrico do iOS troca o AppState transientemente.
    // Ignorar essa transicao — nao e backgrounding genuino do usuario.
    if (get().isAuthenticating) {
      logLockEvent('markBackground.skip.isAuthenticating');
      return;
    }

    // Grace pós-unlock — CONSUMA o flag (uma transição só) e retorne.
    // Cobre piscadas iOS pós-Face ID que escapam do cooldown temporal.
    if (get().postUnlockGrace) {
      logLockEvent('markBackground.skip.grace_consumed');
      set({ postUnlockGrace: false });
      return;
    }

    // Cooldown pós-unlock (subido de 1500→3000ms em 2026-05-18 após
    // primeira tentativa não resolver loop em devices reais): se
    // desbloqueou nos últimos 3s, ignora o background event. Cobre
    // cenário onde iOS emite múltiplos AppState changes após o user
    // aprovar Face ID — o último 'active' que resolve o await pode vir
    // DEPOIS de outros 'background' eventos que o LockGate AppState
    // listener processou enquanto isAuthenticating ainda estava true.
    // Sem esse cooldown, o lastBackgroundAt fica setado a um timestamp
    // logo após o unlock, e o PRÓXIMO evaluateOnForeground (em qualquer
    // foreground subsequente) re-locka instantaneamente em
    // timeout='immediate'.
    const { lastUnlockAt } = get();
    if (lastUnlockAt && (Date.now() - lastUnlockAt) < POST_UNLOCK_COOLDOWN_MS) {
      logLockEvent('markBackground.skip.cooldown', { sinceUnlock: Date.now() - lastUnlockAt });
      return;
    }
    set({ lastBackgroundAt: Date.now() });
    logLockEvent('markBackground.set', { lastBackgroundAt: Date.now() });
  },

  evaluateOnForeground: () => {
    const { enabled, timeout, isLocked, lastBackgroundAt, isAuthenticating, lastUnlockAt, postUnlockGrace } = get();
    // Mesma razao do markBackground: durante autenticacao, o retorno
    // ao foreground vem do fechamento do prompt, nao da volta do usuario.
    if (isAuthenticating) {
      logLockEvent('evaluateOnForeground.skip.isAuthenticating');
      return;
    }
    if (!enabled) return;
    if (isLocked) {
      logLockEvent('evaluateOnForeground.skip.alreadyLocked');
      return;
    }

    // Grace pós-unlock — CONSUMA o flag e retorne.
    if (postUnlockGrace) {
      logLockEvent('evaluateOnForeground.skip.grace_consumed');
      set({ postUnlockGrace: false });
      return;
    }

    // Cooldown pós-unlock (subido de 1500→3000ms em 2026-05-18, mesma
    // defesa do markBackground): se desbloqueou nos últimos 3s, NÃO
    // re-locka. Cobre a janela onde iOS pode disparar AppState 'active'
    // eventos rapidamente após o unlock que entrariam em race com a
    // Promise resolve do biometricAuthenticate.
    if (lastUnlockAt && (Date.now() - lastUnlockAt) < POST_UNLOCK_COOLDOWN_MS) {
      logLockEvent('evaluateOnForeground.skip.cooldown', { sinceUnlock: Date.now() - lastUnlockAt });
      return;
    }

    const threshold = TIMEOUT_MS[timeout];
    // immediate (threshold=0): qualquer ida pro background tranca.
    if (lastBackgroundAt == null) {
      // Sem registro de background ainda — e cold start ja seto isLocked
      // no hydrate, entao isso aqui so cobre edge case (warm start sem bg).
      logLockEvent('evaluateOnForeground.skip.noBackground');
      return;
    }
    const elapsed = Date.now() - lastBackgroundAt;
    if (elapsed >= threshold) {
      logLockEvent('evaluateOnForeground.RELOCK', { elapsed, threshold, timeout });
      set({ isLocked: true });
    } else {
      logLockEvent('evaluateOnForeground.skip.withinWindow', { elapsed, threshold });
    }
  },
}));
