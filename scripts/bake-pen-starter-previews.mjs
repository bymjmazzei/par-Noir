#!/usr/bin/env node
/**
 * Bake Social starter gallery SVG previews (inert layers only).
 * Usage: node scripts/bake-pen-starter-previews.mjs
 * Requires packages/pen-protocol built (or vitest path via --import).
 *
 * Prefer: cd packages/pen-protocol && npx vitest run src/seedPreviewBake.gate.test.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distEntry = join(root, 'packages/pen-protocol/dist/index.js');
const outDir = join(root, 'packages/pen-protocol/src/starter-assets/previews');

async function main() {
  let mod;
  try {
    mod = await import(pathToFileURL(distEntry).href);
  } catch {
    console.error('Build pen-protocol first: cd packages/pen-protocol && npm run build');
    process.exit(1);
  }
  const { listStarterTemplates, renderTemplatePreviewSvg, getClass } = mod;
  mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const t of listStarterTemplates()) {
    const form = getClass(t.classId);
    if (form?.parentId !== 'social' && form?.id !== 'social') continue;
    if (!t.seedGalleryPreviewSrc) continue;
    const svg = renderTemplatePreviewSvg(t);
    if (!svg) continue;
    const file = `${t.id}.svg`;
    writeFileSync(join(outDir, file), svg, 'utf8');
    n += 1;
    console.log('wrote', file);
  }
  console.log(`baked ${n} social starter previews → ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
