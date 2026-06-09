import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '../lib/api-fetch';
import type { RoutineToday } from '../lib/care-routine-resolve';

export interface RoutineTodayPayload {
  arrangement: 'rotating' | 'together' | 'single' | 'custom';
  today: RoutineToday;
}

/**
 * Busca a rotina de leva/busca de HOJE via GET /api/care-routine/today (Bearer).
 *
 * ISOLADO do `useDashboard` de propósito: se falhar (rede, sessão, etc.), o
 * chip apenas não aparece — NUNCA afeta o painel (blast radius contido).
 * Non-blocking, refetch on focus.
 */
export function useCareRoutineToday(): RoutineTodayPayload | null {
  const [payload, setPayload] = useState<RoutineTodayPayload | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const res = await apiFetch<RoutineTodayPayload>('/api/care-routine/today');
          if (active) setPayload(res.ok && res.data ? res.data : null);
        } catch {
          if (active) setPayload(null);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return payload;
}
