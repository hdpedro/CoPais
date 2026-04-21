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
  payload: Record<string, unknown>;
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
        result = await supabase.from(action.table).insert(action.payload);
      } else if (action.operation === 'update') {
        const { id, ...updates } = action.payload;
        result = await supabase.from(action.table).update(updates).eq('id', id as string);
      } else if (action.operation === 'delete') {
        result = await supabase.from(action.table).delete().eq('id', action.payload.id as string);
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
 * Wraps a Supabase write. If online, executes immediately and checks for error.
 * If offline, enqueues for later sync.
 *
 * Returns { success, error?, queued? }
 */
export async function safeWrite(params: {
  table: string;
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string; queued?: boolean }> {
  if (!isOnline()) {
    await enqueue(params);
    return { success: true, queued: true };
  }

  try {
    let result;
    if (params.operation === 'insert') {
      result = await supabase.from(params.table).insert(params.payload);
    } else if (params.operation === 'update') {
      const { id, ...updates } = params.payload;
      result = await supabase.from(params.table).update(updates).eq('id', id as string);
    } else {
      result = await supabase.from(params.table).delete().eq('id', params.payload.id as string);
    }

    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true };
  } catch (e: any) {
    // Network error during write → enqueue
    await enqueue(params);
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
