#!/usr/bin/env node
/**
 * Screenshot catalog posters with headless Chromium on the dev-only widget-posters.html stage.
 * npm run widget-posters    curated starter widgets into public/widget-posters/<id>.jpg (art layer)
 * npm run template-posters  platform post templates into public/template-posters/<id>/<page>.jpg (every page, full frame)
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const MAX_BYTES = 200 * 1024;
const templates = process.argv.includes('--templates');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', templates ? 'template-posters' : 'widget-posters');

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  logLevel: 'error',
  server: { port: 5199 }
});
await server.listen();
const base = (server.resolvedUrls?.local?.[0] || 'http://localhost:5199/').replace(/\/$/, '');

/** The page frame sits centered inside the padded export root. */
async function frameClip(page) {
  const stage = page.locator('[data-poster-frame-w]').first();
  const w = Number(await stage.getAttribute('data-poster-frame-w'));
  const h = Number(await stage.getAttribute('data-poster-frame-h'));
  const box = await page.locator('[data-pen-compose-export-root]').first().boundingBox();
  if (!box) return null;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

/** Poster jobs: one per widget, or one per template page. */
async function posterJobs() {
  if (!templates) {
    const curated = await server.ssrLoadModule(path.resolve(root, '../../packages/pen-protocol/src/curated/index.ts'));
    return curated.CURATED_WIDGET_IDS.map((id) => ({ query: `id=${encodeURIComponent(id)}`, file: `${id}.jpg` }));
  }
  const registry = await server.ssrLoadModule(path.resolve(root, '../../packages/pen-protocol/src/templates.ts'));
  return registry.PLATFORM_POST_TEMPLATE_IDS.flatMap((id) =>
    registry.getTemplate(id).seedSections.map((section) => ({
      query: `id=${encodeURIComponent(id)}&page=${encodeURIComponent(section.slug)}`,
      file: path.join(id, `${section.slug}.jpg`)
    }))
  );
}

let browser;
try {
  const jobs = await posterJobs();
  if (templates) await rm(outDir, { recursive: true, force: true });
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 2 });
  for (const job of jobs) {
    await page.goto(`${base}/widget-posters.html?${job.query}`);
    await page.locator('[data-pen-compose-export-root]').first().waitFor({ state: 'visible', timeout: 30000 });
    const art = page.locator('[data-pen-html-snippet]').first();
    await art.waitFor({ state: 'visible', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(templates ? 1500 : 800);
    const clip = templates ? await frameClip(page) : await art.boundingBox();
    if (!clip) throw new Error(`${job.file}: no poster box`);
    let quality = 85;
    let shot = await page.screenshot({ type: 'jpeg', quality, clip });
    while (shot.length > MAX_BYTES && quality > 35) {
      quality -= 10;
      shot = await page.screenshot({ type: 'jpeg', quality, clip });
    }
    const out = path.join(outDir, job.file);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, shot);
    console.log(`${job.file} ${Math.round(shot.length / 1024)}KB q${quality}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
