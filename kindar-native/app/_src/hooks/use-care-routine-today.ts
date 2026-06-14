import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { apiFetch } from '../lib/api-fetch';
import { useAuth } from '../store/auth';
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
  // BUG (device dono 14/jun): o endpoint /api/care-routine/today EXIGE ?groupId,
  // mas o hook chamava sem ele → 400 → null → a rotina NUNCA refletia no herói
  // (voz de família mesmo com slots no banco) e o SplitDayArc nunca aparecia.
  const activeGroup = useAuth((s) => s.activeGroup);
  const groupId = activeGroup?.groupId;

  useFocusEffect(
    useCallback(() => {
      if (!groupId) {
        setPayload(null);
        return;
      }
      let active = true;
      (async () => {
        try {
          const res = await apiFetch<RoutineTodayPayload>('/api/care-routine/today', { query: { groupId } });
          if (active) setPayload(res.ok && res.data ? res.data : null);
        } catch {
          if (active) setPayload(null);
        }
      })();
      return () => {
        active = false;
      };
    }, [groupId]),
  );

  return payload;
}
