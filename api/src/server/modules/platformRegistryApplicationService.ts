/**
 * Submit integrator OAuth client applications to operator Drive registry.
 */

import { requirePlatformRegistryDriveContext } from './platformRegistryContext';
import { PlatformRegistrySheetsService } from './platformRegistrySheetsService';
import type { PlatformApplication } from './platformRegistryTypes';

function driveToken(accessToken: string) {
  return { access_token: accessToken };
}

export async function submitOAuthClientApplication(params: {
  clientId: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes: string[];
  ownerPnId: string;
}): Promise<{ applicationId: string; status: 'pending' }> {
  const ctx = await requirePlatformRegistryDriveContext();
  const token = driveToken(ctx.accessToken);
  let spreadsheetId: string;
  try {
    spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
      token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
    );
  } catch {
    await PlatformRegistrySheetsService.createPlatformRegistrySheet(
      token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
    );
    spreadsheetId = await PlatformRegistrySheetsService.getSpreadsheetId(
      token, ctx.metadataFolderId, ctx.normalizedPnIdentifier, ctx.accountId
    );
  }

  const normalizedOwner = params.ownerPnId.startsWith('pn-') ? params.ownerPnId : `pn-${params.ownerPnId}`;
  const taken = await PlatformRegistrySheetsService.clientIdTaken(
    token, spreadsheetId, params.clientId, ctx.normalizedPnIdentifier, ctx.accountId
  );
  if (taken) {
    throw Object.assign(new Error('A client with this id already exists or is pending review.'), { statusCode: 409 });
  }

  const applicationId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const application: PlatformApplication = {
    applicationId,
    clientId: params.clientId,
    name: params.name,
    description: params.description,
    redirectUris: params.redirectUris,
    scopes: params.scopes,
    ownerPnId: normalizedOwner,
    status: 'pending',
    submittedAt: new Date().toISOString()
  };
  await PlatformRegistrySheetsService.appendApplication(
    token, spreadsheetId, application, ctx.normalizedPnIdentifier, ctx.accountId
  );
  return { applicationId, status: 'pending' };
}
