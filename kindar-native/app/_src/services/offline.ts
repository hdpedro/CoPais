/**
 * Offline-First Architecture — Real implementation.
 *
 * - NetInfo listener for actual connectivity detection
 * - Cache with TTL for read data
 * - Queue for writes when offline, auto-synced on reconnect
 * - safeWrite() helper that services MUST use instead of raw supabase.insert/update
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/with-timeout';

// Teto pra QUALQUER write online. O client supabase usa fetch, que NÃO tem
// timeout no React Native — em rede móvel ruim (TLS travado, DNS lento) uma
// request pendura pra sempre e o caller fica preso em "salvando" (botão
// branco). Ao estourar, withTimeout rejeita, o catch enfileira a ação e o
// caller recebe { queued: true } (sucesso otimista, sincroniza depois).
// Bug 2026-06-03 (grupo Android): save de evento multi-dia pendurava.
const WRITE_TIMEOUT_MS = 15_000;

// ══════════════════════════════════════════
// CACHE (read)
// ══════════════════════════════════════════

const CACHE_PREFIX = '@kindar_cache_';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

export async function cacheClear(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(CACHE_PREFIX + key); } catch {}
}

// ══════════════════════════════════════════
// NETWORK STATE (real, via NetInfo)
// ══════════════════════════════════════════

let _isOnline = true;
const _listeners: Array<(online: boolean) => void> = [];

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  _listeners.push(fn);
  return () => {
    const idx = _listeners.indexOf(fn);
    if (idx >= 0) _listeners.splice(idx, 1);
  };
}

function _setOnline(online: boolean) {
  const wasOffline = !_isOnline;
  _isOnline = online;

  // Notify listeners
  _listeners.forEach(fn => fn(online));

  // Auto-sync when coming back online
  if (online && wasOffline) {
    syncQueue().catch(() => {});
  }
}

// ══════════════════════════════════════════
// OFFLINE QUEUE (write)
// ══════════════════════════════════════════

const QUEUE_KEY = '@kindar_offline_queue';

export interface QueuedAction {
  id: string;
  table: string;
  operation: 'insert' | 'update' | 'delete';
  // Array suportado pra insert em lote (safeWriteMany). update/delete sempre
  // carregam um objeto único. supabase.insert() aceita objeto OU lista.
  payload: Record<string, unknown> | Record<string, unknown>[];
  timestamp: number;
  retries: number;
}

export async function enqueue(action: Omit<QueuedAction, 'id' | 'timestamp' | 'retries'>): Promise<void> {
  try {
    const queue = await getQueue();
    queue.push({
      ...action,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      retries: 0,
    });
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════
// SYNC
// ══════════════════════════════════════════

export async function syncQueue(): Promise<{ synced: number; failed: number }> {
  const queue = await getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      let result;
      if (action.operation === 'insert') {
        // payload pode ser objeto único OU array (batch) — insert aceita ambos.
        result = await supabase.from(action.table).insert(action.payload);
      } else if (action.operation === 'update') {
        const { id, ...updates } = action.payload as Record<string, unknown>;
        result = await supabase.from(action.table).update(updates).eq('id', id as string);
      } else if (action.operation === 'delete') {
        const single = action.payload as Record<string, unknown>;
        result = await supabase.from(action.table).delete().eq('id', single.id as string);
      }
      if (result?.error) throw result.error;
      synced++;
    } catch {
      action.retries++;
      if (action.retries < 5) remaining.push(action);
      failed++;
    }
  }

  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  return { synced, failed };
}

// ══════════════════════════════════════════
// safeWrite() — THE write helper all services must use
// ══════════════════════════════════════════

/**
 * Tables that may be written to via direct supabase access (RLS-covered, no
 * admin gate, no cross-table validation). Anything NOT in this set should go
 * via a Bearer-auth API route (settlements, family/members, invitations,
 * decisions/vote, sensitive-notes, calendar/generate-schedule, etc.).
 *
 * Wave H architectural fix: previous safeWrite accepted ANY table arbitrarily,
 * which bypassed every API gate we built. Whitelisting locks down the surface.
 *
 * Adding a new table here is a deliberate decision — confirm:
 *   1. RLS policies cover the operation (member-scoped, child-scoped)
 *   2. There is no "admin only" gate or cross-table validation needed
 *   3. The PWA either does the same direct write, or there's no PWA equivalent
 */
type SafeTable =
  | 'agreements'
  | 'active_medications'
  | 'chat_messages'
  | 'chat_channel_reads'
  | 'child_activities'
  | 'child_allergies'
  | 'child_education'
  | 'children'
  | 'daily_checkins'
  | 'decisions'
  | 'events'
  | 'expenses'
  | 'growth_records'
  | 'illness_episodes'
  | 'medical_appointments'
  | 'medical_info'
  | 'medication_doses'
  | 'notifications'
  | 'private_notes'
  | 'professionals'
  | 'profiles'
  | 'school_logs'
  | 'symptom_entries'
  | 'vaccination_records';

const SAFE_TABLES: ReadonlySet<string> = new Set<SafeTable>([
  'agreements',
  'active_medications',
  'chat_messages',
  'chat_channel_reads',
  'child_activities',
  'child_allergies',
  'child_education',
  'children',
  'daily_checkins',
  'decisions',
  'events',
  'expenses',
  'growth_records',
  'illness_episodes',
  'medical_appointments',
  'medical_info',
  'medication_doses',
  'notifications',
  'private_notes',
  'professionals',
  'profiles',
  'school_logs',
  'symptom_entries',
  'vaccination_records',
]);

