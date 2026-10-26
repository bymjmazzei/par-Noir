import { describe, expect, it } from 'vitest';
import {
  createRecoveryDriveProofSecret,
  deleteLegacyRecoveryWorkbook,
  findRecoveryCustody,
  readLegacyRecoveryRoster,
  readRecoveryCustody,
  readRecoveryDriveProof,
  recoveryDriveProofHash,
  writeRecoveryCustody,
  writeRecoveryDriveProof,
  type RecoveryCustodyEntry,
} from './recoveryCustody.js';

type FakeFile = { id: string; name: string; mimeType: string; parents: string[]; content: string };

/** Minimal Google Drive v3 double: list by q, read media, create folder/multipart, update media. */
function fakeDrive(seed: FakeFile[], sheetRows: Record<string, string[][]> = {}) {
  const files = new Map(seed.map((f) => [f.id, f]));
  let next = 1;
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const bodyText = (body: unknown) =>
    typeof body === 'string' ? body : new TextDecoder().decode(body as Uint8Array);

  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') || '';
      const name = q.match(/name='([^']+)'/)?.[1];
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const mime = q.match(/mimeType='([^']+)'/)?.[1];
      const hits = [...files.values()].filter(
        (f) =>
          (!name || f.name === name) && (!parent || f.parents.includes(parent)) && (!mime || f.mimeType === mime)
      );
      return json({ files: hits.map(({ id, name: n }) => ({ id, name: n })) });
    }
    const media = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (method === 'GET' && media && url.searchParams.get('alt') === 'media') {
      const f = files.get(media[1]);
      return f ? new Response(f.content, { status: 200 }) : new Response('', { status: 404 });
    }
    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(bodyText(init?.body));
      const id = `f${next++}`;
      files.set(id, { id, name: meta.name, mimeType: meta.mimeType, parents: meta.parents || [], content: '' });
      return json({ id, name: meta.name });
    }
    if (method === 'POST' && url.pathname === '/upload/drive/v3/files') {
      const raw = bodyText(init?.body);
      const parts = raw.split('--pn_device_drive');
      const meta = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const content = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const id = `f${next++}`;
      files.set(id, { id, name: meta.name, mimeType: 'application/json', parents: meta.parents, content });
      return json({ id, name: meta.name });
    }
    const update = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (method === 'PATCH' && update) {
      const f = files.get(update[1])!;
      f.content = bodyText(init?.body);
      return json({ id: f.id, name: f.name });
    }
    if (method === 'DELETE' && media) {
      return files.delete(media[1]) ? new Response(null, { status: 204 }) : new Response('', { status: 404 });
    }
    const values = url.pathname.match(/^\/v4\/spreadsheets\/([^/]+)\/values\//);
    if (method === 'GET' && values) {
      return json({ values: sheetRows[decodeURIComponent(values[1])] ?? [] });
    }
    return new Response('unsupported', { status: 500 });
  }) as unknown as typeof fetch;

  return { files, fetchImpl };
}

const FOLDER = 'application/vnd.google-apps.folder';

function entry(epoch: number, custodianId = 'c1'): RecoveryCustodyEntry {
  return {
    ownerPublicKey: 'owner-pk',
    custodianId,
    shareIndex: 2,
    epoch,
    sealedShare: JSON.stringify({ v: 1, epoch }),
    storedAt: new Date().toISOString(),
  };
}

