/**
 * pN creation and .pn file import handlers for the dashboard shell.
 *
 * Extracted from App.tsx: App owns the state, this hook owns the behavior.
 */
import type React from 'react';
import { IdentityCrypto, type AuthSession } from '@par-noir/identity-crypto';
import { analytics } from '../utils/analytics';
import { security } from '../utils/security';
import { InputValidator } from '../utils/validation';
import { downloadFile } from '../utils/helpers';
import { generateRandomNickname } from '../utils/randomNickname';
import { MigrationManager } from '../utils/migration';
import { parsePortablePnBackup } from '../utils/parsePortablePnBackup';
import SimpleStorage, { SimpleIdentity } from '../utils/simpleStorage';
import type { SecureStorage } from '../utils/storage';
import { setPendingRecoverySharesBuffer } from '../services/recoveryVaultService';
import {
  authenticateDeviceBoundPn,
  checkDeviceBoundPnUnlockAvailable,
  DEVICE_BOUND_PN_ERROR,
  isDeviceBoundPnEnvelope,
} from '../services/deviceBoundPnService';
import type { DIDInfo } from '../types/app';
import type { ImportFormState } from './useAppState';

export interface CreateIdentityForm {
  pnName: string;
  confirmPNName: string;
  passcode: string;
  confirmPasscode: string;
  nickname: string;
  email: string;
  phone: string;
  recoveryEmail: string;
  confirmRecoveryEmail: string;
  recoveryPhone: string;
  confirmRecoveryPhone: string;
  recoveryContactType: 'email' | 'phone';
}

export interface UseCreateImportHandlersParams {
  storage: SecureStorage;
  recoveryVaultPnId: string | null;

  createForm: CreateIdentityForm;
  setCreateForm: React.Dispatch<React.SetStateAction<CreateIdentityForm>>;
  createStep: number;
  setCreateStep: React.Dispatch<React.SetStateAction<number>>;
  setShowCreateForm: React.Dispatch<React.SetStateAction<boolean>>;

  importForm: ImportFormState;
  setImportForm: React.Dispatch<React.SetStateAction<ImportFormState>>;
  setShowImportForm: React.Dispatch<React.SetStateAction<boolean>>;

  setDids: React.Dispatch<React.SetStateAction<DIDInfo[]>>;
  setSelectedDID: React.Dispatch<React.SetStateAction<DIDInfo | null>>;
  setAuthenticatedUser: React.Dispatch<React.SetStateAction<any>>;
  setIsNewUser: React.Dispatch<React.SetStateAction<boolean>>;
  setShowOnboardingWizard: React.Dispatch<React.SetStateAction<boolean>>;

  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setSuccessWithTimeout: (message: string | null) => void;
  showSuccessMessage: (message: string, duration?: number) => void;
  logDebug: (message: string, ...args: unknown[]) => void;
  logError: (message: string, ...args: unknown[]) => void;
}

