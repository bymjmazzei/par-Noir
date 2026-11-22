/**
 * Desktop device-custody drafts on the shared secure volume (Electron only).
 */

import type { PenDocManifest, PenSectionContent } from '@par-noir/pen-protocol';
import type { LocalDocBundle } from './penLocalStore';
import { isPenDesktop } from './penPlatform';
import { loadDocKey, mintDocKey } from './penDocCrypto';

export type DeviceDraftMeta = {
  docId: string;
  title: string;
  updatedAt: string;
  custody: 'device';
  classId?: string;
  templateId?: string;
};

type PenDesktopCustody = {
  secureVolumeStatus: () => Promise<{ mounted: boolean; mountPoint: string | null }>;
  secureVolumeUnlock: (payload: {
    publicKey: string;
    pnIdentifier: string;
    authToken: string;
  }) => Promise<{ mounted: boolean; mountPoint: string | null }>;
  draftWrite: (opts: {
    docId: string;
    draftBase64: string;
    meta: DeviceDraftMeta;
  }) => Promise<void>;
  draftRead: (docId: string) => Promise<{ draftBase64: string; meta: DeviceDraftMeta } | null>;
  draftList: () => Promise<DeviceDraftMeta[]>;
  draftDelete: (docId: string) => Promise<void>;
};

function api(): PenDesktopCustody | null {
  return (window as Window & { penDesktop?: PenDesktopCustody }).penDesktop ?? null;
}

export function deviceCustodyAvailable(): boolean {
  return isPenDesktop() && Boolean(api());
}

export function isDeviceCustody(manifest: Pick<PenDocManifest, 'custody'> | null | undefined): boolean {
  return manifest?.custody === 'device';
}

export async function ensureSecureVolumeMounted(params: {
  publicKey: string;
  pnIdentifier: string;
  authToken: string;
}): Promise<string> {
  const desk = api();
  if (!desk) throw new Error('pen_desktop_unavailable');
  const status = await desk.secureVolumeStatus();
  if (status.mounted && status.mountPoint) return status.mountPoint;
  const next = await desk.secureVolumeUnlock({
    publicKey: params.publicKey,
    pnIdentifier: params.pnIdentifier,
    authToken: params.authToken
  });
  if (!next.mounted || !next.mountPoint) throw new Error('secure_volume_mount_failed');
  return next.mountPoint;
}

async function sealDraftJson(docId: string, bundle: LocalDocBundle): Promise<string> {
  const key = mintDocKey(docId);
  const { encryptPenMedia } = await import('@par-noir/dm-crypto');
  const plain = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
  const sealed = await encryptPenMedia(plain, key);
  const buf = await sealed.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

async function unsealDraftJson(docId: string, draftBase64: string): Promise<LocalDocBundle> {
  const key = loadDocKey(docId);
  if (!key) throw new Error('doc_key_missing');
  const { decryptPenMedia } = await import('@par-noir/dm-crypto');
  const bin = atob(draftBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const sealed = new Blob([bytes]);
  const plain = await decryptPenMedia(sealed, key, 'application/json');
  const text = await plain.text();
  return JSON.parse(text) as LocalDocBundle;
}

export async function saveDeviceCustodyDraft(bundle: LocalDocBundle): Promise<void> {
  const desk = api();
  if (!desk) throw new Error('pen_desktop_unavailable');
  const docId = bundle.manifest.docId;
  const draftBase64 = await sealDraftJson(docId, bundle);
  const meta: DeviceDraftMeta = {
    docId,
    title: bundle.manifest.title || 'Untitled',
    updatedAt: bundle.manifest.updatedAt,
    custody: 'device',
    classId: bundle.manifest.classId,
    templateId: bundle.manifest.templateId
  };
  await desk.draftWrite({ docId, draftBase64, meta });
}

export async function loadDeviceCustodyDraft(docId: string): Promise<LocalDocBundle | null> {
  const desk = api();
  if (!desk) return null;
  const hit = await desk.draftRead(docId);
  if (!hit) return null;
  return unsealDraftJson(docId, hit.draftBase64);
}

export async function listDeviceCustodyDrafts(): Promise<DeviceDraftMeta[]> {
  const desk = api();
  if (!desk) return [];
  return desk.draftList();
}

export function preferDeviceCustodyDefault(): boolean {
  if (!deviceCustodyAvailable()) return false;
  try {
    return localStorage.getItem('pen_prefer_device_custody') === '1';
  } catch {
    return false;
  }
}

export function setPreferDeviceCustodyDefault(on: boolean): void {
  try {
    localStorage.setItem('pen_prefer_device_custody', on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export async function promoteDeviceDraftToCloudBundle(
  docId: string
): Promise<{ manifest: PenDocManifest; sections: PenSectionContent[] } | null> {
  const bundle = await loadDeviceCustodyDraft(docId);
  if (!bundle) return null;
  return {
    manifest: { ...bundle.manifest, custody: 'cloud' },
    sections: bundle.sections
  };
}
