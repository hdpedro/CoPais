/**
 * Parity Reporter — Custom Playwright reporter that generates
 * a side-by-side comparison log (PWA vs Native).
 *
 * Output: tests/reports/parity.json + tests/reports/parity.html
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Reporter, TestCase, TestResult, FullResult, Suite } from '@playwright/test/reporter';

interface ParityEntry {
  testTitle: string;
  suite: string;
  pwa: { status: string; durationMs: number; error?: string } | null;
  expoWeb: { status: string; durationMs: number; error?: string } | null;
  match: boolean;
}

class ParityReporter implements Reporter {
  private results: Map<string, ParityEntry> = new Map();
  private reportDir: string;

  constructor() {
    this.reportDir = path.join(__dirname, '..', 'reports');
    if (!fs.existsSync(this.reportDir)) fs.mkdirSync(this.reportDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const project = test.parent?.project()?.name || 'unknown';
    const platform = project as 'pwa' | 'expo-web';
    const key = test.title;
    const suite = test.parent?.title || '';

    if (!this.results.has(key)) {
      this.results.set(key, {
        testTitle: key,
        suite,
        pwa: null,
        expoWeb: null,
        match: false,
      });
    }

    const entry = this.results.get(key)!;
    const data = {
      status: result.status,
      durationMs: result.duration,
      error: result.error?.message?.slice(0, 200),
    };

    if (platform === 'pwa') entry.pwa = data;
    else if (platform === 'expo-web') entry.expoWeb = data;

    // Check match
    entry.match = !!(entry.pwa && entry.expoWeb && entry.pwa.status === entry.expoWeb.status);
  }

  async onEnd(result: FullResult) {
    const entries = Array.from(this.results.values());

    // JSON report
    const jsonPath = path.join(this.reportDir, 'parity.json');
    fs.writeFileSync(jsonPath, JSON.stringify(entries, null, 2));

    // Stats
    const total = entries.length;
    const matched = entries.filter(e => e.match).length;
    const mismatched = entries.filter(e => e.pwa && e.expoWeb && !e.match).length;
    const pwaOnly = entries.filter(e => e.pwa && !e.expoWeb).length;
    const expoWebOnly = entries.filter(e => !e.pwa && e.expoWeb).length;

    // Timing report
    let timingHtml = '';
    try {
      const timingPath = path.join(this.reportDir, 'timing.json');
      if (fs.existsSync(timingPath)) {
        const timingData = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
        const actionMap: Record<string, Record<string, number[]>> = {};
        for (const e of timingData) {
          if (!actionMap[e.action]) actionMap[e.action] = { pwa: [], 'expo-web': [] };
          actionMap[e.action][e.platform as string].push(e.durationMs);
        }
        const rows = Object.entries(actionMap).map(([action, data]) => {
          const pwaAvg = data.pwa.length ? Math.round(data.pwa.reduce((a: number, b: number) => a + b, 0) / data.pwa.length) : '-';
          const expoWebAvg = data['expo-web'].length ? Math.round(data['expo-web'].reduce((a: number, b: number) => a + b, 0) / data['expo-web'].length) : '-';
          const winner = typeof pwaAvg === 'number' && typeof expoWebAvg === 'number'
            ? (Math.abs(pwaAvg - expoWebAvg) < 50 ? '=' : pwaAvg < expoWebAvg ? 'PWA' : 'Expo Web')
            : '-';
          const winnerClass = winner === 'PWA' ? 'pwa-win' : winner === 'Expo Web' ? 'native-win' : '';
          return `<tr><td>${action}</td><td>${pwaAvg}ms</td><td>${expoWebAvg}ms</td><td class="${winnerClass}">${winner}</td></tr>`;
        }).join('\n');
        timingHtml = `
          <h2>Performance Comparison</h2>
          <table><tr><th>Action</th><th>PWA (avg)</th><th>Expo Web (avg)</th><th>Winner</th></tr>
          ${rows}</table>`;
      }
    } catch {}

    // HTML report
    const rows = entries.map(e => {
      const pwaStatus = e.pwa ? `<span class="status-${e.pwa.status}">${e.pwa.status}</span> (${e.pwa.durationMs}ms)` : '<span class="status-skipped">-</span>';
      const expoWebStatus = e.expoWeb ? `<span class="status-${e.expoWeb.status}">${e.expoWeb.status}</span> (${e.expoWeb.durationMs}ms)` : '<span class="status-skipped">-</span>';
      const matchClass = e.match ? 'match' : (e.pwa && e.expoWeb ? 'mismatch' : 'incomplete');
      const matchIcon = e.match ? '✅' : (e.pwa && e.expoWeb ? '❌' : '⏳');
      const errorInfo = (!e.match && (e.pwa?.error || e.expoWeb?.error))
        ? `<div class="error">${e.pwa?.error || ''} | ${e.expoWeb?.error || ''}</div>` : '';
      return `<tr class="${matchClass}">
        <td>${e.suite}</td><td>${e.testTitle}</td>
        <td>${pwaStatus}</td><td>${expoWebStatus}</td>
        <td>${matchIcon}</td>
      </tr>${errorInfo ? `<tr class="error-row"><td colspan="5">${errorInfo}</td></tr>` : ''}`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Kindar Parity Report</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; margin: 0; padding: 20px; background: #f5f5f3; color: #2c2c2c; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .summary { display: flex; gap: 16px; margin: 16px 0; }
  .stat { background: white; border-radius: 12px; padding: 16px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .stat-value { font-size: 28px; font-weight: 800; }
  .stat-label { font-size: 12px; color: #8a8a8a; text-transform: uppercase; letter-spacing: 1px; }
  .stat-green .stat-value { color: #4CAF50; }
  .stat-red .stat-value { color: #E53935; }
  .stat-yellow .stat-value { color: #E8A228; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin: 16px 0; }
  th { background: #EEECEA; text-align: left; padding: 10px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #8a8a8a; }
  td { padding: 10px 16px; border-top: 1px solid #f0f0f0; font-size: 13px; }
  .match td { background: rgba(76,175,80,0.03); }
  .mismatch td { background: rgba(229,57,53,0.05); }
  .status-passed { color: #4CAF50; font-weight: 600; }
  .status-failed { color: #E53935; font-weight: 600; }
  .status-skipped { color: #8a8a8a; }
  .error { font-size: 11px; color: #E53935; padding: 4px 16px; }
  .error-row td { padding: 0; border: none; }
  .pwa-win { color: #5B9E85; font-weight: 600; }
  .native-win { color: #3b82f6; font-weight: 600; }
  .timestamp { color: #8a8a8a; font-size: 12px; margin-bottom: 20px; }
</style></head><body>
<h1>Kindar — Parity Report (PWA vs Expo Web)</h1>
<div class="timestamp">Generated: ${new Date().toLocaleString('pt-BR')}</div>
<div class="summary">
  <div class="stat stat-green"><div class="stat-value">${matched}</div><div class="stat-label">Match</div></div>
  <div class="stat stat-red"><div class="stat-value">${mismatched}</div><div class="stat-label">Mismatch</div></div>
  <div class="stat stat-yellow"><div class="stat-value">${pwaOnly + expoWebOnly}</div><div class="stat-label">Incomplete</div></div>
  <div class="stat"><div class="stat-value">${total}</div><div class="stat-label">Total Tests</div></div>
  <div class="stat ${matched === total ? 'stat-green' : 'stat-red'}"><div class="stat-value">${total > 0 ? Math.round(matched / total * 100) : 0}%</div><div class="stat-label">Parity</div></div>
</div>

<h2>Test Results</h2>
<table>
  <tr><th>Suite</th><th>Test</th><th>PWA</th><th>Expo Web</th><th>Match</th></tr>
  ${rows}
</table>

${timingHtml}

</body></html>`;

    const htmlPath = path.join(this.reportDir, 'parity.html');
    fs.writeFileSync(htmlPath, html);

    console.log(`\n📊 Parity Report: ${matched}/${total} tests match (${mismatched} mismatches)`);
    console.log(`   HTML: ${htmlPath}`);
    console.log(`   JSON: ${jsonPath}\n`);
  }
}

export default ParityReporter;
