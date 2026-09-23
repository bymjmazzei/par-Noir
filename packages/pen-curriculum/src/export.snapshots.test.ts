/**
 * Writes / verifies snapshots under packages/pen-curriculum/snapshots.
 * Agents and humans read those JSON files as teaching data.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCatalogSnapshot,
  buildPathGrammarSnapshot,
  buildAgentBuildSchemaSnapshot,
  CURRICULUM_PEN_PROTOCOL_VERSION
} from './catalog.js';
import { GOLDEN_FIXTURES } from './fixtures.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotsDir = path.join(root, 'snapshots');
const fixturesDir = path.join(root, 'fixtures');

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

describe('curriculum snapshots + fixture files', () => {
  it('exports catalog, path grammar, and schema; pins protocol version', () => {
    const catalog = buildCatalogSnapshot();
    expect(catalog.penProtocolVersion).toBe(CURRICULUM_PEN_PROTOCOL_VERSION);
    expect(catalog.templates.length).toBeGreaterThan(5);
    expect(catalog.templates.every((t) => t.agentStarter.includes('{{user_input}}'))).toBe(true);

    writeJson(path.join(snapshotsDir, 'catalog.json'), {
      ...catalog,
      exportedAt: new Date().toISOString()
    });
    writeJson(path.join(snapshotsDir, 'path-grammar.json'), buildPathGrammarSnapshot());
    writeJson(path.join(snapshotsDir, 'pen-agent-build.schema.json'), buildAgentBuildSchemaSnapshot());

    expect(fs.existsSync(path.join(snapshotsDir, 'catalog.json'))).toBe(true);
  });

  it('writes golden fixture intent + build files', () => {
    for (const fix of GOLDEN_FIXTURES) {
      const dir = path.join(fixturesDir, fix.dir);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'intent.md'), `${fix.intent}\n`, 'utf8');
      writeJson(path.join(dir, 'build.json'), fix.build);
      if (fix.asCurrent) {
        writeJson(path.join(dir, 'meta.json'), { asCurrent: true });
      }
    }
    expect(fs.existsSync(path.join(fixturesDir, 'notes/autumn-rain/build.json'))).toBe(true);
    expect(fs.existsSync(path.join(fixturesDir, 'register/contacts/build.json'))).toBe(true);
  });
});
