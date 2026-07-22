/**
 * Platform registry storage facade — Sheets on Google operator social cloud,
 * JSON blob on portable operator social cloud.
 */

import { METADATA_DIR } from '@par-noir/user-owned-storage';
import { getPlatformRegistryPnIdentifier, isPlatformRegistryConfigured } from './platformOperatorService';
import { getOwnerStorageContext } from './storage/ownerStorageContext';
import { readPortableJsonBlob, writePortableJsonBlob } from './storage/portableJsonBlob';
import { PlatformRegistrySheetsService } from './platformRegistrySheetsService';
import { getUserDriveMetadataContext } from './driveMetadataHelper';
import type {
  PlatformApplication,
  PlatformCommercialLicense,
  PlatformOAuthClientRow
} from './platformRegistryTypes';

const REGISTRY_REL = `${METADATA_DIR}/platform-registry.json`;

type PortableRegistryDoc = {
  applications: PlatformApplication[];
  oauthClients: PlatformOAuthClientRow[];
  commercialLicenses: PlatformCommercialLicense[];
  updatedAt?: string;
};

function emptyDoc(): PortableRegistryDoc {
  return { applications: [], oauthClients: [], commercialLicenses: [], updatedAt: new Date().toISOString() };
}

export type PlatformRegistryContext =
  | {
      kind: 'google_drive';
      accessToken: string;
      metadataFolderId: string;
      normalizedPnIdentifier: string;
      accountId?: string;
    }
  | {
      kind: 'portable';
      pnIdentifier: string;
      accountId?: string;
    };

export class PlatformRegistryNotConfiguredError extends Error {
  constructor(
    message = 'Platform registry is not configured (PLATFORM_REGISTRY_PN_IDENTIFIER and operator storage connection required)'
  ) {
    super(message);
    this.name = 'PlatformRegistryNotConfiguredError';
  }
}

export async function getPlatformRegistryContext(): Promise<PlatformRegistryContext | null> {
  if (!isPlatformRegistryConfigured()) return null;
  const registryPn = getPlatformRegistryPnIdentifier();
  if (!registryPn) return null;

  const owner = await getOwnerStorageContext(registryPn);
  if (owner?.kind === 'portable') {
    return { kind: 'portable', pnIdentifier: owner.pnIdentifier, accountId: owner.accountId };
  }

  const drive = await getUserDriveMetadataContext(registryPn);
  if (!drive) return null;
  return {
    kind: 'google_drive',
    accessToken: drive.accessToken,
    metadataFolderId: drive.metadataFolderId,
    normalizedPnIdentifier: drive.normalizedPnIdentifier,
    accountId: drive.accountId
  };
}

export async function requirePlatformRegistryContext(): Promise<PlatformRegistryContext> {
  const ctx = await getPlatformRegistryContext();
  if (!ctx) throw new PlatformRegistryNotConfiguredError();
  return ctx;
}

/** @deprecated use requirePlatformRegistryContext */
export async function requirePlatformRegistryDriveContext() {
  const ctx = await requirePlatformRegistryContext();
  if (ctx.kind !== 'google_drive') {
    // Callers that still expect Drive fields should migrate to PlatformRegistryStorage
    throw new PlatformRegistryNotConfiguredError(
      'Operator registry is on portable social cloud; use PlatformRegistryStorage'
    );
  }
  return ctx;
}

async function readPortable(ctx: Extract<PlatformRegistryContext, { kind: 'portable' }>): Promise<PortableRegistryDoc> {
  const doc = await readPortableJsonBlob<PortableRegistryDoc>(ctx.pnIdentifier, REGISTRY_REL, ctx.accountId);
  return doc ?? emptyDoc();
}

async function writePortable(
  ctx: Extract<PlatformRegistryContext, { kind: 'portable' }>,
  doc: PortableRegistryDoc
): Promise<void> {
  await writePortableJsonBlob(
    ctx.pnIdentifier,
    REGISTRY_REL,
    { ...doc, updatedAt: new Date().toISOString() },
    ctx.accountId
  );
}

function driveToken(accessToken: string) {
  return { access_token: accessToken };
}