describe('recovery custody on the custodian Drive', () => {
  it('round-trips sealed shares and creates _metadata when missing', async () => {
    const drive = fakeDrive([
      { id: 'root', name: 'par-noir-pn-cust', mimeType: FOLDER, parents: [], content: '' },
    ]);
    const opts = { accessToken: 'at', pnIdentifier: 'pn-cust', fetchImpl: drive.fetchImpl };
    expect(await readRecoveryCustody(opts)).toEqual([]);

    const first = entry(1);
    await writeRecoveryCustody({ ...opts, entries: [first, entry(1, 'c9')] });
    const meta = [...drive.files.values()].find((f) => f.name === '_metadata');
    expect(meta?.parents).toEqual(['root']);

    const all = await readRecoveryCustody(opts);
    expect(all.map((e) => e.custodianId).sort()).toEqual(['c1', 'c9']);
    expect(await findRecoveryCustody({ ...opts, custodianId: 'c1', epoch: 1 })).toEqual(first);
  });

  it('a new epoch replaces the slot and an older epoch is ignored', async () => {
    const drive = fakeDrive([
      { id: 'root', name: 'par-noir-pn-cust', mimeType: FOLDER, parents: [], content: '' },
    ]);
    const opts = { accessToken: 'at', pnIdentifier: 'pn-cust', fetchImpl: drive.fetchImpl };
    await writeRecoveryCustody({ ...opts, entries: [entry(1)] });
    await writeRecoveryCustody({ ...opts, entries: [entry(2)] });
    await writeRecoveryCustody({ ...opts, entries: [entry(1)] });

    const all = await readRecoveryCustody(opts);
    expect(all).toHaveLength(1);
    expect(all[0].epoch).toBe(2);
    expect(await findRecoveryCustody({ ...opts, custodianId: 'c1', epoch: 1 })).toBeNull();
    expect([...drive.files.values()].filter((f) => f.name === 'recovery-custody.json')).toHaveLength(1);
  });

  it('owner release proof is written once and read back, and hashes deterministically', async () => {
    const drive = fakeDrive([
      { id: 'root', name: 'par-noir-pn-owner', mimeType: FOLDER, parents: [], content: '' },
    ]);
    const opts = { accessToken: 'at', pnIdentifier: 'pn-owner', fetchImpl: drive.fetchImpl };
    expect(await readRecoveryDriveProof(opts)).toBeNull();
    const secret = createRecoveryDriveProofSecret();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    await writeRecoveryDriveProof({ ...opts, secret });
    expect(await readRecoveryDriveProof(opts)).toBe(secret);
    expect(await recoveryDriveProofHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('reads the legacy workbook roster without shares and deletes the workbook', async () => {
    const SHEET = 'application/vnd.google-apps.spreadsheet';
    const drive = fakeDrive(
      [
        { id: 'root', name: 'par-noir-pn-owner', mimeType: FOLDER, parents: [], content: '' },
        { id: 'meta', name: '_metadata', mimeType: FOLDER, parents: ['root'], content: '' },
        { id: 'wb', name: 'recovery.xlsx', mimeType: SHEET, parents: ['meta'], content: '' },
      ],
      {
        wb: [
          ['c1', 'Alice', 'person', 'enc-share', '1', 'cred', 'accepted', '2025-01-01', 'true'],
          ['c2', 'Bob', 'person', 'enc-share', '2', 'cred', 'revoked', '2025-01-01', 'false'],
          ['vault_share_3', 'vault', 'vault', 'enc-share', '3', '', 'vault', '2025-01-01', 'false'],
        ],
      }
    );
    const opts = { accessToken: 'at', pnIdentifier: 'pn-owner', fetchImpl: drive.fetchImpl };
    const roster = await readLegacyRecoveryRoster(opts);
    expect(roster?.workbookId).toBe('wb');
    expect(roster?.custodians).toEqual([
      expect.objectContaining({ custodianId: 'c1', name: 'Alice', status: 'accepted', unrevokable: true }),
    ]);
    expect(JSON.stringify(roster)).not.toContain('enc-share');

    await deleteLegacyRecoveryWorkbook({ ...opts, workbookId: 'wb' });
    expect(drive.files.has('wb')).toBe(false);
    expect(await readLegacyRecoveryRoster(opts)).toBeNull();
  });

  it('refuses to write when the pN root folder is missing', async () => {
    const drive = fakeDrive([]);
    await expect(
      writeRecoveryCustody({
        accessToken: 'at',
        pnIdentifier: 'pn-none',
        fetchImpl: drive.fetchImpl,
        entries: [entry(1)],
      })
    ).rejects.toThrow('pn_root_not_found');
  });
});
