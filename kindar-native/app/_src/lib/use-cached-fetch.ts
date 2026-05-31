/**
 * useCachedFetch — hook generico de "cache-first hydration + withTimeout +
 * reportError + finally setLoading(false)".
 *
 * Motivo: 29 telas Native ainda violavam o padrao consolidado em
 * useDashboard (commit 07a5bf9). Cluster de timeouts em prod (Henrique
 * 2026-05-30 22:17 BRT) atingiu Cal/Health/Dashboard simultaneamente — so o
 * Dashboard "abriu" porque tinha cache-first. Esse helper fecha o rollout sem
 * duplicar ~60 linhas em cada tela.
 *
 * Padrao copiado de useDashboard (loadData + hydration useEffect):
 *   1. Mount com `data=empty`, `loading=true`
 *   2. useEffect roda `cacheGet(cacheKey)` — se houver e ainda nao
 *      fetchamos, hidrata + libera spinner imediatamente
 *   3. useFocusEffect chama `loadData()` que:
 *      - early-return offline com cache se houver
 *      - executa `fetcher()` envolto em `withTimeout(ms, tag)`
 *      - on success: `cacheSet(cacheKey, data)` + `setData(fresh)` +
 *        marca `hasFetchedRef=true`
 *      - on catch: tenta `cacheGet` stale como fallback +
 *        `reportError(severity=error)` se nao for `TimeoutError`
 *      - finally: `setLoading(false)`
 *   4. `refresh()` exposto pra pull-to-refresh e real-time callbacks
 *
 * Race-safe: hydration so aplica se `hasFetchedRef.current === false`,
 * evitando que cache sobrescreva resultado fresh quando o fetch volta
 * antes do AsyncStorage.
 *
 * Uso:
 *   const { data, loading, refresh } = useCachedFetch({
 *     cacheKey: activeGroup ? `expenses_${activeGroup.groupId}` : null,
 *     fetcher: () => fetchExpenses(activeGroup!.groupId),
 *     tag: 'despesas:load',
 *     empty: [] as Expense[],
 *   });
 *
 * Quando `cacheKey === null` (sem auth/group): empty + loading=false +
 * fetcher nao roda — sem efeito colateral.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { withTimeout, TimeoutError } from './with-timeout';
import { reportError } from './error-reporter';
import { cacheGet, cacheSet, isOnline } from '../services/offline';

const DEFAULT_TIMEOUT_MS = 15_000;

export interface UseCachedFetchOpts<T> {
  /**
   * Cache key (sem prefixo — o services/offline ja adiciona @kindar_cache_).
   * Quando null, o hook nao executa: data=empty, loading=false. Util pra
   * casos onde activeGroup/userId ainda nao carregaram.
   */
  cacheKey: string | null;
  /**
   * Funcao que faz o trabalho. Sera envolta em withTimeout(timeoutMs, tag).
   * Deve resolver com o shape T final que vai pro state.
   */
  fetcher: () => Promise<T>;
  /** Label pra telemetria do withTimeout/reportError. Ex: 'despesas:load' */
  tag: string;
  /** Valor inicial e fallback de empty state (quando cache miss + fetch falha). */
  empty: T;
  /** Timeout em ms. Default 15s — bate com useDashboard/useCalendar/useHealth. */
  timeoutMs?: number;
  /**
   * Se true (default), refetch on useFocusEffect (re-roda toda vez que a tela
   * ganha foco). False = roda so 1x no mount. Algumas telas (telas de detalhe
   * que ja receberam dados via params) preferem false.
   */
  refetchOnFocus?: boolean;
}

export interface UseCachedFetchResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCachedFetch<T>(opts: UseCachedFetchOpts<T>): UseCachedFetchResult<T> {
  const {
    cacheKey,
    fetcher,
    tag,
    empty,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    refetchOnFocus = true,
  } = opts;

  const [data, setData] = useState<T>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // hasFetchedRef garante race-safety: se o fetcher voltar ANTES do
  // hydration ler cache, o hydration nao sobrescreve dado fresh.
  const hasFetchedRef = useRef(false);

  const loadData = useCallback(async () => {
    if (!cacheKey) {
      setLoading(false);
      return;
    }

    // Offline early-return: usa cache se houver, senao mantem `empty` mas
    // libera spinner — UI pode mostrar empty state em vez de "Carregando..."
    // pra sempre.
    if (!isOnline()) {
      const cached = await cacheGet<T>(cacheKey);
      if (cached !== null) setData(cached);
      setLoading(false);
      return;
    }

    try {
      const fresh = await withTimeout(fetcher(), timeoutMs, tag);
      setData(fresh);
      hasFetchedRef.current = true;
      setError(null);
      cacheSet(cacheKey, fresh);
    } catch (e) {
      // Fallback stale: prefere snapshot anterior a tela vazia.
      try {
        const stale = await cacheGet<T>(cacheKey);
        if (stale !== null) setData(stale);
      } catch { /* cache miss */ }
      setError(e instanceof Error ? e.message : 'Erro ao carregar');
      // TimeoutError ja foi reportado como 'info' pelo withTimeout.
      // Re-reportar como 'error' duplica row no app_errors.
      if (!(e instanceof TimeoutError)) {
        reportError(e, { severity: 'error', filePath: `use-cached-fetch:${tag}` }).catch(() => {});
      }
    } finally {
      // Invariante: spinner SEMPRE termina.
      setLoading(false);
    }
    // fetcher intencionalmente fora das deps: caller controla
    // identidade via cacheKey. Sem isso loadData mudaria a cada render
    // e useFocusEffect refetchava em loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, tag, timeoutMs]);

  // Cache-first hydration: roda 1x por cacheKey, antes do fetcher terminar.
  // Race-safe via hasFetchedRef — se fetch ja completou, NAO sobrescreve.
  //
  // CacheKey change in-screen (ex: selectedChildId muda em emergencia):
  // forca loading=true ANTES de tentar hidratar — UI mostra spinner durante
  // a transicao em vez de stale-do-key-anterior. Hidratar (cache hit) ou
  // loadData (cache miss) vai zerar de novo no fim.
  useEffect(() => {
    if (!cacheKey) return;
    hasFetchedRef.current = false; // novo cacheKey = novo ciclo
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const cached = await cacheGet<T>(cacheKey);
        if (cancelled || cached === null || hasFetchedRef.current) return;
        setData(cached);
        setLoading(false);
      } catch { /* cache indisponivel: loadData roda normal */ }
    })();
    return () => { cancelled = true; };
  }, [cacheKey]);

  // Refetch on focus por default (matches useDashboard pattern). Quando
  // refetchOnFocus=false, fallback pra useEffect com [cacheKey].
  useFocusEffect(
    useCallback(() => {
      if (refetchOnFocus) loadData();
    }, [loadData, refetchOnFocus]),
  );

  useEffect(() => {
    if (!refetchOnFocus) loadData();
  }, [refetchOnFocus, loadData]);

  return { data, loading, error, refresh: loadData };
}