export function useCreateImportHandlers(params: UseCreateImportHandlersParams) {
  const {
    storage,
    recoveryVaultPnId,
    createForm,
    setCreateForm,
    createStep,
    setCreateStep,
    setShowCreateForm,
    importForm,
    setImportForm,
    setShowImportForm,
    setDids,
    setSelectedDID,
    setAuthenticatedUser,
    setIsNewUser,
    setShowOnboardingWizard,
    setLoading,
    setError,
    setSuccessWithTimeout,
    showSuccessMessage,
    logDebug,
    logError
  } = params;

  const handleCreateDID = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('handleCreateDID called', { createForm, createStep });
    
    try {
      logDebug('Starting identity creation...');
      setLoading(true);
      setError(null);

      const pnNameValidation = InputValidator.validatePNName(createForm.pnName);
      if (!pnNameValidation.isValid) {
        const errorMsg = `Key 1 validation failed: ${pnNameValidation.errors.join(', ')}`;
        setError(errorMsg);
        setLoading(false);
        analytics.trackError(new Error(errorMsg), 'create-form', 'high');
        setTimeout(() => setError(null), 9000);
        return;
      }

      const passcodeValidation = InputValidator.validatePasscode(createForm.passcode);
      if (!passcodeValidation.isValid) {
        const errorMsg = `Key 2 validation failed: ${passcodeValidation.errors.join(', ')}`;
        setError(errorMsg);
        setLoading(false);
        analytics.trackError(new Error(errorMsg), 'create-form', 'high');
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Validate optional fields
      if (createForm.recoveryEmail) {
        const emailValidation = InputValidator.validateEmail(createForm.recoveryEmail);
        if (!emailValidation.isValid) {
          const errorMsg = `Email validation failed: ${emailValidation.errors.join(', ')}`;
          setError(errorMsg);
          setLoading(false);
          setTimeout(() => setError(null), 9000);
          return;
        }
      }

      if (createForm.recoveryPhone) {
        const phoneValidation = InputValidator.validatePhone(createForm.recoveryPhone);
        if (!phoneValidation.isValid) {
          const errorMsg = `Phone validation failed: ${phoneValidation.errors.join(', ')}`;
          setError(errorMsg);
          setLoading(false);
          setTimeout(() => setError(null), 9000);
          return;
        }
      }

      // Rate limiting check
      const rateLimitConfig = {
        maxRequests: 5,
        windowMs: 60000, // 1 minute
        keyGenerator: (userId?: string) => `create_identity_${userId || 'anonymous'}`
      };

      if (!security.checkRateLimit(rateLimitConfig)) {
        setError('Too many requests. Please wait a moment and try again.');
        setLoading(false);
        setTimeout(() => setError(null), 9000);
        return;
      }

      // Initialize storage if not already done
      try {
        await storage.init();
      } catch (error) {
        logError('Storage initialization error:', error);
        // Try to clear and reinitialize storage
        try {
          await storage.clearAllData();
          await storage.init();
        } catch (retryError) {
          logError('Storage retry failed:', retryError);
          throw new Error('Storage system error. Please clear your browser data and try again.');
        }
      }

      // Validate passcode confirmation
      if (createForm.passcode !== createForm.confirmPasscode) {
        throw new Error('Passcodes do not match');
      }

      // Validate recovery contact is provided
      if (createForm.recoveryContactType === 'email' && !createForm.recoveryEmail) {
        throw new Error('Recovery email is required');
      }
      if (createForm.recoveryContactType === 'phone' && !createForm.recoveryPhone) {
        throw new Error('Recovery phone is required');
      }

      // Validate confirmation fields match
      if (createForm.pnName !== createForm.confirmPNName) {
        throw new Error('pN Names do not match');
      }
      

      
      if (createForm.recoveryContactType === 'email' && createForm.recoveryEmail !== createForm.confirmRecoveryEmail) {
        throw new Error('Recovery emails do not match');
      }
      
      if (createForm.recoveryContactType === 'phone' && createForm.recoveryPhone !== createForm.confirmRecoveryPhone) {
        throw new Error('Recovery phone numbers do not match');
      }

      // Generate random nickname
      const randomNickname = generateRandomNickname();
      
      // Create real identity with cryptography
      logDebug('Creating encrypted identity...');
      const creation = await IdentityCrypto.createIdentity(
        createForm.pnName,
        randomNickname,
        createForm.passcode,
        createForm.recoveryEmail ? createForm.recoveryEmail : undefined,
        createForm.recoveryPhone ? createForm.recoveryPhone : undefined
      );
      const encryptedIdentity = creation.identity;
      try {
        setPendingRecoverySharesBuffer({
          publicKey: encryptedIdentity.publicKey,
          shares: creation.recoveryShares,
          threshold: creation.recoveryConfig.threshold,
        });
      } catch {
        /* optional */
      }
      logDebug('Encrypted identity created successfully');

      // Portable .pn file is the identity — required for every unlock (file + pN name + passcode).
      const pnExport = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        identities: [encryptedIdentity],
      };
      const pnFilename = `${randomNickname
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase()
        .substring(0, 20)}.pn`;
      downloadFile(JSON.stringify(pnExport, null, 2), pnFilename);

      // Optional PWA browser cache only — unlock always requires the .pn file.
      try {
        const simpleStorage = SimpleStorage.getInstance();
        const { PNNameHash } = await import('../utils/security/pnNameHash');
        const pnNameHash = await PNNameHash.getLookupKey(createForm.pnName);

        const simpleIdentity: SimpleIdentity = {
          id: encryptedIdentity.publicKey,
          nickname: randomNickname,
          pnNameHash,
          publicKey: encryptedIdentity.publicKey,
          encryptedData: encryptedIdentity,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
        };

        await simpleStorage.storeIdentity(simpleIdentity);
        MigrationManager.storeForMigration(encryptedIdentity);
      } catch (error) {
        logError('Optional PWA browser cache failed (your .pn file is what matters):', error);
      }

      // Recovery keys are now automatically generated and encrypted in the ID file
      // They will be available after decryption and can be linked to custodians in dashboard metadata

      // Create DID info for UI (all data is encrypted except public key)
      const didInfo: DIDInfo = {
        id: '', // ID is encrypted - will be filled after decryption
        pnName: '', // pN Name is encrypted - user must enter it
        email: '', // Email is encrypted
        nickname: '', // Nickname is encrypted
        phone: '', // Phone is encrypted
        recoveryEmail: '', // Recovery email is encrypted
        recoveryPhone: '', // Recovery phone is encrypted
        createdAt: '', // Created at is encrypted
        status: 'active', // Default status
        custodiansRequired: false, // Default value
        custodiansSetup: false // Default value
      };



      // Update the UI with the new identity
      setDids(prev => {
        const newDids = [...prev, didInfo];
        return newDids;
      });
      setSelectedDID(didInfo);
      
      // Authenticate the user using the existing system (which is already decentralized)
      try {
        const authSession = await IdentityCrypto.authenticateIdentity(encryptedIdentity, createForm.passcode, createForm.pnName);
        setAuthenticatedUser(authSession);
        

        
        showSuccessMessage(
          `pN created! Your .pn file was downloaded — keep it safe; you need it with your pN name and passcode to unlock. Nickname: ${randomNickname}.`
        );
        
        // Trigger onboarding wizard for new users
        setIsNewUser(true);
        setShowOnboardingWizard(true);
      } catch (authError) {
        logError('Authentication error after creation:', authError);
        setError('pN created but authentication failed. Please try logging in.');
      }
      
      // Reset form
      setCreateForm({
        pnName: '',
        confirmPNName: '',
        passcode: '',
        confirmPasscode: '',
        nickname: '',
        email: '',
        phone: '',
        recoveryEmail: '',
        confirmRecoveryEmail: '',
        recoveryPhone: '',
        confirmRecoveryPhone: '',
        recoveryContactType: 'email'
      });
      setCreateStep(1);
      setShowCreateForm(false);
      setTimeout(() => setSuccessWithTimeout(null), 5000);
      
      // Track successful identity creation
      analytics.trackEvent('identity', 'created', 'success');
      analytics.trackFeatureUsage('identity_creation', 'completed');
    } catch (error: any) {
      logError('Create DID error:', error);
      setError(error.message || 'Failed to create DID');
      setTimeout(() => setError(null), 9000);
      
      // Track error
      analytics.trackError(error, 'create-form', 'medium');
      security.monitorAuthentication(false, createForm.pnName, 'identity_creation');
    } finally {
      setLoading(false);
    }
  };

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
        pnName: '',
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
    handleCreateDID,
    handleImportDID
  };
}
