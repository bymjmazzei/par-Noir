/**
 * Submit integrator OAuth client applications to operator registry (any social cloud).
 */

import { PlatformRegistryStorage } from './platformRegistryStorage';
import type { PlatformApplication } from './platformRegistryTypes';
import {
  normalizePermissionManifest,
  validatePermissionManifest,
  type IntegratorPermissionManifest
} from '@par-noir/standard-data-points';

export async function submitOAuthClientApplication(params: {
  clientId: string;
  name: string;
  description?: string;
  redirectUris: string[];
  scopes: string[];
  permissionManifest?: IntegratorPermissionManifest;
  ownerPnId: string;
}): Promise<{ applicationId: string; status: 'pending' }> {
  const normalizedOwner = params.ownerPnId.startsWith('pn-') ? params.ownerPnId : `pn-${params.ownerPnId}`;
  const taken = await PlatformRegistryStorage.clientIdTaken(params.clientId);
  if (taken) {
    throw Object.assign(new Error('A client with this id already exists or is pending review.'), {
      statusCode: 409
    });
  }

  const permissionManifest = normalizePermissionManifest(params.permissionManifest, params.scopes);
  const manifestErr = validatePermissionManifest(permissionManifest);
  if (manifestErr) {
    throw Object.assign(new Error(manifestErr), { statusCode: 400 });
  }

  const applicationId = `app_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const application: PlatformApplication = {
    applicationId,
    clientId: params.clientId,
    name: params.name,
    description: params.description,
    redirectUris: params.redirectUris,
    scopes: params.scopes,
    permissionManifest,
    ownerPnId: normalizedOwner,
    status: 'pending',
    submittedAt: new Date().toISOString()
  };
  await PlatformRegistryStorage.appendApplication(application);
  return { applicationId, status: 'pending' };
}
