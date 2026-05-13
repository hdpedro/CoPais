/**
 * Saúde Foundation client (native) — wrapper de POST /api/health/notify-create.
 *
 * Chamado APÓS um INSERT bem-sucedido em uma das 5 tabelas de Saúde
 * (medical_appointments, illness_episodes, active_medications,
 * child_allergies, vaccination_records) pra emitir a notificação
 * Foundation pros coparentes: push com coalescing 60s + priority + deep
 * link com highlight + telemetria.
 *
 * Fluxo:
 *   1. Native chama safeWrite com `returnInsertedId: true`.
 *   2. Se result.success && result.id, chama notifySaudeCreateNative.
 *   3. Endpoint valida ownership + dispara notifyCollabCreate server-side.
 *
 * Falha silenciosa por design — notificação é best-effort. Não bloqueia
 * o fluxo do usuário se a chamada falhar (offline, server timeout, etc).
 *
 * Quando o safeWrite cai na fila offline (queued: true), id chega
 * undefined e este helper retorna sem fazer nada — a notificação é
 * perdida pra esse INSERT (aceitável: o registro ainda chega no banco
 * quando volta online, e o coparente vê via "Novo" badge quando abrir
 * o módulo).
 */

import { apiFetch } from '../lib/api-fetch';

export type SaudeRecordType =
  | 'medical_appointment'
  | 'illness_episode'
  | 'active_medication'
  | 'child_allergy'
  | 'vaccination_record';

/**
 * Dispara notificação Foundation pra coparentes. Caller passa o id
 * recém-criado e uma descrição curta. Endpoint server-side resolve
 * actor/child names e priority automaticamente.
 */
export async function notifySaudeCreateNative(args: {
  recordType: SaudeRecordType;
  recordId: string;
  description: string;
}): Promise<void> {
  try {
    await apiFetch('/api/health/notify-create', {
      method: 'POST',
      body: {
        recordType: args.recordType,
        recordId: args.recordId,
        description: args.description,
      },
    });
  } catch {
    // best-effort
  }
}
