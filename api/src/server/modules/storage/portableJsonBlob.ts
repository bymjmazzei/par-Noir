import { resolveStorageContext } from './storageFacade';

export async function readPortableJsonBlob<T>(
  pnIdentifier: string,
  relativePath: string,
  accountId?: string
): Promise<T | null> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  if (!ctx.blobStore) return null;
  const key = `${ctx.rootPrefix}${relativePath}`;
  const raw = await ctx.blobStore.get(key);
  if (!raw) return null;
  return JSON.parse(Buffer.from(raw).toString('utf8')) as T;
}

export async function writePortableJsonBlob(
  pnIdentifier: string,
  relativePath: string,
  data: unknown,
  accountId?: string
): Promise<void> {
  const ctx = await resolveStorageContext(pnIdentifier, accountId);
  if (!ctx.blobStore) {
    throw new Error('Portable blob store not available');
  }
  const key = `${ctx.rootPrefix}${relativePath}`;
  await ctx.blobStore.put(key, Buffer.from(JSON.stringify(data), 'utf8'), {
    contentType: 'application/json'
  });
}
