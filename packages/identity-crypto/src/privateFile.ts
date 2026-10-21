/**
 * Owner-private file packages: AES-GCM bodies keyed from the owner's stable pN id + public key.
 * The dashboard and Unlock both open private files through this one path.
 */

import { EncryptionManager } from './encryptionManager';

export type PrivateFilePackageShape = {
  encrypted: string;
  iv: string;
  salt: string;
  metadata?: { originalMimeType?: string; [key: string]: unknown };
};

export type PrivateFileOwner = { id: string; publicKey: string };

export async function decryptPrivateFile<P extends PrivateFilePackageShape>(
  pkg: P,
  owner: PrivateFileOwner
): Promise<{ bytes: Uint8Array; mimeType: string; metadata: P['metadata'] }> {
  if (!owner.id || !owner.publicKey) {
    throw new Error('Missing required session data: id and publicKey are required');
  }
  const bytes = await new EncryptionManager().decrypt(
    pkg.encrypted,
    pkg.iv,
    pkg.salt,
    owner.id,
    owner.publicKey
  );
  return {
    bytes,
    mimeType: pkg.metadata?.originalMimeType || 'application/octet-stream',
    metadata: pkg.metadata,
  };
}

export async function decryptPrivateFileBlob<P extends PrivateFilePackageShape>(
  pkg: P,
  owner: PrivateFileOwner
): Promise<{ decryptedBlob: Blob; metadata: P['metadata'] }> {
  const { bytes, mimeType, metadata } = await decryptPrivateFile(pkg, owner);
  return { decryptedBlob: new Blob([bytes as BlobPart], { type: mimeType }), metadata };
}
