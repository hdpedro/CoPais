/**
 * useCollabRealtime — Subscribe a mudanças em tempo real numa tabela colab
 * pra um grupo específico (saúde, despesas, atividades, etc.).
 *
 * Quando o co-responsável adiciona/edita/apaga um registro, o callback é
 * chamado pra o caller re-fetchar a lista. Para apps de coparenting,
 * isso fecha o ciclo "Amanda registrou uma alergia e Pedro vê na hora".
 *
 * Decisões consolidadas:
 *  - Filtra por `group_id` (ou `child_id` quando a tabela não tem group_id —
 *    medical_appointments, vaccination_records, etc.).
 *  - INSERT + UPDATE + DELETE: cobre os 3 casos.
 *  - Channel name embute userId pra evitar conflito entre múltiplas screens
 *    montadas ao mesmo tempo (alergias + medicamentos abertas em paralelo).
 *  - Throttle: callback é debounced em 800ms pra evitar re-fetch em rajada
 *    quando o co-responsável faz N inserts seguidos.
 *  - Mostra Toast suave (via useToast) quando o evento é de OUTRO user
 *    (não eu) — feedback "Amanda adicionou uma alergia".
 *  - O caller passa `displayLabel` ("alergia") pra montar a mensagem PT-BR.
 *  - Skip self-events checking `created_by` no payload.new (quando disponível).
 *
 * Uso:
 *   useCollabRealtime({
 *     table: 'child_allergies',
 *     groupId: activeGroup?.groupId,
 *     onChange: load,
 *     displayLabel: 'alergia',
 *     myUserId: userId,
 *   });
 */
import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/ui/ToastProvider';

interface CollabRealtimeOptions {
  /** Tabela do Postgres. Ex: 'child_allergies', 'medical_appointments'. */
  table: string;
  /** Group ID pra filtrar. Se null/undefined, hook é no-op. */
  groupId: string | null | undefined;
  /** Callback para re-fetch. Disparado em INSERT/UPDATE/DELETE. */
  onChange: () => void;
  /** Label PT-BR pro Toast (singular). Ex: "alergia", "consulta". */
  displayLabel?: string;
  /** Meu userId — se evento for de mim, não mostra Toast. */
  myUserId?: string | null;
  /** Filter alternativo (ex: child_id em vez de group_id). */
  filterColumn?: string;
  /** Valor do filter. Default groupId. */
  filterValue?: string;
  /** Throttle em ms pro re-fetch. Default 800. */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE = 800;

const PRONOUNS: Record<string, string> = {
  alergia: 'uma',
  consulta: 'uma',
  doença: 'uma',
  episódio: 'um',
  medicamento: 'um',
  vacina: 'uma',
  medida: 'uma',
  profissional: 'um',
  sintoma: 'um',
  receita: 'uma',
  evento: 'um',
  atividade: 'uma',
  despesa: 'uma',
  nota: 'uma',
};

export function useCollabRealtime({
  table,
  groupId,
  onChange,
  displayLabel,
  myUserId,
  filterColumn = 'group_id',
  filterValue,
  debounceMs = DEFAULT_DEBOUNCE,
}: CollabRealtimeOptions): void {
  const toast = useToast();
  const onChangeRef = useRef(onChange);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mantém ref atualizada sem retrigger do effect
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const filterVal = filterValue ?? groupId;
    if (!filterVal) return;

    const channelName = `collab:${table}:${filterVal}:${Math.random().toString(36).slice(2, 8)}`;
    const filterClause = `${filterColumn}=eq.${filterVal}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: filterClause },
        (payload) => {
          // Skip self-originated events quando possível identificar.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const row = (payload.new || payload.old) as any;
          const eventActor = row?.created_by ?? row?.actor_id ?? row?.user_id;
          const isSelf = !!myUserId && eventActor === myUserId;

          // Debounce o re-fetch
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            onChangeRef.current();
          }, debounceMs);

          // Toast só pra eventos de outro user e só pra INSERT
          if (!isSelf && payload.eventType === 'INSERT' && displayLabel) {
            const pronoun = PRONOUNS[displayLabel] ?? 'um(a)';
            toast.show({
              message: `O co-responsável adicionou ${pronoun} ${displayLabel}`,
              variant: 'info',
              durationMs: 3000,
            });
          }
        },
      )
      .subscribe();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      try { supabase.removeChannel(channel); } catch { /* non-fatal */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, groupId, filterColumn, filterValue, myUserId, displayLabel, debounceMs]);
}
