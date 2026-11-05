#!/usr/bin/env node
/**
 * Captures real Expo-web screenshots of PastSeasonsCard into /workspace/past-seasons/.
 * Seeds journal + consent via localStorage before first paint (sample backend).
 * Dev-only; not imported by the app.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = '/workspace/past-seasons';
mkdirSync(outDir, { recursive: true });
const base = process.env.EXPO_WEB_URL || 'http://127.0.0.1:8081';

const require = createRequire(import.meta.url);
const puppeteer = require('/tmp/puppeteer-capture/node_modules/puppeteer-core');

function seed(mode) {
  const raw = execFileSync(process.execPath, [join(root, 'scripts/seed-past-seasons-web.mjs'), mode], {
    encoding: 'utf8',
  });
  return JSON.parse(raw);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--window-size=390,844'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
});

for (const mode of ['populated', 'under3', 'empty']) {
  const payload = seed(mode);
  const storage = payload.localStorage;
  const url = `${base}/dev/past-seasons-shot?placeId=${encodeURIComponent(payload.placeId)}&reference=2026-11-05`;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('pageerror', mode, e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('console', mode, m.text().slice(0, 200));
  });

  // Seed BEFORE any app JS runs so ConsentGate / AgeGate / journal see it on first paint.
  await page.evaluateOnNewDocument((entries) => {
    for (const [k, v] of Object.entries(entries)) {
      localStorage.setItem(k, v);
    }
  }, storage);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // If consent still shows (race), click through.
  for (let i = 0; i < 20; i++) {
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    if (text.includes('Past seasons shot')) break;
    if (text.includes('I understand and agree')) {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('div,button,span,a'));
        const btn = nodes.find((n) => (n.textContent || '').trim().startsWith('I understand and agree'));
        if (btn) (btn).click();
      });
    }
    // Age gate: look for typical confirm
    if (/I am 18|I'm 18|18 or older|Continue/i.test(text)) {
      await page.evaluate(() => {
        const nodes = Array.from(document.querySelectorAll('div,button,span'));
        const btn = nodes.find((n) => /18|Continue|Yes/i.test((n.textContent || '').trim()) && (n.textContent || '').length < 40);
        if (btn) (btn).click();
      });
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  await page.waitForFunction(
    () => document.body && document.body.innerText.includes('Past seasons shot'),
    { timeout: 60_000 },
  ).catch(async (err) => {
    console.error('wait failed', mode, err.message);
    console.error('body', await page.evaluate(() => document.body?.innerText?.slice(0, 800)));
  });

  // Extra settle for PastSeasonsCard journal load
  await new Promise((r) => setTimeout(r, 2000));
  const body = await page.evaluate(() => document.body?.innerText?.slice(0, 1200));
  console.log('---', mode, '---\n', body);

  const out = join(outDir, `real-${mode}.png`);
  await page.screenshot({ path: out, fullPage: true });
  writeFileSync(join(outDir, `real-${mode}.body.txt`), body + '\n');
  console.log('wrote', out);
  await page.close();
}

await browser.close();
