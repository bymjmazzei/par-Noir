#!/usr/bin/env node
/**
 * Maintainer inventory of markdown files. Writes docs-inventory.csv at repo root.
 * Usage: node scripts/docs-inventory.mjs
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(REPO_ROOT, 'docs-inventory.csv');

const SKIP_DIR = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.firebase',
  '.local',
]);

const INDEX_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/README.md',
  'api/README.md',
];

const C_PATTERNS = [
  /CONTINUE_FIX_PROMPT/i,
  /SETUP_COMPLETE/i,
  /OAUTH-DEBUG-STEPS/i,
  /TASK_LIST\.md$/i,
  /QUICK_START_REFACTORING/i,
  /PHASE\d+_COMPLETE/i,
  /verify-redis\.md$/i,
  /^docs\/legal\//,
  /DIAGNOSTIC_\d{4}-\d{2}-\d{2}/,
];

function walkMd(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkMd(full, acc);
    else if (ent.name.endsWith('.md')) acc.push(full);
  }
  return acc;
}

function rel(p) {
  return path.relative(REPO_ROOT, p).split(path.sep).join('/');
}

function gitLastDate(filePath) {
  try {
    return execSync(`git log -1 --format=%cs -- "${filePath}"`, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function loadSearchCorpus() {
  const md = [];
  const code = [];
  for (const f of walkMd(REPO_ROOT)) md.push({ rel: rel(f), text: fs.readFileSync(f, 'utf8') });
  function walkCode(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIR.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walkCode(full);
      else if (/\.(ts|tsx|mdc|mjs|js)$/.test(ent.name)) {
        code.push({ rel: rel(full), text: fs.readFileSync(full, 'utf8') });
      }
    }
  }
  walkCode(REPO_ROOT);
  return { md, code };
}

function suggestedTier(relPath) {
  if (relPath.startsWith('packages/pen-curriculum/fixtures/') && relPath.endsWith('intent.md')) {
    return 'A';
  }
  if (relPath.startsWith('docs/archive/plans/')) return 'B';
  if (relPath.startsWith('docs/archive/')) return 'B';
  for (const re of C_PATTERNS) {
    if (re.test(relPath)) return 'C';
  }
  if (/MIGRATION_(PROGRESS|STATUS|COMPLETE)\.md$/.test(relPath)) return 'C';
  if (/^(FINAL_STATUS|IMPLEMENTATION_SUMMARY)\.md$/.test(path.basename(relPath))) {
    if (relPath.startsWith('docs/security/')) return 'C';
  }
  if (['README.md', 'CONTRIBUTING.md', 'SHARED_CODE_RULES.md', 'PRIVACY_POLICY.md', 'TERMS_OF_SERVICE.md', 'CODE_OF_CONDUCT.md'].includes(relPath)) {
    return 'A';
  }
  if (relPath.startsWith('docs/architecture/ADR_')) return 'A';
  if (relPath.startsWith('docs/developer/')) return 'A';
  if (relPath.startsWith('docs/ops/')) return 'A';
  if (relPath.startsWith('docs/api/')) return 'A';
  if (relPath.startsWith('docs/standards/')) return 'A';
  return '';
}

function escapeCsv(s) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const corpus = loadSearchCorpus();
const files = walkMd(REPO_ROOT).map(rel).sort();

const indexListed = new Set();
for (const idx of INDEX_FILES) {
  const p = path.join(REPO_ROOT, idx);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf8');
  for (const f of files) {
    if (text.includes(f) || text.includes(path.basename(f))) indexListed.add(f);
  }
}

const rows = [['path', 'bytes', 'last_commit', 'inbound_md_links', 'inbound_code_refs', 'listed_in_index', 'suggested_tier']];

for (const relPath of files) {
  const abs = path.join(REPO_ROOT, relPath);
  const stat = fs.statSync(abs);
  const base = path.basename(relPath);
  let mdLinks = 0;
  for (const doc of corpus.md) {
    if (doc.rel === relPath) continue;
    if (doc.text.includes(relPath) || doc.text.includes(base)) mdLinks++;
  }
  let codeRefs = 0;
  for (const c of corpus.code) {
    if (c.rel === relPath) continue;
    if (c.text.includes(relPath) || c.text.includes(base)) codeRefs++;
  }
  rows.push([
    relPath,
    String(stat.size),
    gitLastDate(abs),
    String(mdLinks),
    String(codeRefs),
    indexListed.has(relPath) ? 'yes' : 'no',
    suggestedTier(relPath),
  ]);
}

const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n') + '\n';
fs.writeFileSync(OUT, csv);
console.log(`Wrote ${files.length} rows to ${path.relative(REPO_ROOT, OUT)}`);
