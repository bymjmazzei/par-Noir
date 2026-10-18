import * as Y from 'yjs';

/** Step 1: what this replica already has. */
export function penLiveStateVector(ydoc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(ydoc);
}

/** Step 2: everything the requester is missing, or null when it is already current. */
export function penLiveDiffFor(ydoc: Y.Doc, remoteStateVector: Uint8Array): Uint8Array | null {
  const diff = Y.encodeStateAsUpdate(ydoc, remoteStateVector);
  // An empty update encodes as [0 structs, 0 delete sets].
  return diff.length > 2 ? diff : null;
}
