import { describe, expect, it, vi } from 'vitest';
import type { OwnerFileRow } from './model';
import { NotAnEncryptedPackageError, openPreviewSource, openStoredBlob, previewRenderKind } from './open';
import { resolvePreviewSource } from './preview';
import { resolveThumbSource } from './thumb';
import type { OwnerFilesTransport } from './transport';

function row(overrides: Partial<OwnerFileRow> = {}): OwnerFileRow {
  return {
    key: 'google_drive::acct:x',
    id: 'x',
    accountKey: 'google_drive::acct',
    accountId: 'acct',
    provider: 'google_drive',
    name: 'x',
    displayName: 'x',
    kind: 'encrypted-upload',
    origin: 'drive',
    driveFileId: 'x',
    size: 100,
    visibility: 'private',
    encrypted: true,
    indexed: false,
    ...overrides
  };
}

const penRow = (metadata: Record<string, unknown>) =>
  row({
    id: 'env',
    kind: 'pen-post',
    origin: 'catalog',
    driveFileId: 'env',
    metadataIndexFileId: 'env',
    encrypted: false,
    penDocId: 'doc-1',
    metadata
  });

describe('resolveThumbSource', () => {
  it('uses the feed CDN poster for a Pen post with feedPoster', () => {
    expect(resolveThumbSource(penRow({ feedPoster: { r2Key: 'k' } }))).toEqual({
      type: 'cdn',
      metadataIndexFileId: 'env',
      variant: 'poster'
    });
  });

  it('falls back to the Pen icon when a Pen post has no feedPoster', () => {
    expect(resolveThumbSource(penRow({}))).toEqual({ type: 'icon', icon: 'pen' });
  });

  it('decrypts the thumbnail sidecar when present', () => {
    expect(resolveThumbSource(row({ thumbDriveFileId: 't' }))).toMatchObject({
      type: 'stored',
      driveFileId: 't',
      encrypted: true
    });
  });

  it('decrypts small encrypted images without a thumb, but not PDFs', () => {
    expect(resolveThumbSource(row({ mimeType: 'image/png' }))).toMatchObject({ type: 'stored', driveFileId: 'x' });
    expect(resolveThumbSource(row({ mimeType: 'application/pdf' }))).toEqual({ type: 'icon', icon: 'pdf' });
  });

  it('uses the first child for a collection cover', () => {
    expect(resolveThumbSource(row({ kind: 'collection', collectionFileIds: ['c1', 'c2'] }))).toEqual({
      type: 'collection-cover',
      childMetadataIndexFileId: 'c1'
    });
  });
});

describe('resolvePreviewSource', () => {
  it('plays a Pen post from the CDN and never downloads the share envelope', () => {
    expect(resolvePreviewSource(penRow({ feedPoster: {} }))).toMatchObject({ type: 'cdn', variant: 'poster' });
    expect(resolvePreviewSource(penRow({ feedPoster: {}, feedPreviewSd: {} }))).toMatchObject({
      type: 'cdn',
      variant: 'sd',
      media: 'video'
    });
    expect(resolvePreviewSource(penRow({}))).toMatchObject({ type: 'unavailable' });
  });

  it('decrypts the stored main file for an encrypted upload', () => {
    expect(resolvePreviewSource(row({ mimeType: 'application/pdf' }))).toEqual({
      type: 'stored',
      accountKey: 'google_drive::acct',
      driveFileId: 'x',
      encrypted: true,
      mimeType: 'application/pdf'
    });
  });

  it('opens a note through its thumbnail image', () => {
    expect(resolvePreviewSource(row({ kind: 'note', thumbDriveFileId: 't' }))).toMatchObject({
      type: 'stored',
      driveFileId: 't',
      mimeType: 'image/png'
    });
  });
});

function transport(overrides: Partial<OwnerFilesTransport> = {}): OwnerFilesTransport {
  return {
    listDriveFiles: vi.fn(),
    fetchOwnerCatalog: vi.fn(),
    downloadFile: vi.fn(),
    resolvePublicMediaUrl: vi.fn().mockResolvedValue('https://feed-media.parnoir.com/x'),
    decryptPackage: vi.fn(),
    ...overrides
  };
}

describe('openStoredBlob', () => {
  const pkg = { encrypted: 'e', iv: 'i', salt: 's', metadata: { originalMimeType: 'application/pdf' } };

  it('decrypts private packages through transport.decryptPackage', async () => {
    const decrypted = new Blob(['%PDF'], { type: 'application/pdf' });
    const t = transport({
      downloadFile: vi.fn().mockResolvedValue(new Blob([JSON.stringify(pkg)])),
      decryptPackage: vi.fn().mockResolvedValue(decrypted)
    });
    const blob = await openStoredBlob(t, { accountKey: 'k', driveFileId: 'd', encrypted: true });
    expect(t.decryptPackage).toHaveBeenCalledWith(pkg);
    expect(blob.type).toBe('application/pdf');
    expect(previewRenderKind(blob.type)).toBe('pdf');
  });

  it('rejects a non-package (e.g. a public share envelope) instead of rendering raw bytes', async () => {
    const t = transport({
      downloadFile: vi.fn().mockResolvedValue(new Blob([JSON.stringify({ v: 1, ciphertext: 'abc' })]))
    });
    await expect(openStoredBlob(t, { accountKey: 'k', driveFileId: 'd', encrypted: true })).rejects.toBeInstanceOf(
      NotAnEncryptedPackageError
    );
  });

  it('resolves CDN previews through the transport without creating object URLs', async () => {
    const t = transport();
    const opened = await openPreviewSource(t, { type: 'cdn', metadataIndexFileId: 'env', variant: 'sd', media: 'video' });
    expect(t.resolvePublicMediaUrl).toHaveBeenCalledWith('env', 'sd');
    expect(opened).toMatchObject({ url: 'https://feed-media.parnoir.com/x', mimeType: 'video/*', revoke: false });
  });
});
