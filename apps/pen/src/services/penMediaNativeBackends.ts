/**
 * Cap Filesystem + Electron secure-volume backends for @par-noir/pen-media.
 */

import {
  configurePenMediaBackend,
  createIdbPenMediaBackend,
  type PenMediaBackend,
  type PenMediaRecord
} from '@par-noir/pen-media';
import { decryptPenMedia, encryptPenMedia } from '@par-noir/dm-crypto';
import { isCapacitorNative, isPenDesktop } from './penPlatform';
import { loadDocKey } from './penDocCrypto';

type PenDesktopFs = {
  mediaRead: (docId: string, mediaId: string) => Promise<{ mime: string; base64: string; driveFileId?: string } | null>;
  mediaWrite: (opts: {
    docId: string;
    mediaId: string;
    mime: string;
    base64: string;
    driveFileId?: string;
    sealed: boolean;
  }) => Promise<void>;
  mediaDelete: (docId: string, mediaId: string) => Promise<void>;
  mediaList: (docId: string) => Promise<string[]>;
  mediaGetByDriveFileId: (
    fileId: string
  ) => Promise<{ docId: string; mediaId: string; mime: string; base64: string } | null>;
  mediaGetById?: (mediaId: string) => Promise<{
    docId: string;
    mime: string;
    base64: string;
    driveFileId?: string;
    sealed?: boolean;
  } | null>;
};

function desktopFs(): PenDesktopFs | null {
  return (window as Window & { penDesktop?: PenDesktopFs }).penDesktop ?? null;
}

function b64FromBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.onerror = () => reject(reader.error || new Error('read_failed'));
    reader.readAsDataURL(blob);
  });
}

function blobFromB64(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function createCapBackendWithIndex(): Promise<PenMediaBackend> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem');
  const root = 'pen-media';
  const pathFor = (docId: string, mediaId: string) => `${root}/${docId}/${mediaId}.bin`;

  const backend: PenMediaBackend = {
    async put(record) {
      const b64 = await b64FromBlob(record.blob);
      await Filesystem.writeFile({
        path: pathFor(record.docId, record.id),
        data: b64,
        directory: Directory.Data,
        recursive: true
      });
      const metaB64 = btoa(
        JSON.stringify({
          id: record.id,
          docId: record.docId,
          mime: record.mime,
          updatedAt: record.updatedAt,
          driveFileId: record.driveFileId
        })
      );
      await Filesystem.writeFile({
        path: `${root}/_index/${record.id}.json`,
        data: metaB64,
        directory: Directory.Data,
        recursive: true
      });
      if (record.driveFileId) {
        await Filesystem.writeFile({
          path: `${root}/_byDrive/${record.driveFileId}.json`,
          data: btoa(JSON.stringify({ mediaId: record.id })),
          directory: Directory.Data,
          recursive: true
        });
      }
    },
    async get(mediaId) {
      try {
        const idx = await Filesystem.readFile({
          path: `${root}/_index/${mediaId}.json`,
          directory: Directory.Data
        });
        const meta = JSON.parse(atob(String(idx.data))) as PenMediaRecord;
        const file = await Filesystem.readFile({
          path: pathFor(meta.docId, mediaId),
          directory: Directory.Data
        });
        return {
          id: mediaId,
          docId: meta.docId,
          mime: meta.mime,
          updatedAt: meta.updatedAt,
          driveFileId: meta.driveFileId,
          blob: blobFromB64(String(file.data), meta.mime)
        };
      } catch {
        return null;
      }
    },
    async getByDriveFileId(fileId) {
      try {
        const idx = await Filesystem.readFile({
          path: `${root}/_byDrive/${fileId}.json`,
          directory: Directory.Data
        });
        const { mediaId } = JSON.parse(atob(String(idx.data))) as { mediaId: string };
        return backend.get(mediaId);
      } catch {
        return null;
      }
    },
    async delete(mediaId) {
      const rec = await backend.get(mediaId);
      if (!rec) return;
      try {
        await Filesystem.deleteFile({
          path: pathFor(rec.docId, mediaId),
          directory: Directory.Data
        });
      } catch {
        /* ignore */
      }
      try {
        await Filesystem.deleteFile({
          path: `${root}/_index/${mediaId}.json`,
          directory: Directory.Data
        });
      } catch {
        /* ignore */
      }
    },
    async listIdsForDoc(docId) {
      try {
        const listing = await Filesystem.readdir({
          path: `${root}/${docId}`,
          directory: Directory.Data
        });
        return (listing.files || [])
          .map((f) => f.name)
          .filter((n) => n.endsWith('.bin'))
          .map((n) => n.replace(/\.bin$/, ''));
      } catch {
        return [];
      }
    }
  };
  return backend;
}

function createElectronSecureVolumeBackend(): PenMediaBackend {
  const api = () => {
    const fs = desktopFs();
    if (!fs) throw new Error('pen_desktop_fs_unavailable');
    return fs;
  };

  return {
    async put(record) {
      const docKey = loadDocKey(record.docId);
      let blob = record.blob;
      let sealed = false;
      if (docKey) {
        blob = await encryptPenMedia(record.blob, docKey);
        sealed = true;
      }
      const base64 = await b64FromBlob(blob);
      await api().mediaWrite({
        docId: record.docId,
        mediaId: record.id,
        mime: record.mime,
        base64,
        driveFileId: record.driveFileId,
        sealed
      });
    },
    async get(mediaId) {
      const hit = await api().mediaGetById?.(mediaId);
      if (!hit) return null;
      let blob = blobFromB64(hit.base64, hit.mime || 'application/octet-stream');
      if (hit.sealed) {
        const key = loadDocKey(hit.docId);
        if (!key) return null;
        blob = await decryptPenMedia(blob, key, hit.mime);
      }
      return {
        id: mediaId,
        docId: hit.docId,
        mime: hit.mime,
        blob,
        updatedAt: new Date().toISOString(),
        driveFileId: hit.driveFileId
      };
    },
    async getByDriveFileId(fileId) {
      const hit = await api().mediaGetByDriveFileId(fileId);
      if (!hit) return null;
      let blob = blobFromB64(hit.base64, hit.mime || 'application/octet-stream');
      const key = loadDocKey(hit.docId);
      if (key) {
        try {
          blob = await decryptPenMedia(blob, key, hit.mime);
        } catch {
          /* raw cache */
        }
      }
      return {
        id: hit.mediaId,
        docId: hit.docId,
        mime: hit.mime,
        blob,
        updatedAt: new Date().toISOString(),
        driveFileId: fileId
      };
    },
    async delete(mediaId) {
      const rec = await this.get(mediaId);
      if (!rec) return;
      await api().mediaDelete(rec.docId, mediaId);
    },
    async listIdsForDoc(docId) {
      return api().mediaList(docId);
    }
  };
}

/** Call once at Pen bootstrap. */
export function bootstrapPenMediaBackend(): void {
  if (isPenDesktop()) {
    configurePenMediaBackend(createElectronSecureVolumeBackend());
    return;
  }
  if (isCapacitorNative()) {
    void createCapBackendWithIndex().then((backend) => configurePenMediaBackend(backend));
    return;
  }
  configurePenMediaBackend(createIdbPenMediaBackend());
}
