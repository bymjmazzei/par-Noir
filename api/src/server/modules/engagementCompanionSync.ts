/**
 * Best-effort mirror of engagement events to the content owner's companion metadata spreadsheet.
 */

import { CompanionMetadataSheets } from './companionMetadataSheets';
import { GoogleDriveToken } from './googleOAuth2Helper';
import { loadPnDriveFolders } from './pnDriveIndex';
import { storageCredentialsService } from './storageCredentialsService';

function extractAccountId(account: Record<string, unknown>): string | undefined {
  const id = account.accountId ?? account.id ?? account.email;
  return id != null ? String(id) : undefined;
}

function normalizePn(pn: string): string {
  return pn.startsWith('pn-') ? pn : `pn-${pn}`;
}

export type CompanionAppendFn = (
  token: GoogleDriveToken,
  spreadsheetId: string,
  ownerPnIdentifier: string,
  accountId: string | undefined
) => Promise<void>;

/**
 * Resolve owner Drive context and append a row to their per-file companion metadata sheet.
 * Non-fatal: logs warnings and returns on failure.
 */
export async function appendOwnerCompanionEngagement(
  fileId: string,
  ownerPn: string,
  appendFn: CompanionAppendFn
): Promise<void> {
  const ownerPnIdentifier = normalizePn(ownerPn);

  try {
    const credentialsRecord = await storageCredentialsService.getCredentials(ownerPnIdentifier);
    const credentials = credentialsRecord?.credentials;
    const googleDriveAccounts =
      credentials?.googleDriveAccounts ||
      (credentials?.googleDrive ? [credentials.googleDrive] : []);

    if (googleDriveAccounts.length === 0) {
      console.warn(
        `[CompanionEngagement] No Google Drive credentials for owner fileId=${fileId}`
      );
      return;
    }

    const account = googleDriveAccounts[0];
    const accountId = extractAccountId(account);
    const token: GoogleDriveToken = {
      access_token: (account.access_token || account.accessToken) as string,
      refresh_token: account.refresh_token || account.refreshToken,
      expires_at: account.expires_at,
      expires_in: account.expires_in
    };

    const folders = await loadPnDriveFolders(ownerPnIdentifier);
    if (!folders) {
      console.warn(
        `[CompanionEngagement] Metadata folder not found for owner fileId=${fileId}`
      );
      return;
    }

    const spreadsheetId = await CompanionMetadataSheets.findSpreadsheet(
      token,
      folders.metadataFolderId,
      fileId,
      ownerPnIdentifier,
      accountId
    );

    if (!spreadsheetId) {
      console.warn(
        `[CompanionEngagement] Companion spreadsheet not found for fileId=${fileId}`
      );
      return;
    }

    await appendFn(token, spreadsheetId, ownerPnIdentifier, accountId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[CompanionEngagement] Failed to update companion sheet fileId=${fileId}:`,
      message
    );
  }
}
