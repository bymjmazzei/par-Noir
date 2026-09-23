/**
 * Hermetic: PenAgentBuild → createDocFromAgentBuild (local buffer; cloud optional).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./services/penCloudStore', () => ({
  bootstrapDocCloud: vi.fn().mockRejectedValue(new Error('cloud_token_required'))
}));
vi.mock('./services/penApi', () => ({
  requestNotaryStamp: vi.fn().mockRejectedValue(new Error('skip_notary'))
}));
vi.mock('./services/penSyncQueue', () => ({
  enqueueSyncJob: vi.fn()
}));

import { createDocFromAgentBuild } from './services/createDocFromAgentBuild';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    }
  };
}

describe('createDocFromAgentBuild', () => {
  beforeEach(() => {
    const mem = memoryStorage();
    vi.stubGlobal('sessionStorage', mem);
    vi.stubGlobal('localStorage', mem);
  });

  it('creates a local doc from a valid agent build', async () => {
    const bundle = await createDocFromAgentBuild({
      session: {
        accessToken: 'test-token',
        pnIdentifier: 'pn-agent-test'
      },
      build: {
        templateId: 'note.basic.v1',
        title: 'From agent',
        sections: [{ slug: 'body', plainText: 'Built by an external agent.' }]
      }
    });
    expect(bundle.manifest.title).toBe('From agent');
    expect(bundle.manifest.templateId).toBe('note.basic.v1');
    expect(bundle.sections.some((s) => s.slug === 'body')).toBe(true);
    expect(bundle.manifest.genesisProof).toBeTruthy();
  });

  it('rejects invalid agent builds', async () => {
    await expect(
      createDocFromAgentBuild({
        session: { accessToken: 't', pnIdentifier: 'pn-x' },
        build: { templateId: 'note.basic.v1', title: '', sections: [] }
      })
    ).rejects.toThrow(/pen_agent_build_invalid/);
  });
});
