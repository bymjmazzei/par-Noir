import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = dirname(fileURLToPath(import.meta.url));

describe('pen doc join route', () => {
  it('registers /d/:docId/join and claim client', () => {
    const app = readFileSync(join(root, 'App.tsx'), 'utf8');
    expect(app).toContain('/d/:docId/join');
    expect(app).toContain('DocJoinPage');
    const invite = readFileSync(join(root, 'services/penDocInvite.ts'), 'utf8');
    expect(invite).toContain('/api/pen/invites/');
    expect(invite).toContain('/claim');
  });

  it('ShareMenu supports connections and join link', () => {
    const share = readFileSync(join(root, 'components/ShareMenu.tsx'), 'utf8');
    expect(share).toContain('onInviteConnections');
    expect(share).toContain('onCreateJoinLink');
  });
});
