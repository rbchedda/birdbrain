#!/usr/bin/env node
/**
 * Captures real Expo-web screenshots of SpotVerdictCard into /workspace/spot-verdict/.
 * Dev-only; seeds consent via localStorage before first paint (sample backend).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/workspace/spot-verdict';
mkdirSync(outDir, { recursive: true });
const base = process.env.EXPO_WEB_URL || 'http://127.0.0.1:8081';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/puppeteer-capture/node_modules/puppeteer-core');

const termsPath = join(root, 'app/src/data/terms.ts');
const tv = readFileSync(termsPath, 'utf8').match(/TERMS_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1] ?? '2026-10-22';
const storage = {
  'birdbrain.termsAccepted.v1': JSON.stringify({
    acceptedAt: '2026-11-01T12:00:00.000Z',
    appVersion: '0.1.0',
    termsVersion: tv,
  }),
  'birdbrain.ageGate.v1': JSON.stringify('passed'),
  'birdbrain.journal.v2': JSON.stringify([]),
};

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
});

const modes = ['productive', 'slow', 'empty', 'closed', 'crew'];
for (const mode of modes) {
  const url = `${base}/dev/spot-verdict-shot?mode=${mode}`;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', mode, e.message));
  await page.evaluateOnNewDocument((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, storage);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  for (let i = 0; i < 20; i++) {
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    if (text.includes('Spot verdict shot')) break;
    if (text.includes('I understand and agree')) {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('div,button,span,a'));
        const btn = nodes.find((n) => (n.textContent || '').trim().startsWith('I understand and agree'));
        if (btn) btn.click();
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await page.waitForFunction(
    () => document.body && document.body.innerText.includes('Spot verdict shot'),
    { timeout: 60_000 },
  ).catch(async (err) => {
    const body = await page.evaluate(() => document.body?.innerText?.slice(0, 500) ?? '');
    writeFileSync(join(outDir, `real-${mode}.body.txt`), body);
    throw err;
  });

  await page.waitForSelector('[data-testid="spot-verdict"]', { timeout: 15_000 }).catch(() => {});
  const body = await page.evaluate(() => document.body?.innerText ?? '');
  writeFileSync(join(outDir, `real-${mode}.body.txt`), body);
  await page.screenshot({ path: join(outDir, `real-${mode}.png`), fullPage: false });
  console.log('wrote', mode);
  await page.close();
}

await browser.close();
console.log('done →', outDir);
