/**
 * NFC adapter: native Capacitor plugin on native, Web NFC API on Chrome Android PWA.
 */

import { Capacitor } from '@capacitor/core';
import { NFC } from '@exxili/capacitor-nfc';

const PARNOIR_MIME_TYPE = 'application/x-parnoir-identity';

export interface NfcReadResult {
  uid: string;
  boundPnBlob?: string;
}

export interface NfcWriteRecord {
  recordType: 'mime';
  mediaType: string;
  data: Uint8Array;
}

function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

function hasWebNfc(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

/**
 * Check if NFC is supported (native or Web NFC).
 */
export async function isSupported(): Promise<boolean> {
  if (isNative()) {
    try {
      const result = await NFC.isSupported();
      return result.supported;
    } catch {
      return false;
    }
  }
  return hasWebNfc();
}

/**
 * Read tag to get UID (for export flow - binding).
 */
export async function readTagForUid(timeoutMs = 60000): Promise<string> {
  if (isNative()) {
    return new Promise<string>((resolve, reject) => {
      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          offRead();
          offErr();
          NFC.cancelScan().catch(() => {});
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout: tap your NFC card'));
      }, timeoutMs);

      const offRead = NFC.onRead((data: { string?: () => { tagInfo?: { uid?: string }; messages?: unknown[] } }) => {
        clearTimeout(timer);
        const parsed = typeof data.string === 'function' ? data.string() : null;
        const uid = parsed?.tagInfo?.uid ?? '';
        cleanup();
        if (uid) resolve(uid);
        else reject(new Error('Could not read tag UID'));
      });

      const offErr = NFC.onError((err: { message?: string }) => {
        clearTimeout(timer);
        cleanup();
        reject(new Error(err?.message ?? 'NFC read failed'));
      });

      if (Capacitor.getPlatform() === 'ios') {
        NFC.startScan().then(() => {}).catch((e) => {
          clearTimeout(timer);
          cleanup();
          reject(e);
        });
      }
    });
  }

  const NDEFReader = (window as Window & { NDEFReader?: new () => NDEFReaderInstance }).NDEFReader;
  if (!NDEFReader) throw new Error('NFC not supported');
  const ndef = new NDEFReader();
  const ac = new AbortController();
  return new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => {
      ndef.removeEventListener('reading', onRead);
      ndef.removeEventListener('error', onErr);
      ac.abort();
      reject(new Error('Timeout: tap your NFC card'));
    }, timeoutMs);
    const onRead = (evt: { serialNumber: string }) => {
      clearTimeout(t);
      ndef.removeEventListener('reading', onRead);
      ndef.removeEventListener('error', onErr);
      resolve(evt.serialNumber);
    };
    const onErr = (e: Event) => {
      clearTimeout(t);
      ndef.removeEventListener('reading', onRead);
      ndef.removeEventListener('error', onErr);
      reject((e as ErrorEvent).error ?? new Error('NFC read failed'));
    };
    ndef.addEventListener('reading', onRead);
    ndef.addEventListener('error', onErr);
    ndef.scan({ signal: ac.signal }).catch(reject);
  });
}

/**
 * Read tag and extract par Noir MIME record (for unlock).
 */
