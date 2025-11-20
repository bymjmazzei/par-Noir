/**
 * pN Identifier Verification Utility
 * 
 * Helps verify which pN identifier is correct for a user's credentials
 * The correct identifier is generated using VolumeIdGenerator: pnName:passcode:publicKey
 */

import { VolumeIdGenerator } from './crypto/volumeIdGenerator';
import { SecureCredentialManager } from './secureCredentialManager';

/**
 * Verify which pN identifier is correct
 * @param sessionId - Current user session ID
 * @param pnName - User's pnName
 * @param publicKey - User's public key
 * @returns The correct pN identifier and comparison with fallback methods
 */
export async function verifyPnIdentifier(
  sessionId: string,
  pnName: string,
  publicKey: string
): Promise<{
  correctIdentifier: string;
  fallbackIdentifier?: string;
  method: 'VolumeIdGenerator' | 'fallback';
}> {
  // Get passcode from SecureCredentialManager
  const credentials = SecureCredentialManager.getCredentials(sessionId);
  if (!credentials) {
    throw new Error('Credentials not available - user must be authenticated');
  }

  // Generate correct identifier using VolumeIdGenerator
  const correctIdentifier = await VolumeIdGenerator.generateVolumeId({
    pnName,
    passcode: credentials.passcode,
    publicKey
  });

  // Generate fallback identifier (did:publicKey method) for comparison
  const did = sessionId;
  const combined = `${did}:${publicKey}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const fallbackIdentifier = `pn-${hashHex.substring(0, 12)}`;

  return {
    correctIdentifier,
    fallbackIdentifier: fallbackIdentifier !== correctIdentifier ? fallbackIdentifier : undefined,
    method: 'VolumeIdGenerator'
  };
}

/**
 * Check which Google Drive folder is correct
 * @param folderNames - Array of folder names from Google Drive
 * @param sessionId - Current user session ID
 * @param pnName - User's pnName
 * @param publicKey - User's public key
 * @returns Which folder is correct and which should be used
 */
export async function verifyCorrectFolder(
  folderNames: string[],
  sessionId: string,
  pnName: string,
  publicKey: string
): Promise<{
  correctFolder: string | null;
  correctIdentifier: string;
  allFolders: Array<{ name: string; identifier: string; isCorrect: boolean }>;
}> {
  const verification = await verifyPnIdentifier(sessionId, pnName, publicKey);
  const expectedFolderName = `par Noir - ${verification.correctIdentifier}`;

  const allFolders = folderNames.map(name => {
    // Extract identifier from folder name (format: "par Noir - pn-{identifier}")
    const match = name.match(/par Noir - (pn-[a-f0-9]{12})/i);
    const identifier = match ? match[1] : null;
    return {
      name,
      identifier: identifier || 'unknown',
      isCorrect: identifier === verification.correctIdentifier
    };
  });

  const correctFolder = allFolders.find(f => f.isCorrect)?.name || null;

  return {
    correctFolder,
    correctIdentifier: verification.correctIdentifier,
    allFolders
  };
}

