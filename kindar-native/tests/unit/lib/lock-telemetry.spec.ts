/**
 * lock-telemetry — testes da filtragem central de volume.
 *
 * Garante que:
 *  1. Eventos high-volume (transições esperadas) são silenciados em modo
 *     normal — defesa contra regressão que voltaria a inundar app_errors.
 *  2. Eventos de DECISÃO raros (RELOCK, failure, cooldown, failsafe, etc.)
 *     SEMPRE são logados — preservam capacidade de debug.
 *  3. Em plataforma não-iOS, NADA loga (telemetria opt-in).
 *  4. source tag e filePath são montados corretamente.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

const reportErrorMock = vi.fn();

vi.mock('../../../app/_src/lib/error-reporter', () => ({
  reportError: reportErrorMock,
}));

async function loadTelemetry(platformOS: 'ios' | 'android' | 'web') {
  vi.resetModules();
  reportErrorMock.mockClear();
  vi.doMock('react-native', () => ({
    Platform: { OS: platformOS },
  }));
  return import('../../../app/_src/lib/lock-telemetry');
}

afterEach(() => {
  vi.doUnmock('react-native');
});

describe('lock-telemetry — filtro de volume', () => {
  test('silencia eventos high-volume em modo normal (iOS)', async () => {
    const { logLockTelemetry } = await loadTelemetry('ios');
    logLockTelemetry('lock', 'requestUnlock.start');
    logLockTelemetry('lock', 'requestUnlock.finally');
    logLockTelemetry('lock', 'requestUnlock.success');
    logLockTelemetry('lock', 'markBackground.set');
    logLockTelemetry('lock', 'evaluateOnForeground.skip.withinWindow');
    logLockTelemetry('lock', 'evaluateOnForeground.skip.grace_consumed');
    logLockTelemetry('lock', 'evaluateOnForeground.skip.noBackground');
    logLockTelemetry('lockgate', 'appstate.change');
    logLockTelemetry('lockscreen', 'mount');
    logLockTelemetry('lockscreen', 'unmount');
    logLockTelemetry('lockscreen', 'tryUnlock.start');
    logLockTelemetry('lockscreen', 'tryUnlock.result');
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  test('SEMPRE loga eventos de decisão raros (iOS)', async () => {
    const { logLockTelemetry } = await loadTelemetry('ios');
    const criticalEvents = [
      'evaluateOnForeground.RELOCK',
      'requestUnlock.failure',
      'requestUnlock.skip.in_flight',
      'requestUnlock.failsafe.timeout',
      'postUnlockGrace.failsafe.clear',
      'markBackground.skip.isAuthenticating',
      'markBackground.skip.cooldown',
      'evaluateOnForeground.skip.isAuthenticating',
      'evaluateOnForeground.skip.alreadyLocked',
      'evaluateOnForeground.skip.cooldown',
      'tryUnlock.skip.unmounted',
      'tryUnlock.skip.alreadyAuthenticating',
    ];
    for (const evt of criticalEvents) {
      logLockTelemetry('lock', evt);
    }
    expect(reportErrorMock).toHaveBeenCalledTimes(criticalEvents.length);
  });

  test('não loga nada fora do iOS', async () => {
    const { logLockTelemetry } = await loadTelemetry('android');
    logLockTelemetry('lock', 'evaluateOnForeground.RELOCK');
    logLockTelemetry('lockgate', 'appstate.change');
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  test('mensagem inclui source tag + timestamp', async () => {
    const { logLockTelemetry } = await loadTelemetry('ios');
    logLockTelemetry('lockgate', 'evaluateOnForeground.RELOCK', { elapsed: 5000 });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
    const [error, ctx] = reportErrorMock.mock.calls[0];
    expect((error as Error).message).toMatch(/^\[lockgate\] evaluateOnForeground\.RELOCK @ \d+$/);
    expect(ctx).toMatchObject({
      severity: 'info',
      filePath: 'app/_src/components/LockGate.tsx',
      metadata: expect.objectContaining({
        event: 'evaluateOnForeground.RELOCK',
        elapsed: 5000,
      }),
    });
  });

  test('filePath varia por source', async () => {
    const { logLockTelemetry } = await loadTelemetry('ios');
    logLockTelemetry('lock', 'evaluateOnForeground.RELOCK');
    logLockTelemetry('lockgate', 'evaluateOnForeground.RELOCK');
    logLockTelemetry('lockscreen', 'tryUnlock.skip.unmounted');
    const filePaths = reportErrorMock.mock.calls.map(c => (c[1] as { filePath: string }).filePath);
    expect(filePaths).toEqual([
      'app/_src/store/lock.ts',
      'app/_src/components/LockGate.tsx',
      'app/_src/components/LockScreen.tsx',
    ]);
  });
});