export async function readTagForUnlock(timeoutMs = 60000): Promise<NfcReadResult> {
  if (isNative()) {
    return new Promise<NfcReadResult>((resolve, reject) => {
      let resolved = false;
      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          offRead();
          offErr();
          NFC.cancelScan().catch(() => {});
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout: tap your NFC card'));
      }, timeoutMs);

      const offRead = NFC.onRead((data: {
        string?: () => { tagInfo?: { uid?: string }; messages?: { records?: { type?: string; payload?: string }[] }[] };
        uint8Array?: () => { messages?: { records?: { payload?: Uint8Array }[] }[] };
      }) => {
        clearTimeout(timer);
        const strData = typeof data.string === 'function' ? data.string() : null;
        const uid = strData?.tagInfo?.uid ?? '';
        let boundPnBlob: string | undefined;
        for (const msg of strData?.messages ?? []) {
          for (const rec of msg.records ?? []) {
            if (rec.type === PARNOIR_MIME_TYPE || (typeof rec.payload === 'string' && rec.payload.startsWith('{'))) {
              boundPnBlob = rec.payload as string;
              break;
            }
          }
          if (boundPnBlob) break;
        }
        if (!boundPnBlob && typeof data.uint8Array === 'function') {
          const uint8 = data.uint8Array();
          for (const msg of uint8?.messages ?? []) {
            for (const rec of msg.records ?? []) {
              const p = rec.payload;
              if (p && p.length) {
                const s = new TextDecoder().decode(p);
                if (s.startsWith('{')) {
                  boundPnBlob = s;
                  break;
                }
              }
            }
            if (boundPnBlob) break;
          }
        }
        cleanup();
        if (uid && boundPnBlob) {
          resolve({ uid, boundPnBlob });
        } else {
          reject(new Error(boundPnBlob ? 'Could not read tag UID' : 'pN identity not found on this card'));
        }
      });

      const offErr = NFC.onError((err: { message?: string }) => {
        clearTimeout(timer);
        cleanup();
        reject(new Error(err?.message ?? 'NFC read failed'));
      });

      if (Capacitor.getPlatform() === 'ios') {
        NFC.startScan().then(() => {}).catch((e) => {
          clearTimeout(timer);
          cleanup();
          reject(e);
        });
      }
    });
  }

  const NDEFReader = (window as Window & { NDEFReader?: new () => NDEFReaderInstance }).NDEFReader;
  if (!NDEFReader) throw new Error('NFC not supported');
  const ndef = new NDEFReader();
  const ac = new AbortController();
  return new Promise<NfcReadResult>((resolve, reject) => {
    const t = setTimeout(() => {
      ndef.removeEventListener('reading', onRead);
      ndef.removeEventListener('error', onErr);
      ac.abort();
      reject(new Error('Timeout: tap your NFC card'));
    }, timeoutMs);
    const onRead = async (evt: { serialNumber: string; message?: { records?: { recordType?: string; mediaType?: string; data?: DataView }[] } }) => {
      clearTimeout(t);
      ndef.removeEventListener('reading', onRead);
      ndef.removeEventListener('error', onErr);
      const uid = evt.serialNumber;
      const records = evt.message?.records ?? [];
      for (const r of records) {
        if (r.recordType === 'mime' && r.mediaType === PARNOIR_MIME_TYPE && r.data) {
          const boundPnBlob = new TextDecoder().decode(r.data);
          resolve({ uid, boundPnBlob });
          return;
        }
      }
      reject(new Error('pN identity not found on this card'));
    };
    const onErr = (e: Event) => {
      clearTimeout(t);
      ndef.removeEventListener('reading', onRead);
      ndef.removeEventListener('error', onErr);
      reject((e as ErrorEvent).error ?? new Error('NFC read failed'));
    };
    ndef.addEventListener('reading', onRead);
    ndef.addEventListener('error', onErr);
    ndef.scan({ signal: ac.signal }).catch(reject);
  });
}

interface NDEFReaderInstance {
  addEventListener: (type: string, handler: (evt: unknown) => void) => void;
  removeEventListener: (type: string, handler: (evt: unknown) => void) => void;
  scan: (opts?: { signal?: AbortSignal }) => Promise<void>;
  write: (msg: { records: { recordType?: string; mediaType?: string; data?: Uint8Array }[] }) => Promise<void>;
}

/**
 * Write NDEF message to tag. For par Noir export, pass a single MIME record.
 */
export async function writeTag(record: NfcWriteRecord): Promise<void> {
  if (isNative()) {
    const options = {
      rawMode: true,
      records: [
        {
          type: record.mediaType,
          payload: record.data,
        },
      ],
    };
    return new Promise<void>((resolve, reject) => {
      const offWrite = NFC.onWrite(() => {
        offWrite();
        offErr();
        resolve();
      });
      const offErr = NFC.onError((err) => {
        offWrite();
        offErr();
        reject(new Error((err as { message?: string }).message ?? 'NFC write failed'));
      });
      NFC.writeNDEF(options).then(() => {}).catch(reject);
    });
  }

  const NDEFReader = (window as Window & { NDEFReader?: new () => NDEFReaderInstance }).NDEFReader;
  if (!NDEFReader) throw new Error('NFC not supported');
  const ndef = new NDEFReader();
  await ndef.write({
    records: [
      {
        recordType: 'mime',
        mediaType: record.mediaType,
        data: record.data,
      },
    ],
  });
}
