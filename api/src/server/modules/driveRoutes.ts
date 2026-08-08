/**
 * Drive Routes
 * Google Drive API proxy endpoints (list, create, read, update, delete files
 * and folders) behind pN OAuth authentication
 */

import express from 'express';
import { safeClientErrorMessage } from '../utils/safeError';
import { isDevVerbose } from '../../utils/logger';
import { getBearerTokenPayload } from '../middleware/authMiddleware';
import { gateOwnerRoute, DEVICE_CAPABILITIES } from './deviceCapabilityService';

const NODE_ENV = process.env.NODE_ENV || 'development';

export interface DriveRouteDeps {
  extractAccountId: (account: any) => string | undefined;
  removeFromOwnerIndex: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    fileId: string,
    accountId?: string
  ) => Promise<void>;
  removeFromPublicIndex: (
    token: { access_token: string; refresh_token?: string; expires_at?: number; expires_in?: number },
    pnIdentifier: string,
    metadataFolderId: string,
    fileId: string,
    accountId?: string
  ) => Promise<void>;
}

/**
 * Setup Google Drive proxy routes
 */
export function setupDriveRoutes(app: express.Application, deps: DriveRouteDeps) {
  const { extractAccountId, removeFromOwnerIndex, removeFromPublicIndex } = deps;

    // Google Drive API Proxy Endpoints
    // These endpoints require pN OAuth authentication and proxy Google Drive operations
    app.get('/api/drive/files', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // CRITICAL: Use ONLY pn identifier - dashboard stores credentials under pn identifier only
        // Dashboard's getStorageIdentityCandidates() returns only the pn identifier
        const pnIdentifier = tokenPayload.pnIdentifier; // Use pN identifier for folder search
        
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        
        // After validation, pnIdentifier is guaranteed to be defined
        const userIdentifier: string = pnIdentifier; // Use ONLY pn identifier for credential lookup
        
        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead))) return;
        
        // CRITICAL: Only use pn identifier - no fallback to DID or public key
        // This prevents multiple API calls with different identifiers
        const identifierCandidates: string[] = [pnIdentifier];
        
        if (isDevVerbose()) {
          console.log(`[DriveFiles] Using pn identifier only: ${pnIdentifier}`);
        }
        
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        const query = req.query.q as string | undefined;
        const scope = req.query.scope as string | undefined;
        const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 50;
        const accountId = req.query.accountId as string | undefined;

        const { resolveIntegratorDriveContext } = await import('./integratorDriveContext');
        const { IntegratorFolderService } = await import('./integratorFolderService');
        const driveCtx = await resolveIntegratorDriveContext(req, accountId);
        if ('error' in driveCtx) {
          return res.status(driveCtx.status).json({
            error: driveCtx.code || 'forbidden',
            error_description: driveCtx.error
          });
        }

        if (scope === 'sharedWithMe') {
          if (!driveCtx.isFirstParty) {
            return res.status(403).json({
              error: 'forbidden',
              error_description: 'Shared-with-me listing is first-party only'
            });
          }
          const { isMessagingLibraryDriveFile } = await import('./messagingMediaService');
          const sharedQuery =
            "sharedWithMe=true and trashed=false and mimeType != 'application/vnd.google-apps.folder'";
          const sharedFiles = await googleDriveProxyService.listFiles(
            userIdentifier,
            sharedQuery,
            pageSize,
            accountId,
            identifierCandidates,
            driveCtx.accessToken
          );
          const files = sharedFiles.filter(isMessagingLibraryDriveFile);
          return res.json({ files });
        }
        
        // If no query provided and we have a pN identifier, try to find files in the pN folder
        let finalQuery = query;
        if (!driveCtx.isFirstParty && driveCtx.integratorFolderId) {
          finalQuery = IntegratorFolderService.integratorListQuery(
            driveCtx.integratorFolderId,
            query
          );
        } else if (!finalQuery && pnIdentifier && accountId) {
          // Prefer indexed pN folder (no Drive discovery) when available
          try {
            const { loadPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
            const index = await loadPnDriveIndex(userIdentifier);
            if (isPnDriveIndexComplete(index) && index.pnFolderId) {
              finalQuery = `'${index.pnFolderId}' in parents and trashed=false`;
            }
          } catch {
            /* fall through to folder search */
          }
          if (!finalQuery) {
          // Try to find the pN folder first, then query files in it
          // Folder name format: "par Noir - pn-{hash}" where pnIdentifier already includes "pn-" prefix
          // pnIdentifier is already in format "pn-{hash}", so use it directly
          const pnFolderName = `par Noir - ${pnIdentifier}`;
          try {
            // Search for the folder using forwarded cloud token under custody
            const accessToken = driveCtx.accessToken || null;
            
            if (accessToken) {
              // Search for the folder using Google Drive API directly
              const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
              const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=10`;
              
              console.log(`[DriveFiles] Searching for pN folder: "${pnFolderName}"`);
              console.log(`[DriveFiles] Folder search query: ${folderSearchQuery}`);
              
              const folderResponse = await fetch(folderSearchUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });
              
              console.log(`[DriveFiles] Folder search response status: ${folderResponse.status}`);
              
              if (folderResponse.ok) {
                const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                const folderFiles = folderData.files || [];
                
                console.log(`[DriveFiles] Folder search found ${folderFiles.length} folder(s)`);
                
                if (folderFiles.length > 0) {
                  const folderId = folderFiles[0].id;
                  // Query files in this folder
                  finalQuery = `'${folderId}' in parents and trashed=false`;
                  console.log(`[DriveFiles] ✅ Found pN folder "${pnFolderName}" (ID: ${folderId}), querying files in folder`);
                } else {
                  // Fallback: try without "pn-" prefix (using pN identifier, not DID)
                  const altFolderName = `par Noir - ${pnIdentifier}`;
                  const altFolderSearchQuery = `name='${altFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                  const altFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altFolderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                  
                  console.log(`[DriveFiles] Trying fallback folder name: "${altFolderName}"`);
                  
                  const altFolderResponse = await fetch(altFolderSearchUrl, {
                    headers: {
                      'Authorization': `Bearer ${accessToken}`
                    }
                  });
                  
                  if (altFolderResponse.ok) {
                    const altFolderData = await altFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                    const altFolderFiles = altFolderData.files || [];
                    
                    console.log(`[DriveFiles] Fallback folder search found ${altFolderFiles.length} folder(s)`);
                    
                    if (altFolderFiles.length > 0) {
                      const folderId = altFolderFiles[0].id;
                      finalQuery = `'${folderId}' in parents and trashed=false`;
                      console.log(`[DriveFiles] ✅ Found pN folder "${altFolderName}" (ID: ${folderId}), querying files in folder`);
                    } else {
                      console.warn(`[DriveFiles] ⚠️ pN folder not found (searched for "${pnFolderName}" and "${altFolderName}"), listing all files (will be filtered client-side)`);
                    }
                  } else {
                    console.warn(`[DriveFiles] Fallback folder search failed with status ${altFolderResponse.status}`);
                  }
                }
              } else {
                const errorText = await folderResponse.text().catch(() => 'Unknown error');
                console.warn(`[DriveFiles] Folder search failed with status ${folderResponse.status}: ${errorText}`);
              }
            } else {
              console.warn(`[DriveFiles] ⚠️ No access token available for folder search, listing all files (will be filtered client-side)`);
            }
          } catch (folderError: any) {
            console.warn(`[DriveFiles] Error searching for pN folder:`, folderError?.message || folderError);
            // Continue without folder filter - client will filter
          }
          }
        }
        
        // Pass forwarded cloud token so list works under device custody
        console.log(`[DriveFiles] Final query for listFiles: ${finalQuery || '(none - will list all files)'}`);
        const files = await googleDriveProxyService.listFiles(
          userIdentifier,
          finalQuery,
          pageSize,
          accountId,
          identifierCandidates,
          driveCtx.accessToken
        );
        
        console.log(`[DriveFiles] Returning ${files.length} file(s) to client`);
        return res.json({ files });
      } catch (error: any) {
        console.error('Error listing Google Drive files:', error);
        const msg = String(error?.message || '');
        if (/access token|cloud token|reconnect|authentication failed/i.test(msg)) {
          return res.status(409).json({
            error: 'cloud_token_required',
            error_description: msg || 'Google Drive access token required'
          });
        }
        return res.status(500).json({
          error: 'Failed to list files',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to list Google Drive files'
        });
      }
    });

    app.post('/api/drive/files', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // CRITICAL: Use ONLY pn identifier - dashboard stores credentials under pn identifier only
        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        const userIdentifier = pnIdentifier;
        console.log(`[Upload] Using pn identifier only: ${pnIdentifier}`);

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload))) return;
        
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        
        // Expect JSON with fileData (base64), fileName, mimeType, parents, accountId, encrypt (optional)
        const { fileData, fileName, mimeType, parents, accountId, encrypt = true } = req.body;
        
        if (!fileData || !fileName) {
          return res.status(400).json({
            error: 'Missing required fields',
            error_description: 'fileData and fileName are required'
          });
        }

        const { resolveIntegratorDriveContext } = await import('./integratorDriveContext');
        const { IntegratorFolderService, IntegratorStorageError } = await import(
          './integratorFolderService'
        );
        const { integratorStorageErrorResponse } = await import('./integratorDriveContext');
        const driveCtx = await resolveIntegratorDriveContext(req, accountId);
        if ('error' in driveCtx) {
          return res.status(driveCtx.status).json({
            error: driveCtx.code || 'forbidden',
            error_description: driveCtx.error
          });
        }

        // When encrypt: true, enforce tier limit (parse EncryptedFilePackage for originalSize)
        if (encrypt !== false) {
          try {
            const { getStorageTier } = await import('./storageTierService');
            const { encryptedLimitBytes } = await getStorageTier(pnIdentifier, tokenPayload.did);
            const decoded = Buffer.from(fileData, 'base64');
            const parsed = JSON.parse(decoded.toString('utf8')) as { metadata?: { originalSize?: number } };
            const rawSize = parsed?.metadata?.originalSize;
            if (typeof rawSize === 'number' && rawSize > encryptedLimitBytes) {
              return res.status(403).json({
                error: 'Encryption limit exceeded',
                error_description: `File size (${Math.round(rawSize / 1024 / 1024)} MB) exceeds your encryption limit. Upload unencrypted or upgrade your tier.`,
                encryptedLimitBytes
              });
            }
          } catch (parseErr) {
            // Non-JSON or missing metadata: allow (backward compat)
          }
        }

        // CRITICAL: Only use pn identifier - no fallback to DID or public key
        const identifierCandidates: string[] = [pnIdentifier];

        let finalParents = parents as string[] | undefined;
        try {
          if (
            !driveCtx.isFirstParty &&
            driveCtx.integratorFolderId &&
            driveCtx.metadataFolderId &&
            driveCtx.pnFolderId
          ) {
            finalParents = await IntegratorFolderService.assertParentsAllowed(
              driveCtx.accessToken,
              driveCtx.tokenPayload.clientId,
              parents,
              driveCtx.integratorFolderId,
              driveCtx.metadataFolderId,
              driveCtx.pnFolderId
            );
          } else if (!finalParents || finalParents.length === 0) {
            finalParents = undefined;
          }
        } catch (siloErr) {
          if (siloErr instanceof IntegratorStorageError) {
            const { status, body } = integratorStorageErrorResponse(siloErr);
            return res.status(status).json(body);
          }
          throw siloErr;
        }

        // If no parents specified, find the pN folder and upload there (first-party only)
        if ((!finalParents || finalParents.length === 0) && driveCtx.isFirstParty) {
          if (pnIdentifier && accountId) {
            try {
              let accessToken: string | null = driveCtx.accessToken || null;
              if (!accessToken) {
                try {
                  accessToken = await googleDriveProxyService.getAccessToken(pnIdentifier, accountId, identifierCandidates);
                } catch (tokenError: any) {
                  console.warn(`[Upload] Could not get access token for folder search:`, tokenError?.message || tokenError);
                }
              }
              
              if (accessToken) {
                const { pnFolderDisplayName } = await import('./integratorStoragePaths');
                const pnFolderName = pnFolderDisplayName(pnIdentifier);
                // Prefer indexed folder id when available
                try {
                  const { loadPnDriveIndex, isPnDriveIndexComplete } = await import('./pnDriveIndex');
                  const index = await loadPnDriveIndex(pnIdentifier);
                  if (isPnDriveIndexComplete(index) && index.pnFolderId) {
                    finalParents = [index.pnFolderId];
                  }
                } catch {
                  /* fall through to search */
                }
                if (!finalParents || finalParents.length === 0) {
                const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                
                console.log(`[Upload] Searching for pN folder: "${pnFolderName}"`);
                
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  const folderFiles = folderData.files || [];
                  
                  if (folderFiles.length > 0) {
                    finalParents = [folderFiles[0].id];
                    console.log(`[Upload] ✅ Found pN folder "${pnFolderName}" (ID: ${folderFiles[0].id}), uploading file there`);
                  } else {
                    // Fallback: try without "pn-" prefix
                    const altFolderName = `par Noir - ${pnIdentifier}`;
                    const altFolderSearchQuery = `name='${altFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const altFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altFolderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                    
                    const altFolderResponse = await fetch(altFolderSearchUrl, {
                      headers: {
                        'Authorization': `Bearer ${accessToken}`
                      }
                    });
                    
                    if (altFolderResponse.ok) {
                      const altFolderData = await altFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                      const altFolderFiles = altFolderData.files || [];
                      
                      if (altFolderFiles.length > 0) {
                        finalParents = [altFolderFiles[0].id];
                        console.log(`[Upload] ✅ Found pN folder "${altFolderName}" (ID: ${altFolderFiles[0].id}), uploading file there`);
                      }
                    }
                  }
                }
                }
              }
            } catch (folderError: any) {
              console.warn(`[Upload] Error searching for pN folder:`, folderError?.message || folderError);
              // Continue without folder - file will be uploaded to root
            }
          }
        }

        // Convert base64 to Buffer
        const fileBuffer = Buffer.from(fileData, 'base64');
        const file = await googleDriveProxyService.uploadFile(
          userIdentifier, // Use pN identifier instead of DID
          fileBuffer,
          fileName,
          mimeType || 'application/octet-stream',
          finalParents,
          accountId, // Pass accountId to select specific Google Drive account
          identifierCandidates, // Pass identifier candidates for token lookup
          driveCtx.accessToken
        );
        
        // Note: Companion metadata files are NOT created on upload
        // They are only created when a file becomes public for the first time
        // (handled in PUT /api/aggregator/metadata-index/:fileId endpoint)
        
        return res.json({ file });
      } catch (error: any) {
        console.error('Error uploading file to Google Drive:', error);
        const msg = String(error?.message || '');
        if (/access token|cloud token|reconnect|authentication failed/i.test(msg)) {
          return res.status(409).json({
            error: 'cloud_token_required',
            error_description: msg || 'Google Drive access token required'
          });
        }
        return res.status(500).json({
          error: 'Failed to upload file',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to upload file to Google Drive'
        });
      }
    });

    // Create folder endpoint
    app.post('/api/drive/folders', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        const userIdentifier = pnIdentifier;

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload))) return;
        
        const identifierCandidates: string[] = [pnIdentifier];
        
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        
        const { folderName, parentFolderName, parentFolderId, accountId } = req.body;
        
        if (!folderName) {
          return res.status(400).json({
            error: 'Missing required fields',
            error_description: 'folderName is required'
          });
        }

        const { resolveIntegratorDriveContext } = await import('./integratorDriveContext');
        const { IntegratorFolderService, IntegratorStorageError } = await import(
          './integratorFolderService'
        );
        const { integratorStorageErrorResponse } = await import('./integratorDriveContext');
        const driveCtx = await resolveIntegratorDriveContext(req, accountId);
        if ('error' in driveCtx) {
          return res.status(driveCtx.status).json({
            error: driveCtx.code || 'forbidden',
            error_description: driveCtx.error
          });
        }

        // Get access token for Google Drive operations
        const accessToken = driveCtx.accessToken;
        if (!accessToken) {
          return res.status(401).json({
            error: 'Failed to get Google Drive access token',
            error_description: 'Could not retrieve Google Drive credentials'
          });
        }

        let finalParentFolderId: string | null = null;

        if (
          !driveCtx.isFirstParty &&
          driveCtx.integratorFolderId &&
          driveCtx.metadataFolderId &&
          driveCtx.pnFolderId
        ) {
          try {
            const allowed = await IntegratorFolderService.assertParentsAllowed(
              accessToken,
              driveCtx.tokenPayload.clientId,
              parentFolderId ? [parentFolderId] : undefined,
              driveCtx.integratorFolderId,
              driveCtx.metadataFolderId,
              driveCtx.pnFolderId
            );
            finalParentFolderId = allowed[0];
          } catch (siloErr) {
            if (siloErr instanceof IntegratorStorageError) {
              const { status, body } = integratorStorageErrorResponse(siloErr);
              return res.status(status).json(body);
            }
            throw siloErr;
          }
        } else if (parentFolderId) {
          finalParentFolderId = parentFolderId;
          console.log(`[CreateFolder] Using provided parent folder ID: ${parentFolderId}`);
        }
        // Otherwise, if parentFolderName is provided, find it (but don't create - use auto-find instead)
        else if (parentFolderName) {
          // SECURITY: Reject parentFolderName with DID - this should never happen
          if (parentFolderName.includes('did:key:')) {
            console.error(`[CreateFolder] Rejected parentFolderName with DID: ${parentFolderName}`);
            // Don't return error - just ignore parentFolderName and use auto-find instead
            console.log(`[CreateFolder] Ignoring parentFolderName with DID, using auto-find instead`);
          } else {
            console.log(`[CreateFolder] Searching for parent folder: ${parentFolderName}`);
            const parentFolderSearchQuery = `name='${parentFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const parentFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(parentFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
            
            console.log(`[CreateFolder] Parent folder search query: ${parentFolderSearchQuery}`);
            
            const parentFolderResponse = await fetch(parentFolderSearchUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (parentFolderResponse.ok) {
              const parentFolderData = await parentFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
              const parentFolderFiles = parentFolderData.files || [];
              console.log(`[CreateFolder] Found ${parentFolderFiles.length} parent folder(s):`, parentFolderFiles);
              if (parentFolderFiles.length > 0) {
                finalParentFolderId = parentFolderFiles[0].id;
                console.log(`[CreateFolder] Using parent folder ID: ${finalParentFolderId}`);
              }
            } else {
              const errorText = await parentFolderResponse.text().catch(() => 'Unknown error');
              console.error(`[CreateFolder] Failed to search for parent folder: ${parentFolderResponse.status} - ${errorText}`);
            }

            // If parent folder not found, try alternative name format
            if (!finalParentFolderId && parentFolderName.includes('pn-')) {
              const altParentFolderName = parentFolderName.replace('pn-', '');
              const altParentFolderSearchQuery = `name='${altParentFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
              const altParentFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altParentFolderSearchQuery)}&fields=files(id,name)&pageSize=1`;
              
              const altParentFolderResponse = await fetch(altParentFolderSearchUrl, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`
                }
              });
              
              if (altParentFolderResponse.ok) {
                const altParentFolderData = await altParentFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                const altParentFolderFiles = altParentFolderData.files || [];
                if (altParentFolderFiles.length > 0) {
                  finalParentFolderId = altParentFolderFiles[0].id;
                }
              }
            }
            
            // NOTE: We no longer create parent folders here - if not found, auto-find will handle it below
            // This prevents creating folders with wrong names (like DID folders)
          }
        }
        
        // If no parent specified, automatically find the pN folder (first-party only)
        if (!finalParentFolderId && driveCtx.isFirstParty && pnIdentifier && accountId) {
          try {
            console.log(`[CreateFolder] No parent specified, searching for pN folder automatically...`);
            const { pnFolderDisplayName } = await import('./integratorStoragePaths');
            const pnFolderName = pnFolderDisplayName(pnIdentifier);
            const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=10`;
            
            console.log(`[CreateFolder] Searching for pN folder: "${pnFolderName}"`);
            
            const folderResponse = await fetch(folderSearchUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            if (folderResponse.ok) {
              const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
              const folderFiles = folderData.files || [];
              
              if (folderFiles.length > 0) {
                finalParentFolderId = folderFiles[0].id;
                console.log(`[CreateFolder] ✅ Found pN folder "${pnFolderName}" (ID: ${finalParentFolderId}), creating folder there`);
              } else {
                // Fallback: try without "pn-" prefix
                const altFolderName = `par Noir - ${pnIdentifier}`;
                const altFolderSearchQuery = `name='${altFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const altFolderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(altFolderSearchQuery)}&fields=files(id,name)&pageSize=10`;
                
                const altFolderResponse = await fetch(altFolderSearchUrl, {
                  headers: {
                    'Authorization': `Bearer ${accessToken}`
                  }
                });
                
                if (altFolderResponse.ok) {
                  const altFolderData = await altFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  const altFolderFiles = altFolderData.files || [];
                  
                  if (altFolderFiles.length > 0) {
                    finalParentFolderId = altFolderFiles[0].id;
                    console.log(`[CreateFolder] ✅ Found pN folder "${altFolderName}" (ID: ${finalParentFolderId}), creating folder there`);
                  }
                }
              }
            }
          } catch (folderError: any) {
            console.warn(`[CreateFolder] Error searching for pN folder:`, folderError?.message || folderError);
            // Continue without folder - folder will be created in root
          }
        }

        // Create the requested folder
        const createFolderBody: any = {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder'
        };
        
        if (finalParentFolderId) {
          createFolderBody.parents = [finalParentFolderId];
          console.log(`[CreateFolder] Creating folder "${folderName}" inside parent folder ID: ${finalParentFolderId}`);
        } else {
          console.warn(`[CreateFolder] No parent folder ID, creating folder "${folderName}" in root`);
        }

        const createFolderResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createFolderBody)
        });

        if (!createFolderResponse.ok) {
          const errorText = await createFolderResponse.text().catch(() => 'Unknown error');
          console.error(`[CreateFolder] Failed to create folder: ${createFolderResponse.status} - ${errorText}`);
          return res.status(500).json({
            error: 'Failed to create folder',
            error_description: errorText
          });
        }

        const createdFolder = await createFolderResponse.json() as { id: string; name: string; parents?: string[] };
        console.log(`[CreateFolder] Created folder: ${folderName} (ID: ${createdFolder.id}, parents: ${createdFolder.parents?.join(', ') || 'none'})`);
        
        return res.json({ folder: createdFolder });
      } catch (error: any) {
        console.error('Error creating folder:', error);
        return res.status(500).json({
          error: 'Failed to create folder',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to create folder in Google Drive'
        });
      }
    });

    app.get('/api/drive/files/:fileId', async (req, res) => {
      try {
        // Extract pN OAuth token from Authorization header
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        // CRITICAL: Use ONLY pn identifier - dashboard stores credentials under pn identifier only
        const pnIdentifier = tokenPayload.pnIdentifier;
        if (!pnIdentifier) {
          return res.status(400).json({
            error: 'pnIdentifier required',
            error_description: 'Token must include pnIdentifier for storage access'
          });
        }
        // After validation, pnIdentifier is guaranteed to be defined
        const userIdentifier: string = pnIdentifier;

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveRead))) return;
        
        // CRITICAL: Only use pn identifier - no fallback to DID or public key
        const identifierCandidates: string[] = [pnIdentifier];
        
        const { fileId } = req.params;
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        
        // Check if requesting thumbnail, download, or metadata
        const thumbnail = req.query.thumbnail === 'true';
        const download = req.query.download === 'true';
        const accountId = req.query.accountId as string | undefined;
        const ownerPnIdentifier = req.query.ownerPnIdentifier as string | undefined;

        const { resolveIntegratorDriveContext } = await import('./integratorDriveContext');
        const { IntegratorFolderService, IntegratorStorageError } = await import(
          './integratorFolderService'
        );
        const { integratorStorageErrorResponse } = await import('./integratorDriveContext');
        const { isFirstPartyClient } = await import('./integratorStoragePaths');
        const driveCtx = await resolveIntegratorDriveContext(req, accountId);
        if ('error' in driveCtx) {
          return res.status(driveCtx.status).json({
            error: driveCtx.code || 'forbidden',
            error_description: driveCtx.error
          });
        }

        if (
          !isFirstPartyClient(tokenPayload.clientId) &&
          ownerPnIdentifier &&
          ownerPnIdentifier !== pnIdentifier
        ) {
          return res.status(403).json({
            error: 'forbidden',
            error_description: 'Integrator apps cannot access other users\' Drive files via this endpoint'
          });
        }

        // When ownerPnIdentifier is present: fetch from owner's Drive (for public feed items from other creators)
        let effectiveUserIdentifier = userIdentifier;
        let effectiveIdentifierCandidates = identifierCandidates;
        if (ownerPnIdentifier && ownerPnIdentifier !== pnIdentifier) {
          try {
            const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
            const metadataService = AggregatorMetadataServiceDB.getInstance();
            const fileEntry = await metadataService.getFileMetadata(fileId);
            if (!fileEntry || !fileEntry.metadata) {
              return res.status(404).json({
                error: 'File not found',
                error_description: 'File not found in metadata index'
              });
            }
            const meta = fileEntry.metadata as { isPublic?: boolean; fileId?: string };
            if (meta.isPublic !== true) {
              return res.status(403).json({
                error: 'Forbidden',
                error_description: 'File is not public'
              });
            }
            if (meta.fileId && meta.fileId !== fileId) {
              return res.status(400).json({
                error: 'Bad request',
                error_description: 'File ID mismatch'
              });
            }
            // Resolve owner pn identifier (may need pn- prefix)
            const resolvedOwner = ownerPnIdentifier.startsWith('pn-') ? ownerPnIdentifier : `pn-${ownerPnIdentifier}`;
            effectiveUserIdentifier = resolvedOwner;
            effectiveIdentifierCandidates = [resolvedOwner];
          } catch (lookupError: any) {
            console.error('[DriveFiles] ownerPnIdentifier lookup failed:', lookupError?.message || lookupError);
            return res.status(500).json({
              error: 'Failed to resolve owner',
              error_description: lookupError?.message || 'Failed to resolve file owner'
            });
          }
        }

        if (
          !driveCtx.isFirstParty &&
          driveCtx.integratorFolderId &&
          (!ownerPnIdentifier || ownerPnIdentifier === pnIdentifier)
        ) {
          try {
            await IntegratorFolderService.assertFileInIntegratorSilo(
              driveCtx.accessToken,
              fileId,
              driveCtx.integratorFolderId
            );
          } catch (siloErr) {
            if (siloErr instanceof IntegratorStorageError) {
              const { status, body } = integratorStorageErrorResponse(siloErr);
              return res.status(status).json(body);
            }
            throw siloErr;
          }
        }

        if (thumbnail) {
          try {
            // Proxy thumbnail request through API server with authentication
            const accessToken =
              (!ownerPnIdentifier || ownerPnIdentifier === pnIdentifier
                ? driveCtx.accessToken
                : null) ||
              (await googleDriveProxyService.getAccessToken(
                effectiveUserIdentifier,
                accountId,
                effectiveIdentifierCandidates
              ));
            const thumbnailUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/thumbnail?alt=media`;
            
            console.log(`[DriveFiles] Fetching thumbnail for file ${fileId} with accountId ${accountId}`);
            
            const thumbnailResponse = await fetch(thumbnailUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            });
            
            console.log(`[DriveFiles] Thumbnail response status: ${thumbnailResponse.status}`);
            
            if (thumbnailResponse.ok) {
              const thumbnailBlob = await thumbnailResponse.blob();
              const arrayBuffer = await thumbnailBlob.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              
              res.setHeader('Content-Type', thumbnailBlob.type || 'image/jpeg');
              res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache thumbnails for 1 hour
              return res.send(buffer);
            } else if (thumbnailResponse.status === 404) {
              // Google Drive can't generate thumbnails for encrypted files
              // Fall back to downloading the full file - client will decrypt and generate thumbnail
              console.log(`[DriveFiles] Thumbnail not available (likely encrypted file), downloading full file for client-side thumbnail generation`);
              
              try {
                const ownToken =
                  !ownerPnIdentifier || ownerPnIdentifier === pnIdentifier
                    ? driveCtx.accessToken
                    : undefined;
                const fileBlob = await googleDriveProxyService.downloadFile(
                  effectiveUserIdentifier,
                  fileId,
                  accountId,
                  effectiveIdentifierCandidates,
                  ownToken
                );
                const arrayBuffer = await fileBlob.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Return the encrypted file - client will decrypt and use it as thumbnail
                // For PNG files, the client can use the image directly (maybe resized)
                res.setHeader('Content-Type', fileBlob.type || 'application/octet-stream');
                res.setHeader('Cache-Control', 'public, max-age=3600');
                return res.send(buffer);
              } catch (downloadError: any) {
                console.error(`[DriveFiles] Failed to download file for thumbnail fallback:`, downloadError);
                return res.status(500).json({
                  error: 'Failed to fetch thumbnail',
                  error_description: 'Thumbnail not available and file download failed'
                });
              }
            } else {
              const errorText = await thumbnailResponse.text().catch(() => 'Unknown error');
              console.error(`[DriveFiles] Thumbnail fetch failed: ${thumbnailResponse.status} - ${errorText}`);
              return res.status(thumbnailResponse.status).json({
                error: 'Failed to fetch thumbnail',
                error_description: `Google Drive API returned ${thumbnailResponse.status}: ${errorText}`
              });
            }
          } catch (error: any) {
            console.error('[DriveFiles] Error fetching thumbnail:', error);
            return res.status(500).json({
              error: 'Failed to fetch thumbnail',
              error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to fetch thumbnail from Google Drive'
            });
          }
        } else if (download) {
          const ownToken =
            !ownerPnIdentifier || ownerPnIdentifier === pnIdentifier
              ? driveCtx.accessToken
              : undefined;
          const blob = await googleDriveProxyService.downloadFile(
            effectiveUserIdentifier,
            fileId,
            accountId,
            effectiveIdentifierCandidates,
            ownToken
          );
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          
          res.setHeader('Content-Type', blob.type || 'application/octet-stream');
          res.setHeader('Content-Disposition', `attachment; filename="${fileId}"`);
          return res.send(buffer);
        } else {
          const ownToken =
            !ownerPnIdentifier || ownerPnIdentifier === pnIdentifier
              ? driveCtx.accessToken
              : undefined;
          const metadata = await googleDriveProxyService.getFileMetadata(
            effectiveUserIdentifier,
            fileId,
            accountId,
            ownToken
          );
          return res.json({ file: metadata });
        }
      } catch (error: any) {
        console.error('Error accessing Google Drive file:', error);
        return res.status(500).json({
          error: 'Failed to access file',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to access Google Drive file'
        });
      }
    });

    // DELETE /api/drive/files/:fileId - Delete file from Google Drive
    app.delete('/api/drive/files/:fileId', async (req, res) => {
      const { fileId } = req.params;
      const accountId = req.query.accountId as string | undefined;
      
      let dbRemoved = false;
      
      try {
        // STEP 0: Validate token FIRST (but don't delete yet)
        const tokenPayload = getBearerTokenPayload(req);
        let userIdentifier: string | null = null;
        let pnIdentifier: string | null = null;
        if (tokenPayload) {
          userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
          pnIdentifier = tokenPayload.pnIdentifier || null;
        }

        if (tokenPayload && pnIdentifier) {
          if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload))) return;
        }

        if (tokenPayload && pnIdentifier) {
          const { resolveIntegratorDriveContext } = await import('./integratorDriveContext');
          const { IntegratorFolderService, IntegratorStorageError } = await import(
            './integratorFolderService'
          );
          const { integratorStorageErrorResponse } = await import('./integratorDriveContext');
          const driveCtx = await resolveIntegratorDriveContext(req, accountId);
          if ('error' in driveCtx) {
            return res.status(driveCtx.status).json({
              error: driveCtx.code || 'forbidden',
              error_description: driveCtx.error
            });
          }
          (req as { __pnCloudAccessToken?: string }).__pnCloudAccessToken = driveCtx.accessToken;
          if (!driveCtx.isFirstParty && driveCtx.integratorFolderId) {
            try {
              await IntegratorFolderService.assertFileInIntegratorSilo(
                driveCtx.accessToken,
                fileId,
                driveCtx.integratorFolderId
              );
            } catch (siloErr) {
              if (siloErr instanceof IntegratorStorageError) {
                const { status, body } = integratorStorageErrorResponse(siloErr);
                return res.status(status).json(body);
              }
              throw siloErr;
            }
          }
        }
        
        const forwardedCloudToken = (req as { __pnCloudAccessToken?: string }).__pnCloudAccessToken;
        // STEP 1: Read companion metadata to get mainFileId connection
        // Deletions from frontend are ALWAYS thumbnails - main files never appear in frontend
        let mainFileId: string | null = null;
        
        if (pnIdentifier && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./googleDriveProxy');
            const companionMetadata = await googleDriveProxyService.readCompanionMetadata(
              userIdentifier,
              pnIdentifier,
              fileId,
              accountId
            );
            
            if (companionMetadata?.mainFileId) {
              mainFileId = companionMetadata.mainFileId;
              console.log(`✅ [DeleteFile] Found mainFileId ${mainFileId} for thumbnail ${fileId} from companion metadata`);
            } else {
              console.log(`ℹ️ [DeleteFile] No mainFileId found in companion metadata for ${fileId} (may not be a thumbnail or metadata not found)`);
            }
          } catch (metadataError: any) {
            console.warn(`⚠️ [DeleteFile] Could not read companion metadata (may already be deleted):`, metadataError?.message || metadataError);
          }
        }
        
        // STEP 2: Delete main file (if found)
        if (mainFileId && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./googleDriveProxy');
            await googleDriveProxyService.deleteFile(
              userIdentifier,
              mainFileId,
              accountId,
              forwardedCloudToken
            );
            console.log(`✅ [DeleteFile] Deleted main file ${mainFileId} from Google Drive`);
          } catch (driveError: any) {
            const errorMsg = driveError?.message || String(driveError);
            // 404 is okay - file might already be deleted
            if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
              console.error(`❌ [DeleteFile] Failed to delete main file ${mainFileId} from Google Drive:`, errorMsg);
            } else {
              console.log(`ℹ️ [DeleteFile] Main file ${mainFileId} not found in Google Drive (may already be deleted)`);
            }
          }
        }
        
        // STEP 3: Delete companion metadata files (JSON and spreadsheet for the thumbnail fileId)
        if (pnIdentifier && userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./googleDriveProxy');
            const metadataResult = await googleDriveProxyService.deleteCompanionMetadataFiles(
              userIdentifier,
              pnIdentifier,
              [fileId], // Delete metadata for the thumbnail fileId being deleted
              accountId
            );
            
            if (metadataResult.deletedJson > 0 || metadataResult.deletedSpreadsheets > 0) {
              console.log(`✅ [DeleteFile] Deleted companion metadata: ${metadataResult.deletedJson} JSON file(s), ${metadataResult.deletedSpreadsheets} spreadsheet(s)`);
            }
            
            if (metadataResult.errors.length > 0) {
              console.warn(`⚠️ [DeleteFile] Some metadata deletion errors (non-critical):`, metadataResult.errors);
            }
          } catch (metadataDeleteError: any) {
            // Non-critical - continue even if metadata deletion fails
            console.warn(`⚠️ [DeleteFile] Failed to delete companion metadata (non-critical):`, metadataDeleteError?.message || metadataDeleteError);
          }
        }
        
        // STEP 4: Delete thumbnail (the fileId being deleted)
        if (userIdentifier) {
          try {
            const { googleDriveProxyService } = await import('./googleDriveProxy');
            await googleDriveProxyService.deleteFile(
              userIdentifier,
              fileId,
              accountId,
              forwardedCloudToken
            );
            console.log(`✅ [DeleteFile] Deleted thumbnail ${fileId} from Google Drive`);
          } catch (driveError: any) {
            const errorMsg = driveError?.message || String(driveError);
            // 404 is okay - file might already be deleted
            if (!errorMsg.includes('404') && !errorMsg.includes('not found')) {
              console.error(`❌ [DeleteFile] Failed to delete thumbnail ${fileId} from Google Drive:`, errorMsg);
            } else {
              console.log(`ℹ️ [DeleteFile] Thumbnail ${fileId} not found in Google Drive (may already be deleted)`);
            }
          }
        }
        
        // STEP 5: Remove from database metadata (thumbnail and main file if found)
        const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
        const metadataService = AggregatorMetadataServiceDB.getInstance();
        const filesToRemoveFromDb = [fileId];
        if (mainFileId) {
          filesToRemoveFromDb.push(mainFileId);
        }
        
        for (const dbFileId of filesToRemoveFromDb) {
          try {
            const removed = await metadataService.removeMetadata(dbFileId);
            if (removed) {
              console.log(`✅ [DeleteFile] Removed ${dbFileId} from database metadata`);
            }
          } catch (dbError: any) {
            console.error(`❌ [DeleteFile] Failed to remove ${dbFileId} from database:`, dbError);
          }
        }
        
        // Files to delete for index cleanup (used in STEP 6)
        const filesToDelete = [fileId];
        if (mainFileId) {
          filesToDelete.push(mainFileId);
        }
        
        // STEP 6: Remove from Google Drive indexes
        if (pnIdentifier && userIdentifier) {
          try {
            const { storageCredentialsService } = await import('./storageCredentialsService');
            const userCredentials = await storageCredentialsService.getCredentials(pnIdentifier);
            
            if (userCredentials?.credentials) {
              const googleDriveAccounts = userCredentials.credentials.googleDriveAccounts || 
                (userCredentials.credentials.googleDrive ? [userCredentials.credentials.googleDrive] : []);
              
              if (googleDriveAccounts.length > 0) {
                const account = googleDriveAccounts.length > 0 ? googleDriveAccounts[0] : null;
                const accountIdForToken = extractAccountId(account);
                const token = {
                  access_token: account?.access_token || account?.accessToken || '',
                  refresh_token: account?.refresh_token || account?.refreshToken,
                  expires_at: account?.expires_at,
                  expires_in: account?.expires_in
                };
                const accessToken = token.access_token; // Keep for backward compatibility in fetch calls
                
                // Get pN folder and metadata folder
                const pnFolderName = `par Noir - ${pnIdentifier}`;
                const folderSearchQuery = `name='${pnFolderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                const folderSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderSearchQuery)}&fields=files(id,name)&pageSize=1`;
                
                const folderResponse = await fetch(folderSearchUrl, {
                  headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                
                if (folderResponse.ok) {
                  const folderData = await folderResponse.json() as { files?: Array<{ id: string; name: string }> };
                  if (folderData.files && folderData.files.length > 0) {
                    const pnFolderId = folderData.files[0].id;
                    
                    // Get metadata folder
                    const metadataFolderName = '_metadata';
                    const metadataSearchQuery = `name='${metadataFolderName}' and '${pnFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
                    const metadataSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(metadataSearchQuery)}&fields=files(id,name)&pageSize=1`;
                    
                    const metadataFolderResponse = await fetch(metadataSearchUrl, {
                      headers: { 'Authorization': `Bearer ${accessToken}` }
                    });
                    
                    if (metadataFolderResponse.ok) {
                      const metadataFolderData = await metadataFolderResponse.json() as { files?: Array<{ id: string; name: string }> };
                      if (metadataFolderData.files && metadataFolderData.files.length > 0) {
                        const metadataFolderId = metadataFolderData.files[0].id;
                        
                        // Remove files from indexes
                        for (const indexFileId of filesToDelete) {
                          try {
                            await removeFromOwnerIndex(token, pnIdentifier, metadataFolderId, indexFileId, accountIdForToken);
                            console.log(`✅ [DeleteFile] Removed ${indexFileId} from owner index`);
                          } catch (ownerIndexError: any) {
                            console.warn(`⚠️ [DeleteFile] Failed to remove ${indexFileId} from owner index:`, ownerIndexError);
                          }
                          
                          try {
                            await removeFromPublicIndex(token, pnIdentifier, metadataFolderId, indexFileId, accountIdForToken);
                            console.log(`✅ [DeleteFile] Removed ${indexFileId} from public index`);
                          } catch (publicIndexError: unknown) {
                            const msg = publicIndexError instanceof Error ? publicIndexError.message : String(publicIndexError);
                            console.warn(`⚠️ [DeleteFile] Failed to remove ${indexFileId} from public index: ${msg}`);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          } catch (indexCleanupError: any) {
            console.error(`❌ [DeleteFile] Index cleanup failed:`, indexCleanupError);
          }
        }
        
        return res.json({ 
          success: true, 
          fileId,
          mainFileId: mainFileId || undefined,
          removedFromDatabase: dbRemoved 
        });
      } catch (error: any) {
        // Even if Google Drive operations fail, database removal succeeded
        console.error('Error in delete operation:', error);
        return res.json({ 
          success: true, 
          fileId,
          removedFromDatabase: dbRemoved,
          warning: 'Database cleaned but Google Drive operations may have failed',
          error: error.message
        });
      }
    });

    // PUT /api/drive/files/:fileId - Update file metadata in Google Drive
    app.put('/api/drive/files/:fileId', async (req, res) => {
      try {
        const tokenPayload = getBearerTokenPayload(req);
        if (!tokenPayload) {
          return res.status(401).json({
            error: 'unauthorized',
            error_description: 'Invalid or expired access token'
          });
        }

        if (!(await gateOwnerRoute(req, res, DEVICE_CAPABILITIES.driveUpload))) return;

        const userIdentifier = tokenPayload.pnIdentifier || tokenPayload.did;
        const { fileId } = req.params;
        const { name, description, parents, accountId } = req.body;
        const { googleDriveProxyService } = await import('./googleDriveProxy');
        
        const updates: { name?: string; description?: string; parents?: string[] } = {};
        if (name) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (parents) updates.parents = parents;
        
        const updatedFile = await googleDriveProxyService.updateFileMetadata(userIdentifier, fileId, updates, accountId);
        
        return res.json({ file: updatedFile });
      } catch (error: any) {
        console.error('Error updating Google Drive file:', error);
        return res.status(500).json({
          error: 'Failed to update file',
          error_description: safeClientErrorMessage(error, NODE_ENV === 'production') || 'Failed to update Google Drive file'
        });
      }
    });
}
