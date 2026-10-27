/**
 * .pn file import handler for the dashboard shell. pN creation happens in par Noir Unlock.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { IdentityCrypto, type AuthSession } from '@par-noir/identity-crypto';
import { parsePortablePnBackup } from '../utils/parsePortablePnBackup';
import type { SecureStorage } from '../utils/storage';
import {
  authenticateDeviceBoundPn,
  checkDeviceBoundPnUnlockAvailable,
  DEVICE_BOUND_PN_ERROR,
  isDeviceBoundPnEnvelope,
} from '../services/deviceBoundPnService';
import type { DIDInfo } from '../types/app';
import type { ImportFormState } from './useAppState';

export interface UseCreateImportHandlersParams {
  storage: SecureStorage;
  recoveryVaultPnId: string | null;

  importForm: ImportFormState;
  setImportForm: React.Dispatch<React.SetStateAction<ImportFormState>>;
  setShowImportForm: React.Dispatch<React.SetStateAction<boolean>>;

  setDids: React.Dispatch<React.SetStateAction<DIDInfo[]>>;
  setSelectedDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;

  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessWithTimeout: (message: string | null) => void;
}

export function useCreateImportHandlers(params: UseCreateImportHandlersParams) {
  const {
    storage,
    recoveryVaultPnId,
    importForm,
    setImportForm,
    setShowImportForm,
    setDids,
    setSelectedDID,
    setAuthenticatedUser,
    setLoading,
    setError,
    setSuccessWithTimeout,
  } = params;

  const handleImportDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError(null);

      // Initialize storage if not already done
      await storage.init();

      // Validate backup file
      if (!importForm.backupFile) {
        throw new Error('Please select a backup file to import');
      }

      // Read and parse backup file
      const backupData = await importForm.backupFile.text();
      const backup = JSON.parse(backupData);

      // Validate backup structure
      if (!backup.identities || !Array.isArray(backup.identities)) {
        throw new Error('Invalid backup file format');
      }

      let authSession: AuthSession;
      let importedIdentity: Record<string, unknown>;

      if (isDeviceBoundPnEnvelope(backup)) {
        if (!(await checkDeviceBoundPnUnlockAvailable(backup, recoveryVaultPnId))) {
          throw new Error(DEVICE_BOUND_PN_ERROR);
        }
        if (backup.identities.length !== 1) {
          throw new Error('Invalid device-bound pN file: expected a single identity');
        }
        const result = await authenticateDeviceBoundPn({
          envelope: backup,
          pnName: importForm.pnName,
          passcode: importForm.passcode,
          pnIdentifier: recoveryVaultPnId,
        });
        authSession = result.authSession;
        importedIdentity = result.identity;
      } else {
        if (backup.identities.length !== 1) {
          throw new Error('Invalid pN file: Multiple identities found. Each pN file should contain only one identity.');
        }
        const identityToImport = parsePortablePnBackup(backup);

        authSession = await IdentityCrypto.authenticateIdentity(
          identityToImport,
          importForm.passcode,
          importForm.pnName
        );
        importedIdentity = { ...identityToImport };
      }

      // Store the session
      await storage.storeSession(authSession);

      // Create DID info for UI
      const didInfo: DIDInfo = {
        id: authSession.id,
        nickname: authSession.nickname,
        email: '',
        phone: '',
        recoveryEmail: '',
        recoveryPhone: '',
        createdAt: authSession.authenticatedAt,
        status: 'active',
        custodiansRequired: true,
        custodiansSetup: false
      };

      setDids(prev => {
        const newDids = [...prev, didInfo];
        return newDids;
      });
      setSelectedDID(didInfo);
      
      // Set authenticated user
      setAuthenticatedUser(authSession);
      
      // Reset form
      setImportForm({
        pnName: '',
        passcode: '',
        backupFile: null
      });
      setShowImportForm(false);
      setSuccessWithTimeout('pN imported and authenticated successfully!');
      setTimeout(() => setSuccessWithTimeout(null), 5000);
    } catch (error: any) {
      setError(error.message || 'Failed to import DID');
      setTimeout(() => setError(null), 9000);
    } finally {
      setLoading(false);
    }
  };

  return {
    handleImportDID
  };
}