function checkWhitelist(table: string): void {
  if (SAFE_TABLES.has(table)) return;
  const msg = `[safeWrite] Tabela "${table}" fora da whitelist. Use a rota Bearer-auth /api/* equivalente.`;
  if (__DEV__) {
    // Throw in dev so the caller sees it immediately during testing.
    throw new Error(msg);
  } else {
    // In prod, warn-and-proceed to avoid hard breaks; remove this fallback
    // once all callers are audited.
    console.warn(msg);
  }
}

/**
 * Wraps a Supabase write. If online, executes immediately and checks for error.
 * If offline, enqueues for later sync.
 *
 * Returns { success, error?, queued? }
 */
export async function safeWrite(params: {
  table: SafeTable | string;
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  /**
   * Quando true em insert online, retorna o id da row criada via
   * .select('id').single(). Usado por callers que precisam disparar
   * side-effects pos-insert (ex: notifySaudeCreate da Foundation).
   *
   * Quando insert vai pra fila offline, id NÃO é retornado (a row ainda
   * não existe no banco). Caller deve tratar undefined gracefully.
   */
  returnInsertedId?: boolean;
}): Promise<{ success: boolean; error?: string; queued?: boolean; id?: string }> {
  checkWhitelist(params.table);
  if (!isOnline()) {
    await enqueue(params);
    return { success: true, queued: true };
  }

  try {
    if (params.operation === 'insert') {
      if (params.returnInsertedId) {
        // Insert + retorna id da row criada. .single() força 1 row,
        // erra se 0 ou multiple — semântica correta pra insert único.
        const { data, error } = await withTimeout(
          supabase.from(params.table).insert(params.payload).select('id').single(),
          WRITE_TIMEOUT_MS,
          `safeWrite:insert:${params.table}`,
        );
        if (error) return { success: false, error: error.message };
        return { success: true, id: (data as { id?: string } | null)?.id };
      }
      const { error } = await withTimeout(
        supabase.from(params.table).insert(params.payload),
        WRITE_TIMEOUT_MS,
        `safeWrite:insert:${params.table}`,
      );
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    if (params.operation === 'update') {
      const { id, ...updates } = params.payload;
      const { error } = await withTimeout(
        supabase.from(params.table).update(updates).eq('id', id as string),
        WRITE_TIMEOUT_MS,
        `safeWrite:update:${params.table}`,
      );
      if (error) return { success: false, error: error.message };
      return { success: true };
    }
    // delete
    const { error } = await withTimeout(
      supabase.from(params.table).delete().eq('id', params.payload.id as string),
      WRITE_TIMEOUT_MS,
      `safeWrite:delete:${params.table}`,
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    // Timeout (WRITE_TIMEOUT_MS) ou erro de rede → enfileira pra sync depois.
    // O caller recebe { queued: true } e trata como sucesso otimista.
    await enqueue(params);
    return { success: true, queued: true };
  }
}

/**
 * Batch insert — UMA round-trip pra N linhas (espelha a action do PWA
 * `src/actions/events.ts:createEvent`, que faz `insert(eventRows)` numa
 * chamada só).
 *
 * Motivo: o caller multi-dia (services/events.ts) fazia N `await safeWrite()`
 * sequenciais — até 60 round-trips numa rede móvel ruim. Bastava UMA travar
 * (fetch do supabase não tem timeout) pra o save inteiro pendurar e o botão
 * "Salvar evento" ficar preso (branco), sem gravar nada. Bug 2026-06-03
 * (grupo Android). Batch + withTimeout fecha as duas pontas: 1 request e
 * nunca pendura pra sempre.
 *
 * Offline (ou timeout/erro): enfileira UMA ação com payload array — o
 * syncQueue passa o array direto pro supabase.insert(), que aceita lista.
 */
export async function safeWriteMany(params: {
  table: SafeTable | string;
  rows: Record<string, unknown>[];
}): Promise<{ success: boolean; error?: string; queued?: boolean }> {
  if (params.rows.length === 0) return { success: true };
  checkWhitelist(params.table);

  if (!isOnline()) {
    await enqueue({ table: params.table, operation: 'insert', payload: params.rows });
    return { success: true, queued: true };
  }

  try {
    const { error } = await withTimeout(
      supabase.from(params.table).insert(params.rows),
      WRITE_TIMEOUT_MS,
      `safeWriteMany:insert:${params.table}:${params.rows.length}`,
    );
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch {
    // Timeout ou erro de rede → enfileira o batch inteiro pra sync depois.
    await enqueue({ table: params.table, operation: 'insert', payload: params.rows });
    return { success: true, queued: true };
  }
}

// ══════════════════════════════════════════
// SETUP — call once from root layout
// ══════════════════════════════════════════

export function setupOffline(): () => void {
  // 1. NetInfo listener (real connectivity)
  const unsubNet = NetInfo.addEventListener((state: NetInfoState) => {
    _setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });

  // Fetch initial state
  NetInfo.fetch().then((state: NetInfoState) => {
    _isOnline = state.isConnected === true && state.isInternetReachable !== false;
  });

  // 2. AppState listener (sync on resume)
  const appSub = AppState.addEventListener('change', (appState) => {
    if (appState === 'active' && _isOnline) {
      syncQueue().catch(() => {});
    }
  });

  return () => {
    unsubNet();
    appSub.remove();
  };
}
