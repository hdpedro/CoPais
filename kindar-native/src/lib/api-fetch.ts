/**
 * Bearer-authenticated fetch helper for PWA API routes.
 *
 * Native services should call PWA endpoints (single source of truth) for
 * any business write that has admin gates, validation, or push side-effects.
 * This wrapper handles the session lookup + Authorization header so each
 * service stops repeating ~10 lines of boilerplate.
 *
 * Usage:
 *   const r = await apiFetch('/api/settlements', { method: 'POST', body: {...} });
 *   if (!r.ok) ... else r.data
 */

import { supabase } from './supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ApiFetchResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<ApiFetchResult<T>> {
  const { method = 'GET', body, query, headers = {} } = options;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, status: 401, error: 'Sessão expirada' };
  }

  const qs = query
    ? '?' + new URLSearchParams(query).toString()
    : '';

  const url = `${WEB_URL}${path}${qs}`;
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let parsed: unknown = null;
  try {
    parsed = await resp.json();
  } catch {
    // ignore parse errors — falls through with empty data
  }

  if (!resp.ok) {
    const message =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? String((parsed as { error: unknown }).error)
        : `Erro ${resp.status}`;
    return { ok: false, status: resp.status, error: message };
  }

  return { ok: true, status: resp.status, data: (parsed as T) };
}
