/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./penCloudStore', () => ({
  fetchDocFromDrive: vi.fn()
}));
vi.mock('./penDriveLibrary', () => ({
  penSessionDrive: vi.fn(async () => ({
    accessToken: 'ga',
    index: { sheetIds: { groups: 'groups-sheet' } }
  }))
}));
vi.mock('@par-noir/device-cloud-credentials', async () => {
  const actual = await vi.importActual<typeof import('@par-noir/device-cloud-credentials')>(
    '@par-noir/device-cloud-credentials'
  );
  return {
    ...actual,
    decryptCloudDoc: vi.fn(),
    openDocKeysFromGroups: vi.fn()
  };
});

import { fetchDocFromDrive } from './penCloudStore';
import { decryptCloudDoc, openDocKeysFromGroups } from '@par-noir/device-cloud-credentials';
import { hydrateDocFromCloud, PEN_HYDRATE_LAST_FAIL_KEY } from './penHydrate';
import type { PenSession } from './penSession';

const session = {
  pnIdentifier: 'pn-test',
  accessToken: 'tok',
  mlKemSecretKey: 'kem-secret'
} as PenSession;

describe('hydrateDocFromCloud outcomes', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(fetchDocFromDrive).mockReset();
    vi.mocked(decryptCloudDoc).mockReset();
    vi.mocked(openDocKeysFromGroups).mockReset();
  });

  it('records cloud_fetch_empty when Drive has no manifest/chain', async () => {
    vi.mocked(fetchDocFromDrive).mockResolvedValue({
      manifest: null,
      chain: null,
      currentSections: [],
      drafts: []
    });
    const out = await hydrateDocFromCloud({ session, docId: 'pen_missing' });
    expect(out.bundle).toBeNull();
    expect(out.failReason).toBe('cloud_fetch_empty');
    expect(JSON.parse(localStorage.getItem(PEN_HYDRATE_LAST_FAIL_KEY) || '{}').failReason).toBe(
      'cloud_fetch_empty'
    );
  });

  it('records mlkem_missing when unwrap needs ML-KEM and session lacks it', async () => {
    vi.mocked(fetchDocFromDrive).mockResolvedValue({
      manifest: {
        docId: 'pen_x',
        title: 'X',
        groupId: 'grp_1',
        toc: ['body'],
        templateId: 'blank.custom',
        templateVersion: '1',
        createdAt: 't',
        updatedAt: 't'
      } as never,
      chain: { genesisHash: 'g', links: [] } as never,
      currentSections: [{ slug: 'body', ciphertext: 'enc' }],
      drafts: []
    });
    vi.mocked(decryptCloudDoc).mockRejectedValue(new Error('doc_key_required'));
    const out = await hydrateDocFromCloud({
      session: { ...session, mlKemSecretKey: undefined },
      docId: 'pen_x'
    });
    expect(out.bundle).toBeNull();
    expect(out.failReason).toBe('mlkem_missing');
  });

  it('records decrypt_failed when wraps exist but decrypt still fails', async () => {
    vi.mocked(fetchDocFromDrive).mockResolvedValue({
      manifest: {
        docId: 'pen_x',
        title: 'X',
        groupId: 'grp_1',
        toc: ['body'],
        templateId: 'blank.custom',
        templateVersion: '1',
        createdAt: 't',
        updatedAt: 't'
      } as never,
      chain: { genesisHash: 'g', links: [] } as never,
      currentSections: [{ slug: 'body', ciphertext: 'enc' }],
      drafts: []
    });
    vi.mocked(openDocKeysFromGroups).mockResolvedValue([
      { docKey: 'bad-key', liveClaimSecret: null, keyEpoch: 1 }
    ]);
    vi.mocked(decryptCloudDoc).mockRejectedValue(new Error('section_decrypt_failed'));

    const out = await hydrateDocFromCloud({ session, docId: 'pen_x' });
    expect(out.bundle).toBeNull();
    expect(out.failReason).toBe('decrypt_failed');
  });
});
