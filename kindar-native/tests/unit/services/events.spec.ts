/**
 * events service — regressão do save multi-dia.
 *
 * Por que esse teste existe:
 *
 *   Em 2026-06-03 o grupo de testers Android reportou "não consigo salvar
 *   evento na agenda — aperto Salvar e o botão fica branco". A causa: o
 *   caller multi-dia em `createEvent` fazia N `await safeWrite()` SEQUENCIAIS
 *   (um insert por dia, até 60). Cada safeWrite é uma round-trip de rede sem
 *   timeout — numa conexão móvel ruim bastava UMA travar pro save inteiro
 *   pendurar pra sempre. O botão "Salvar evento" depende de `saving`; preso
 *   em true, `canSubmit` vira false e o fundo do botão fica claro com o
 *   spinner branco invisível ("fica branco"). Em produção, ZERO eventos com
 *   denominador > /14 existiam — nenhum batch grande jamais completou.
 *
 *   O PWA (`src/actions/events.ts:createEvent`) sempre fez UM batch insert
 *   (`insert(eventRows)`). Esta é a 6ª divergência PWA↔Native do padrão.
 *
 * Contrato travado aqui:
 *   - single-day  → exatamente 1 `safeWrite`, 0 `safeWriteMany`.
 *   - multi-day   → exatamente 1 `safeWriteMany` (batch), 0 `safeWrite`.
 *   - range > 60d → batch capado em 60 linhas (paridade com o PWA), 1 request.
 *
 * Se alguém reverter pro loop sequencial, `safeWriteMany` deixa de ser
 * chamado (ou `safeWrite` passa a ser chamado N vezes) e estes testes falham.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

const safeWriteMock = vi.fn(
  async (_params?: unknown): Promise<{ success: boolean; queued?: boolean }> => ({ success: true }),
);
const safeWriteManyMock = vi.fn(
  async (_params?: unknown): Promise<{ success: boolean; queued?: boolean }> => ({ success: true }),
);

vi.mock('../../../app/_src/lib/supabase', () => ({ supabase: {} }));
vi.mock('../../../app/_src/services/offline', () => ({
  safeWrite: (params?: unknown) => safeWriteMock(params),
  safeWriteMany: (params?: unknown) => safeWriteManyMock(params),
}));
vi.mock('../../../app/_src/services/notify', () => ({ notifyAction: vi.fn() }));

type ManyArg = { table: string; rows: Array<Record<string, unknown>> };
const lastManyArg = (): ManyArg => safeWriteManyMock.mock.calls[0][0] as unknown as ManyArg;

let createEvent: typeof import('../../../app/_src/services/events').createEvent;

beforeEach(async () => {
  safeWriteMock.mockClear();
  safeWriteManyMock.mockClear();
  safeWriteMock.mockResolvedValue({ success: true });
  safeWriteManyMock.mockResolvedValue({ success: true });
  ({ createEvent } = await import('../../../app/_src/services/events'));
});

describe('createEvent — single vs multi-day write path', () => {
  test('single-day → 1 safeWrite, nenhum safeWriteMany', async () => {
    const r = await createEvent({
      groupId: 'g1', title: 'Cinema', eventDate: '2026-06-06', createdBy: 'u1',
    });
    expect(r.success).toBe(true);
    expect(safeWriteMock).toHaveBeenCalledTimes(1);
    expect(safeWriteManyMock).not.toHaveBeenCalled();
  });

  test('multi-day (5 dias) → 1 safeWriteMany em batch, nenhum safeWrite sequencial', async () => {
    await createEvent({
      groupId: 'g1', title: 'Escola', eventDate: '2026-06-03', endDate: '2026-06-07',
      allDay: true, createdBy: 'u1',
    });
    // O ponto da regressão: NÃO pode haver loop de safeWrite.
    expect(safeWriteMock).not.toHaveBeenCalled();
    expect(safeWriteManyMock).toHaveBeenCalledTimes(1);

    const arg = lastManyArg();
    expect(arg.table).toBe('events');
    expect(arg.rows).toHaveLength(5); // 03,04,05,06,07 inclusive
    expect(arg.rows[0].title).toBe('Escola (1/5)');
    expect(arg.rows[4].title).toBe('Escola (5/5)');
    expect(arg.rows[0].event_date).toBe('2026-06-03');
    expect(arg.rows[4].event_date).toBe('2026-06-07');
    // end_date carimba o fim do range em todas as linhas (paridade PWA).
    expect(arg.rows[0].end_date).toBe('2026-06-07');
  });

  test('range gigante (03/06→17/12, ~197 dias) → batch capado em 60 linhas, 1 request', async () => {
    // Exatamente o input do tester Android. Antes: 60 inserts sequenciais
    // que penduravam. Agora: 1 batch de 60 linhas.
    await createEvent({
      groupId: 'g1', title: 'Escola', eventDate: '2026-06-03', endDate: '2026-12-17',
      allDay: true, createdBy: 'u1',
    });
    expect(safeWriteMock).not.toHaveBeenCalled();
    expect(safeWriteManyMock).toHaveBeenCalledTimes(1);

    const arg = lastManyArg();
    expect(arg.rows).toHaveLength(60); // cap de segurança (igual ao PWA)
    expect(arg.rows[0].title).toBe('Escola (1/60)');
    expect(arg.rows[59].title).toBe('Escola (60/60)');
  });

  test('batch enfileirado offline (queued) propaga sem notificar', async () => {
    safeWriteManyMock.mockResolvedValue({ success: true, queued: true });
    const r = await createEvent({
      groupId: 'g1', title: 'Viagem', eventDate: '2026-07-01', endDate: '2026-07-04',
      allDay: true, createdBy: 'u1',
    });
    expect(r.success).toBe(true);
    expect(r.queued).toBe(true);
    expect(safeWriteManyMock).toHaveBeenCalledTimes(1);
  });
});
