import { describe, expect, it } from 'vitest';
import { EncryptionManager } from './encryptionManager';
import { decryptPrivateFile, decryptPrivateFileBlob } from './privateFile';

const owner = { id: 'did:key:z6MkOwner', publicKey: 'owner-public-key' };

async function sealText(text: string, mime = 'text/plain') {
  const enc = await new EncryptionManager().encrypt(new TextEncoder().encode(text), owner.id, owner.publicKey);
  return {
    version: '1',
    ...enc,
    metadata: {
      originalName: 'note.txt',
      originalSize: text.length,
      originalMimeType: mime,
      encryptedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('private file packages', () => {
  it('opens an owner-sealed package to bytes, mime type and metadata', async () => {
    const pkg = await sealText('private body', 'text/markdown');
    const out = await decryptPrivateFile(pkg, owner);
    expect(new TextDecoder().decode(out.bytes)).toBe('private body');
    expect(out.mimeType).toBe('text/markdown');
    expect(out.metadata?.originalName).toBe('note.txt');
  });

  it('wraps the plaintext in a Blob typed from the package', async () => {
    const pkg = await sealText('blob body');
    const { decryptedBlob } = await decryptPrivateFileBlob(pkg, owner);
    expect(decryptedBlob.type).toBe('text/plain');
    expect(await decryptedBlob.text()).toBe('blob body');
  });

  it('refuses another owner and missing owner material', async () => {
    const pkg = await sealText('not yours');
    await expect(decryptPrivateFile(pkg, { ...owner, publicKey: 'other' })).rejects.toThrow();
    await expect(decryptPrivateFile(pkg, { id: '', publicKey: owner.publicKey })).rejects.toThrow(
      /id and publicKey/
    );
  });
});
