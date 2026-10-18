import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChatKey, sealSocialEnvelope } from '@par-noir/dm-crypto';
import { mlKem768Keygen } from '@par-noir/pqc-crypto';
import { mlDsa65Keygen } from '@par-noir/pqc-crypto/ml-dsa';
import { bytesToBase64, signRekey } from '@par-noir/pen-live';
import { hashPnIdentifier } from '@par-noir/pen-protocol';
import type { PenSession } from './penSession';

vi.mock('./penDriveLibrary', () => ({
  penSessionDrive: vi.fn(),
  readLiveSnapshotFile: vi.fn(),
  writeLiveSnapshotFile: vi.fn()
}));
vi.mock('./penOwnerFetch', () => ({ ownerFetch: vi.fn(), ownerGet: vi.fn() }));

import { applyPenLiveRekey } from './penCollab';
import { loadDocKey } from './penDocCrypto';

function kem() {
  const k = mlKem768Keygen();
  return { pub: bytesToBase64(k.publicKey), secret: bytesToBase64(k.secretKey) };
}

describe('owner re-key, member side', () => {
  const docId = 'doc_rekey';
  const groupId = 'grp_rekey';
  const owner = mlDsa65Keygen();
  const anchor = { docId, ownerPnHash: 'owner', ownerMlDsaPublicKey: bytesToBase64(owner.publicKey) };
  const stay = { pn: 'pn-stay', kem: kem() };
  const gone = { pn: 'pn-gone', kem: kem() };
  const sessionOf = (m: typeof stay) =>
    ({ pnIdentifier: m.pn, mlKemSecretKey: m.kem.secret, accessToken: 't' }) as unknown as PenSession;

  beforeEach(() => {
    const data = new Map<string, string>();
    const mem = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, String(v)),
      removeItem: (k: string) => void data.delete(k),
      clear: () => data.clear(),
      key: (i: number) => [...data.keys()][i] ?? null,
      get length() {
        return data.size;
      }
    };
    vi.stubGlobal('localStorage', mem);
    vi.stubGlobal('sessionStorage', mem);
  });

  async function rekeyFor(newKey: string, recipients: Array<typeof stay>, ownerSecret = owner.secretKey) {
    const keys: Record<string, string> = {};
    for (const m of recipients) {
      keys[hashPnIdentifier(m.pn)] = JSON.stringify(
        await sealSocialEnvelope(m.kem.pub, groupId, { docKey: newKey, docId, keyEpoch: 1, liveClaimSecret: 's' })
      );
    }
    return signRekey({
      docId,
      keyEpoch: 1,
      roles: recipients.map((m) => ({ pnHash: hashPnIdentifier(m.pn), role: 'collaborator' as const })),
      keys,
      owner: { pnHash: 'owner', mlDsaSecretKey: ownerSecret }
    });
  }

  it('a remaining member opens the new key; the removed member gets nothing', async () => {
    const newKey = generateChatKey();
    const rekey = await rekeyFor(newKey, [stay]);

    const kept = await applyPenLiveRekey({ session: sessionOf(stay), groupId, rekey, anchor, currentEpoch: 0 });
    expect(kept?.docKey).toBe(newKey);
    expect(kept?.keyEpoch).toBe(1);
    expect(loadDocKey(docId)).toBe(newKey);

    sessionStorage.clear();
    const removed = await applyPenLiveRekey({ session: sessionOf(gone), groupId, rekey, anchor, currentEpoch: 0 });
    expect(removed).toBeNull();
    expect(loadDocKey(docId)).toBeNull();
  });

  it('an envelope opens only for the member it was sealed to', async () => {
    const sealedToStay = JSON.stringify(
      await sealSocialEnvelope(stay.kem.pub, groupId, { docKey: generateChatKey(), docId, keyEpoch: 1 })
    );
    const misdirected = signRekey({
      docId,
      keyEpoch: 1,
      roles: [{ pnHash: hashPnIdentifier(gone.pn), role: 'collaborator' }],
      keys: { [hashPnIdentifier(gone.pn)]: sealedToStay },
      owner: { pnHash: 'owner', mlDsaSecretKey: owner.secretKey }
    });
    expect(
      await applyPenLiveRekey({ session: sessionOf(gone), groupId, rekey: misdirected, anchor, currentEpoch: 0 })
    ).toBeNull();
    expect(loadDocKey(docId)).toBeNull();
  });

  it('refuses a re-key not signed by the owner, or not newer than the current epoch', async () => {
    const forged = await rekeyFor(generateChatKey(), [stay], mlDsa65Keygen().secretKey);
    expect(await applyPenLiveRekey({ session: sessionOf(stay), groupId, rekey: forged, anchor, currentEpoch: 0 })).toBeNull();
    const stale = await rekeyFor(generateChatKey(), [stay]);
    expect(await applyPenLiveRekey({ session: sessionOf(stay), groupId, rekey: stale, anchor, currentEpoch: 1 })).toBeNull();
    expect(loadDocKey(docId)).toBeNull();
  });
});
