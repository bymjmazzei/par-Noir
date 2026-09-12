#!/usr/bin/env node
/**
 * Fresh-start messaging QA gate (dev / no users).
 *
 * Stale conversation sheets and half-applied mailbox jobs lie. Before claiming
 * DM/group work, wipe both clouds then reconnect.
 *
 * Usage:
 *   node apps/aggregator-browser/scripts/ux-messaging-fresh-start.mjs
 *   node apps/aggregator-browser/scripts/ux-messaging-fresh-start.mjs --check-fixtures
 *
 * Does not print secrets. Does not call Google without your tokens.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function hasFixture(name) {
  const dir = resolve(root, `.local/${name}`);
  return existsSync(resolve(dir, 'keys.env')) && (
    existsSync(resolve(dir, 'identity.pn')) ||
    (() => {
      const keys = readFileSync(resolve(dir, 'keys.env'), 'utf8');
      const file = keys.match(/^IDENTITY_FILE=(.+)$/m)?.[1]?.trim();
      return file ? existsSync(resolve(dir, file)) : false;
    })()
  );
}

function slog(...a) {
  process.stderr.write(a.join(' ') + '\n');
}

const checkOnly = process.argv.includes('--check-fixtures');

slog('=== Messaging fresh-start checklist ===');
slog('');
slog('1. Both fixtures present:');
slog(`   test-pn:   ${hasFixture('test-pn') ? 'OK' : 'MISSING'}`);
slog(`   test-pn-2: ${hasFixture('test-pn-2') ? 'OK' : 'MISSING'}`);
slog('');
slog('2. On BOTH Google Drives (each pN account):');
slog('   - Disconnect / remove connection both ways in messaging UI');
slog('   - Delete conversation-* and conversation-group-* spreadsheets under par-noir-messages');
slog('   - Clear stale inbox rows for that peer / group');
slog('   - Delete any leftover conversation-*.jsonl under par-noir-messages (legacy dual path)');
slog('');
slog('3. Mailbox: unlock each identity once and let drain ack pending jobs,');
slog('   or leave routes empty before reconnect so old ciphertext cannot ghost the thread.');
slog('');
slog('4. Clear local sealed outbox in each browser profile (DevTools → Application →');
slog('   Local Storage → remove keys starting with pn_sender_outbox_v1:).');
slog('');
slog('5. Fresh path: A connect → B accept → A send → confirm A Sheets Messages col B');
slog('   has ciphertext → B unlock/drain → B Sheets row → both UI show plaintext.');
slog('   Optional: create group → send → each member sheet gains a row.');
slog('');
slog('6. Hermetic gate (always):');

const test = spawnSync('npm', ['test'], {
  cwd: resolve(root, 'packages/device-cloud-credentials'),
  encoding: 'utf8'
});
process.stdout.write(test.stdout || '');
process.stderr.write(test.stderr || '');
if (test.status !== 0) {
  slog('FAIL: device-cloud-credentials tests');
  process.exit(test.status || 1);
}
slog('PASS: promoteOutbox / apply-inbound unit gates');

if (checkOnly) {
  if (!hasFixture('test-pn') || !hasFixture('test-pn-2')) process.exit(2);
  process.exit(0);
}

slog('');
slog('Product proof still requires the Drive wipe + dual-origin run above');
slog('(mvp-surface: do not claim messaging GA from unit tests alone).');
