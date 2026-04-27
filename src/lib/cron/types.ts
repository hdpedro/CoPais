/**
 * Shared types for cron job executor and logging.
 * Used by cron-executor.ts and any future cron-related utilities.
 */

export interface CronResult {
  success: boolean;
  processed: number;
  sent: number;
  errors?: string[];
  metadata?: Record<string, unknown>;
}

export interface CronReport {
  name: string;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  success: boolean;
  processed: number;
  sent: number;
  errors: string[];
}

export interface DailyReport {
  date: string;
  totalCrons: number;
  successCount: number;
  failureCount: number;
  totalProcessed: number;
  totalSent: number;
  totalErrors: number;
  details: CronReport[];
}
