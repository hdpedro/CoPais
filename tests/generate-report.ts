/**
 * Generate consolidated parity + performance report.
 *
 * Usage: npx ts-node tests/generate-report.ts
 * Or: called automatically by the parity-reporter after test run.
 */

import * as fs from 'fs';
import * as path from 'path';

const REPORTS_DIR = path.join(__dirname, 'reports');

function main() {
  console.log('\n🔍 KINDAR TEST PIPELINE — CONSOLIDATED REPORT\n');
  console.log('═'.repeat(60));

  // 1. Parity results
  const parityPath = path.join(REPORTS_DIR, 'parity.json');
  if (fs.existsSync(parityPath)) {
    const entries = JSON.parse(fs.readFileSync(parityPath, 'utf-8'));
    const total = entries.length;
    const matched = entries.filter((e: any) => e.match).length;
    const mismatched = entries.filter((e: any) => e.pwa && e.expoWeb && !e.match).length;

    console.log('\n📊 PARITY (PWA vs Expo Web)');
    console.log(`   Total tests:  ${total}`);
    console.log(`   ✅ Match:     ${matched}`);
    console.log(`   ❌ Mismatch:  ${mismatched}`);
    console.log(`   📈 Parity:    ${total > 0 ? Math.round(matched / total * 100) : 0}%`);

    if (mismatched > 0) {
      console.log('\n   Mismatches:');
      entries.filter((e: any) => e.pwa && e.expoWeb && !e.match).forEach((e: any) => {
        console.log(`   ❌ ${e.testTitle}: PWA=${e.pwa.status}, ExpoWeb=${e.expoWeb.status}`);
        if (e.pwa.error) console.log(`      PWA error: ${e.pwa.error}`);
        if (e.expoWeb.error) console.log(`      Expo Web error: ${e.expoWeb.error}`);
      });
    }
  } else {
    console.log('\n⚠️ No parity data found. Run: npm run test:parity');
  }

  // 2. Performance results
  const timingPath = path.join(REPORTS_DIR, 'timing.json');
  if (fs.existsSync(timingPath)) {
    const timings = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
    const actionMap: Record<string, Record<string, number[]>> = {};
    for (const t of timings) {
      if (!actionMap[t.action]) actionMap[t.action] = { pwa: [], 'expo-web': [] };
      actionMap[t.action][t.platform as string].push(t.durationMs);
    }

    console.log('\n\n⚡ PERFORMANCE (PWA vs Expo Web)');
    console.log('   ' + 'Action'.padEnd(25) + 'PWA'.padEnd(10) + 'ExpoWeb'.padEnd(10) + 'Winner');
    console.log('   ' + '─'.repeat(55));

    for (const [action, data] of Object.entries(actionMap)) {
      const pwaAvg = data.pwa.length ? Math.round(data.pwa.reduce((a, b) => a + b) / data.pwa.length) : '-';
      const expoWebAvg = data['expo-web'].length ? Math.round(data['expo-web'].reduce((a, b) => a + b) / data['expo-web'].length) : '-';
      let winner = '-';
      if (typeof pwaAvg === 'number' && typeof expoWebAvg === 'number') {
        winner = Math.abs(pwaAvg - expoWebAvg) < 50 ? '=' : pwaAvg < expoWebAvg ? 'PWA' : 'ExpoWeb';
      }
      const name = action.replace('perf_', '').replace('load_', '');
      console.log(`   ${name.padEnd(25)}${String(pwaAvg).padEnd(10)}${String(expoWebAvg).padEnd(10)}${winner}`);
    }
  }

  // 3. Playwright results
  const resultsPath = path.join(REPORTS_DIR, 'results.json');
  if (fs.existsSync(resultsPath)) {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
    const suites = results.suites || [];

    let passed = 0, failed = 0, skipped = 0;
    function countResults(suite: any) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          for (const result of test.results || []) {
            if (result.status === 'passed') passed++;
            else if (result.status === 'failed') failed++;
            else skipped++;
          }
        }
      }
      for (const child of suite.suites || []) countResults(child);
    }
    for (const s of suites) countResults(s);

    console.log('\n\n📋 OVERALL RESULTS');
    console.log(`   ✅ Passed:  ${passed}`);
    console.log(`   ❌ Failed:  ${failed}`);
    console.log(`   ⏭️ Skipped: ${skipped}`);
    console.log(`   📊 Total:   ${passed + failed + skipped}`);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('📁 HTML Report: tests/reports/parity.html');
  console.log('📁 JSON Data:   tests/reports/parity.json');
  console.log('📁 Timing Data:  tests/reports/timing.json');
  console.log('═'.repeat(60) + '\n');
}

main();