async function ensureGoogleSheet(ctx: Extract<PlatformRegistryContext, { kind: 'google_drive' }>): Promise<string> {
  const token = driveToken(ctx.accessToken);
  try {
    return await PlatformRegistrySheetsService.getSpreadsheetId(
      token,
      ctx.metadataFolderId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  } catch {
    await PlatformRegistrySheetsService.createPlatformRegistrySheet(
      token,
      ctx.metadataFolderId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
    return PlatformRegistrySheetsService.getSpreadsheetId(
      token,
      ctx.metadataFolderId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }
}

export class PlatformRegistryStorage {
  static async listApplications(
    filter?: { ownerPnId?: string }
  ): Promise<PlatformApplication[]> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      let apps = (await readPortable(ctx)).applications;
      if (filter?.ownerPnId) {
        const o = filter.ownerPnId.startsWith('pn-') ? filter.ownerPnId : `pn-${filter.ownerPnId}`;
        apps = apps.filter((a) => a.ownerPnId === o);
      }
      return apps;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    return PlatformRegistrySheetsService.listApplications(
      driveToken(ctx.accessToken),
      sheetId,
      ctx.normalizedPnIdentifier,
      ctx.accountId,
      filter
    );
  }

  static async appendApplication(application: PlatformApplication): Promise<void> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      const doc = await readPortable(ctx);
      doc.applications.push(application);
      await writePortable(ctx, doc);
      return;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    await PlatformRegistrySheetsService.appendApplication(
      driveToken(ctx.accessToken),
      sheetId,
      application,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async updateApplication(
    applicationId: string,
    patch: Partial<PlatformApplication>
  ): Promise<void> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      const doc = await readPortable(ctx);
      const i = doc.applications.findIndex((a) => a.applicationId === applicationId);
      if (i < 0) throw new Error('Application not found');
      doc.applications[i] = { ...doc.applications[i], ...patch };
      await writePortable(ctx, doc);
      return;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    const existing = await PlatformRegistrySheetsService.getApplicationById(
      driveToken(ctx.accessToken),
      sheetId,
      applicationId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
    if (!existing) throw new Error('Application not found');
    await PlatformRegistrySheetsService.updateApplication(
      driveToken(ctx.accessToken),
      sheetId,
      { ...existing, ...patch },
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async getApplicationById(applicationId: string): Promise<PlatformApplication | null> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      return (await readPortable(ctx)).applications.find((a) => a.applicationId === applicationId) ?? null;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    return PlatformRegistrySheetsService.getApplicationById(
      driveToken(ctx.accessToken),
      sheetId,
      applicationId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async clientIdTaken(clientId: string): Promise<boolean> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      const doc = await readPortable(ctx);
      return (
        doc.applications.some((a) => a.clientId === clientId) ||
        doc.oauthClients.some((c) => c.clientId === clientId)
      );
    }
    const sheetId = await ensureGoogleSheet(ctx);
    return PlatformRegistrySheetsService.clientIdTaken(
      driveToken(ctx.accessToken),
      sheetId,
      clientId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async listOAuthClients(): Promise<PlatformOAuthClientRow[]> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      return (await readPortable(ctx)).oauthClients;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    return PlatformRegistrySheetsService.listOAuthClients(
      driveToken(ctx.accessToken),
      sheetId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async upsertOAuthClient(row: PlatformOAuthClientRow): Promise<void> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      const doc = await readPortable(ctx);
      const i = doc.oauthClients.findIndex((c) => c.clientId === row.clientId);
      if (i >= 0) doc.oauthClients[i] = row;
      else doc.oauthClients.push(row);
      await writePortable(ctx, doc);
      return;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    await PlatformRegistrySheetsService.upsertOAuthClient(
      driveToken(ctx.accessToken),
      sheetId,
      row,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async listCommercialLicenses(): Promise<PlatformCommercialLicense[]> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      return (await readPortable(ctx)).commercialLicenses;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    return PlatformRegistrySheetsService.listCommercialLicenses(
      driveToken(ctx.accessToken),
      sheetId,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }

  static async upsertCommercialLicense(row: PlatformCommercialLicense): Promise<void> {
    const ctx = await requirePlatformRegistryContext();
    if (ctx.kind === 'portable') {
      const doc = await readPortable(ctx);
      const i = doc.commercialLicenses.findIndex((l) => l.licenseId === row.licenseId);
      if (i >= 0) doc.commercialLicenses[i] = row;
      else doc.commercialLicenses.push(row);
      await writePortable(ctx, doc);
      return;
    }
    const sheetId = await ensureGoogleSheet(ctx);
    await PlatformRegistrySheetsService.upsertCommercialLicense(
      driveToken(ctx.accessToken),
      sheetId,
      row,
      ctx.normalizedPnIdentifier,
      ctx.accountId
    );
  }
}
