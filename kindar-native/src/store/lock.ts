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

  hydrate: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<void>;
  setTimeout: (timeout: LockTimeout) => Promise<void>;
  /** Marca como desbloqueado (apos sucesso na biometria). */
  unlock: () => void;
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

  unlock: () => {
    set({ isLocked: false, lastUnlockAt: Date.now() });
  },

  lock: () => {
    if (get().enabled) set({ isLocked: true });
  },

  markBackground: () => {
    set({ lastBackgroundAt: Date.now() });
  },

  evaluateOnForeground: () => {
    const { enabled, timeout, isLocked, lastBackgroundAt } = get();
    if (!enabled) return;
    if (isLocked) return; // ja ta travado, nao precisa reavaliar
    const threshold = TIMEOUT_MS[timeout];
    // immediate (threshold=0): qualquer ida pro background tranca.
    if (lastBackgroundAt == null) {
      // Sem registro de background ainda — e cold start ja seto isLocked
      // no hydrate, entao isso aqui so cobre edge case (warm start sem bg).
      return;
    }
    const elapsed = Date.now() - lastBackgroundAt;
    if (elapsed >= threshold) {
      set({ isLocked: true });
    }
  },
}));
