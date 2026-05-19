/**
 * Child Sizes Service (Native) — mirror leve do PWA service.
 *
 * Foundation Collab #7 (migration 00086). UI no perfil da criança.
 *
 * Operações:
 *  - fetchSizes(childId) — pega current + history em 1 round-trip
 *  - recordSize(...) — POST via API; suporta offline via safeWrite
 *  - updateSize(...) — PATCH via API
 *  - deleteSize(...) — DELETE via API
 *
 * Por que API em vez de Supabase direto? Foundation Collab notification
 * fan-out roda no server-side (notifySaudeFamiliaSize). Se native chamasse
 * Supabase direto via safeWrite, o coparente não receberia push. Trade-off:
 * online-only pra criar (notify); offline-first pode entrar em Fase 2
 * via service worker + queue.
 *
 * Ainda assim usamos safeWrite quando online=false só pra UX de "pending"
 * — opcional, fica como TODO.
 */
import { apiFetch } from '../lib/api-fetch';

export type SizeKind = 'shoe' | 'pants' | 'shirt' | 'coat' | 'other';

export const SIZE_KINDS: readonly SizeKind[] = [
  'shoe',
  'pants',
  'shirt',
  'coat',
  'other',
];

export interface CurrentSize {
  size_id: string;
  kind: SizeKind;
  custom_label: string | null;
  size_value: string;
  recorded_on: string;
  is_confirmation: boolean;
  created_by: string;
  creator_first_name?: string;
  days_since_recorded: number;
}

export interface ChildSizeRecord {
  id: string;
  group_id: string;
  child_id: string;
  kind: SizeKind;
  custom_label: string | null;
  size_value: string;
  size_value_numeric: number | null;
  recorded_on: string;
  notes: string | null;
  is_confirmation: boolean;
  priority: 'info' | 'important' | 'urgent';
  created_by: string;
  created_at: string;
  updated_at: string;
  creator_first_name?: string;
}

/**
 * Busca tamanhos atuais + histórico de uma criança.
 * Retorna { currentSizes: [], history: [] } em erro (UI mostra vazio gracioso).
 */
export async function fetchSizes(
  childId: string,
): Promise<{ currentSizes: CurrentSize[]; history: ChildSizeRecord[] }> {
  const r = await apiFetch<{ currentSizes: CurrentSize[]; history: ChildSizeRecord[] }>(
    `/api/children/${childId}/sizes`,
    { method: 'GET' },
  );
  if (!r.ok || !r.data) return { currentSizes: [], history: [] };
  return r.data;
}

/**
 * Registra novo tamanho. Online-only (precisa do notify fan-out).
 * Retorna { success, error? } pra UI tratar toast.
 */
export async function recordSize(params: {
  childId: string;
  groupId: string;
  kind: SizeKind;
  customLabel?: string | null;
  sizeValue: string;
  recordedOn?: string | null;
  notes?: string | null;
  isConfirmation?: boolean;
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const r = await apiFetch<{ success: boolean; id: string }>(
    `/api/children/${params.childId}/sizes`,
    {
      method: 'POST',
      body: {
        groupId: params.groupId,
        kind: params.kind,
        customLabel: params.customLabel ?? null,
        sizeValue: params.sizeValue,
        recordedOn: params.recordedOn ?? null,
        notes: params.notes ?? null,
        isConfirmation: params.isConfirmation ?? false,
      },
    },
  );
  if (!r.ok || !r.data) {
    return { success: false, error: r.error || 'Falha ao registrar tamanho.' };
  }
  return { success: true, id: r.data.id };
}

export async function updateSize(params: {
  childId: string;
  sizeId: string;
  sizeValue?: string;
  recordedOn?: string;
  notes?: string | null;
  customLabel?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  const body: Record<string, unknown> = {};
  if (params.sizeValue !== undefined) body.sizeValue = params.sizeValue;
  if (params.recordedOn !== undefined) body.recordedOn = params.recordedOn;
  if (params.notes !== undefined) body.notes = params.notes;
  if (params.customLabel !== undefined) body.customLabel = params.customLabel;
  const r = await apiFetch<{ success: boolean }>(
    `/api/children/${params.childId}/sizes/${params.sizeId}`,
    { method: 'PATCH', body },
  );
  if (!r.ok) return { success: false, error: r.error || 'Falha ao atualizar.' };
  return { success: true };
}

export async function deleteSize(params: {
  childId: string;
  sizeId: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch<{ success: boolean }>(
    `/api/children/${params.childId}/sizes/${params.sizeId}`,
    { method: 'DELETE' },
  );
  if (!r.ok) return { success: false, error: r.error || 'Falha ao excluir.' };
  return { success: true };
}
