import type { PenMediaBackend, PenMediaRecord } from './backend';

/** In-memory backend for unit tests. */
export function createMemoryPenMediaBackend(): PenMediaBackend {
  const byId = new Map<string, PenMediaRecord>();
  return {
    async put(record) {
      byId.set(record.id, record);
    },
    async get(mediaId) {
      return byId.get(mediaId) ?? null;
    },
    async getByDriveFileId(fileId) {
      for (const rec of byId.values()) {
        if (rec.driveFileId === fileId) return rec;
      }
      return null;
    },
    async delete(mediaId) {
      byId.delete(mediaId);
    },
    async listIdsForDoc(docId) {
      return [...byId.values()].filter((r) => r.docId === docId).map((r) => r.id);
    }
  };
}
