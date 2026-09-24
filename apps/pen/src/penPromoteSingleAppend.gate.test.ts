/**
 * Gate: Commit must append history.chain once via pen.publish only.
 * Falsifies: promote() still awaits applyPenPromoteInbound or queues
 * section_promote before publish without ownCloudApplied.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const editorPath = resolve(__dirname, 'pages/DocEditorPage.tsx');

describe('Pen promote single-append gate', () => {
  const src = readFileSync(editorPath, 'utf8');
  // Narrow to async function promote() … next sibling async function
  const promoteStart = src.indexOf('async function promote()');
  const promoteEnd = src.indexOf('async function inviteCollaborator()', promoteStart);
  const promote = src.slice(promoteStart, promoteEnd > 0 ? promoteEnd : undefined);

  it('promote calls publishDocCloud with link', () => {
    expect(promote).toMatch(/await publishDocCloud\(\{/);
    expect(promote).toMatch(/\blink\b/);
  });

  it('promote does not call applyPenPromoteInbound', () => {
    expect(promote).not.toMatch(/applyPenPromoteInbound/);
  });

  it('peer fanout uses ownCloudApplied when queueing section_promote', () => {
    if (/queuePenSectionPromote\(/.test(promote)) {
      expect(promote).toMatch(/ownCloudApplied:\s*true/);
      // Must not queue before successful publish
      const queueIdx = promote.indexOf('queuePenSectionPromote');
      const publishIdx = promote.indexOf('await publishDocCloud');
      expect(queueIdx).toBeGreaterThan(publishIdx);
    }
  });
});
