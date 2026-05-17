/**
 * Lightweight error reporter for Kindar Native.
 *
 * Forwards uncaught errors and explicit `reportError()` calls to the PWA
 * endpoint `/api/log-error` (same pipeline used by the web — writes to
 * the `app_errors` table and pings Discord). The previous native build
 * shipped with zero error visibility, so production crashes were silent.
 *
 * Why not @sentry/react-native?
 *   - It's a native module that requires an EAS build update + DSN
 *     configuration. This module avoids that bar by reusing the existing
 *     PWA error-tracking pipeline.
 *   - When the team is ready to layer Sentry on top, this stays compatible
 *     (the wrapper just logs to both sinks).
 *
 * Usage:
 *   import { reportError, installGlobalErrorHandlers } from '@/lib/error-reporter';
 *   installGlobalErrorHandlers();
 *   ...
 *   try { ... } catch (e) { reportError(e, { filePath: 'app/foo.tsx' }); }
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

// Severity hierarchy (alinhada com app_errors.severity check constraint
// migration 00085 + report-server.ts no PWA):
//   info     — telemetria útil (timeouts, eventos rastreados) sem acordar ninguém
//   warning  — degradação operacional não-bloqueante
//   error    — operação falhou, user impactado
//   critical — crash / data loss
type Severity = 'info' | 'warning' | 'error' | 'critical';

interface ReportContext {
  filePath?: string;
  severity?: Severity;
  metadata?: Record<string, unknown>;
}

let installed = false;
const inFlight = new Set<string>();

function fingerprint(message: string, stack?: string): string {
  return `${message}::${(stack || '').split('\n').slice(0, 3).join('|')}`;
}

export async function reportError(error: unknown, context: ReportContext = {}): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    // Dedupe: don't spam the backend with the exact same error in quick
    // succession (e.g. a render loop that throws every frame).
    const fp = fingerprint(err.message, err.stack);
    if (inFlight.has(fp)) return;
    inFlight.add(fp);
    setTimeout(() => inFlight.delete(fp), 30_000);

    let userId: string | undefined;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
    } catch {
      // Non-fatal — we still report anonymously.
    }

    const body = {
      message: err.message.slice(0, 1000),
      stack: err.stack?.slice(0, 4000),
      filePath: context.filePath,
      userId,
      severity: context.severity ?? 'error',
      metadata: {
        ...(context.metadata ?? {}),
        platform: Platform.OS,
        platformVersion: String(Platform.Version),
        appOrigin: 'kindar-native',
      },
    };

    await fetch(`${WEB_URL}/api/log-error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Fire-and-forget — never block the user on telemetry.
      keepalive: true,
    } as RequestInit);
  } catch {
    // Telemetry must never break the app.
  }
}

/**
 * Install global handlers for uncaught promise rejections and (when
 * possible) JS errors. Call once from `app/_layout.tsx`.
 */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  // Unhandled promise rejections — supported in modern RN runtimes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis;
  if (g.HermesInternal && typeof g.process?.on === 'function') {
    try {
      g.process.on('unhandledRejection', (reason: unknown) => {
        reportError(reason, { severity: 'error', filePath: 'unhandledRejection' });
      });
    } catch {
      // ignore — runtime may not support it
    }
  }

  // ErrorUtils — RN's global error handler. Wraps the previous handler so
  // we both report and let the original (red box in dev) still work.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ErrorUtils = (globalThis as any).ErrorUtils;
  if (ErrorUtils?.getGlobalHandler) {
    const previous = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      reportError(error, {
        severity: isFatal ? 'critical' : 'error',
        filePath: 'globalErrorHandler',
        metadata: { isFatal: !!isFatal },
      });
      if (typeof previous === 'function') previous(error, isFatal);
    });
  }
}
