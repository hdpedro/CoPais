/**
 * Timing utilities — measures performance of actions across platforms.
 * Stores results in a JSON log for comparison.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TimingEntry {
  test: string;
  platform: 'pwa' | 'expo-web';
  action: string;
  durationMs: number;
  timestamp: string;
}

const LOG_PATH = path.join(__dirname, '..', 'reports', 'timing.json');

let entries: TimingEntry[] = [];

// Load existing entries
try {
  if (fs.existsSync(LOG_PATH)) {
    entries = JSON.parse(fs.readFileSync(LOG_PATH, 'utf-8'));
  }
} catch {
  entries = [];
}

export function logTiming(entry: TimingEntry) {
  entries.push(entry);
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

export async function measureAction<T>(
  testName: string,
  platform: 'pwa' | 'expo-web',
  actionName: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const durationMs = Date.now() - start;

  logTiming({
    test: testName,
    platform,
    action: actionName,
    durationMs,
    timestamp: new Date().toISOString(),
  });

  return result;
}

export function getTimingReport(): {
  comparisons: Array<{
    action: string;
    pwaDurationMs: number;
    expoWebDurationMs: number;
    diffMs: number;
    diffPercent: string;
    winner: 'pwa' | 'expo-web' | 'tie';
  }>;
} {
  // Group by action
  const actionMap: Record<string, { pwa: number[]; 'expo-web': number[] }> = {};

  for (const e of entries) {
    if (!actionMap[e.action]) actionMap[e.action] = { pwa: [], 'expo-web': [] };
    actionMap[e.action][e.platform].push(e.durationMs);
  }

  const comparisons = Object.entries(actionMap).map(([action, data]) => {
    const pwaAvg = data.pwa.length > 0 ? data.pwa.reduce((a, b) => a + b, 0) / data.pwa.length : 0;
    const expoWebAvg = data['expo-web'].length > 0 ? data['expo-web'].reduce((a, b) => a + b, 0) / data['expo-web'].length : 0;
    const diffMs = Math.round(expoWebAvg - pwaAvg);
    const diffPercent = pwaAvg > 0 ? ((diffMs / pwaAvg) * 100).toFixed(1) + '%' : 'N/A';
    const winner = Math.abs(diffMs) < 50 ? 'tie' as const : diffMs < 0 ? 'expo-web' as const : 'pwa' as const;

    return {
      action,
      pwaDurationMs: Math.round(pwaAvg),
      expoWebDurationMs: Math.round(expoWebAvg),
      diffMs,
      diffPercent,
      winner,
    };
  });

  return { comparisons };
}
