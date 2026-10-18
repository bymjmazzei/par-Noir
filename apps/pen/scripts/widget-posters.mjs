#!/usr/bin/env node
/**
 * Screenshot each curated starter widget into public/widget-posters/<id>.jpg.
 * Starts the Vite dev server on widget-posters.html (dev-only page) and uses headless Chromium.
 * Usage: npm run widget-posters (from apps/pen)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const MAX_BYTES = 200 * 1024;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'widget-posters');

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { port: 5199 }
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] || 'http://localhost:5199/').replace(/\/$/, '');

let browser;
try {
  const protocol = await server.ssrLoadModule(
    path.resolve(root, '../../packages/pen-protocol/src/widgetElements.ts')
  );
  const ids = protocol.CURATED_WIDGET_IDS;
  await mkdir(outDir, { recursive: true });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
  for (const id of ids) {
    await page.goto(`${base}/widget-posters.html?id=${encodeURIComponent(id)}`);
    await page.locator('[data-pen-compose-export-root]').first().waitFor({ state: 'visible', timeout: 30000 });
    const art = page.locator('[data-pen-html-snippet]').first();
    await art.waitFor({ state: 'visible', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const clip = await art.boundingBox();
    if (!clip) throw new Error(`${id}: art layer has no box`);
    let quality = 85;
    let shot = await page.screenshot({ type: 'jpeg', quality, clip });
    while (shot.length > MAX_BYTES && quality > 35) {
      quality -= 10;
      shot = await page.screenshot({ type: 'jpeg', quality, clip });
    }
    await writeFile(path.join(outDir, `${id}.jpg`), shot);
    console.log(`${id}.jpg ${Math.round(shot.length / 1024)}KB q${quality}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
