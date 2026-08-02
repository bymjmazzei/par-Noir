/**
 * Identity resolution for FileStorageAggregator.
 *
 * Owns resolvedAuth (public data only — secrets stay in SecureCredentialManager)
 * and the standardized pN identifier derived from it.
 *
 * STANDARDIZED pN Identifier - Single source of truth
 * Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
 * This is the ONLY method used across all implementations (web, desktop, mobile)
 */
import React from 'react';
import { SecureCredentialManager } from '@par-noir/identity-crypto';
import {
  isDesktopShell,
  type DesktopUnlockPayload,
  type DesktopLockPayload,
} from '../FileStorageAggregatorTypes';

export interface UseStorageIdentityParams {
  authenticatedUser: any;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  getPasscodeFromSecureStorage: (sessionId: string | null | undefined) => string | null;
}

export function useStorageIdentity({
  authenticatedUser,
  setError,
  getPasscodeFromSecureStorage,
}: UseStorageIdentityParams) {
  // SECURITY: resolvedAuth should NOT contain secrets (pnName, passcode)
  // Use SecureCredentialManager.getCredentials(sessionId) to retrieve secrets when needed
  const [resolvedAuth, setResolvedAuth] = React.useState<{ publicKey: string; authToken?: string } | null>(null);

  // Use refs to avoid accessing state/props during initialization
  // Initialize with null to completely avoid any initialization order issues
  const resolvedAuthRef = React.useRef<any>(null);
  const authenticatedUserRef = React.useRef<any>(null);
  const lastDesktopPayloadRef = React.useRef<DesktopUnlockPayload | null>(null);
  const lastDesktopAuthStateRef = React.useRef<'locked' | 'unlocked'>('locked');

  // Keep refs in sync with state/props - update whenever they change
  React.useEffect(() => {
    resolvedAuthRef.current = resolvedAuth;
    authenticatedUserRef.current = authenticatedUser;
  }, [resolvedAuth, authenticatedUser]);

  // Derive pN identifier asynchronously and store in ref (must be declared before getStorageIdentityCandidates)
  const pnIdentifierRef = React.useRef<string | null>(null);
  const [cloudPnIdentifier, setCloudPnIdentifier] = React.useState<string | null>(null);

  React.useEffect(() => {
    const derivePnIdentifier = async () => {
      const currentResolvedAuth = resolvedAuthRef.current;
      const currentAuthenticatedUser = authenticatedUserRef.current;
      
      // STANDARDIZED: Use VolumeIdGenerator - the ONLY method for pN identifier generation
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const sessionId = currentAuthenticatedUser?.id;
        // SECURITY: Get pnName and passcode from SecureCredentialManager (secrets)
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        // SECURITY: Get publicKey from resolvedAuth or authenticatedUser (public data)
      const publicKey = currentResolvedAuth?.publicKey || currentAuthenticatedUser?.publicKey;
      
        // SECURITY: Use credentials.pnName (from SecureCredentialManager), not from state
        if (credentials?.pnName && credentials?.passcode && publicKey) {
          // STANDARDIZED FORMULA: pnName:passcode:publicKey → SHA256 → pn-{12-char-hex}
          const identifier = await VolumeIdGenerator.generateVolumeId({
            pnName: credentials.pnName,
            passcode: credentials.passcode,
            publicKey
          });
          // CRITICAL: Store WITH 'pn-' prefix - this is the standardized format
          // API expects pn-{hash} format, not just {hash}
          pnIdentifierRef.current = identifier; // Keep full format: pn-{12-char-hex}
          setCloudPnIdentifier(identifier);
          console.log('[StorageCredentials] Derived pN identifier (standardized):', identifier);
        } else {
        pnIdentifierRef.current = null;
          setCloudPnIdentifier(null);
          console.warn('[StorageCredentials] Cannot derive pN identifier - missing credentials');
        }
      } catch (error) {
        console.error('[StorageCredentials] Error deriving pN identifier:', error);
        pnIdentifierRef.current = null;
        setCloudPnIdentifier(null);
      }
    };
    
    derivePnIdentifier();
  }, [resolvedAuth, authenticatedUser]);
  
  // Helper function to generate pn identifier synchronously if available, or return null
  // This ensures we always use the standardized pn identifier format
  async function getPnIdentifier(): Promise<string | null> {
    // First check if we already have it cached
    if (pnIdentifierRef.current) {
      return pnIdentifierRef.current;
    }
    
    // If not cached, try to generate it on-demand
    const currentResolvedAuth = resolvedAuthRef.current;
    const currentAuthenticatedUser = authenticatedUserRef.current;
    const sessionId = currentAuthenticatedUser?.id;
    // SECURITY: Get pnName and passcode from SecureCredentialManager (secrets)
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    
    // SECURITY: Get publicKey from resolvedAuth or authenticatedUser (public data)
    const publicKey = currentResolvedAuth?.publicKey || currentAuthenticatedUser?.publicKey;
    
    // SECURITY: Use credentials.pnName (from SecureCredentialManager), not from state
    if (credentials?.pnName && credentials?.passcode && publicKey) {
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const identifier = await VolumeIdGenerator.generateVolumeId({
          pnName: credentials.pnName,
          passcode: credentials.passcode,
          publicKey
        });
        // Cache it for future use
        pnIdentifierRef.current = identifier;
        return identifier;
      } catch (error) {
        console.error('[StorageCredentials] Error generating pn identifier on-demand:', error);
        return null;
      }
    }
    
    return null;
  }

  // Use a function declaration (not const arrow function) so it's hoisted and available during initialization
  // This function reads from refs to avoid circular dependency issues
  // CRITICAL: Returns ONLY the standardized pn identifier - no other candidates
  // SECURITY: NEVER include pnName in identity candidates - it's a secret credential
  function getStorageIdentityCandidates(): string[] {
    const candidates: string[] = [];
    
    // CRITICAL: Use ONLY the standardized pn identifier
    // If pnIdentifierRef is not set yet, return empty array (don't fall back to other identifiers)
    // This prevents duplicate API calls with different identityIds
    if (pnIdentifierRef.current && pnIdentifierRef.current.startsWith('pn-')) {
      candidates.push(pnIdentifierRef.current);
    }
    
    // REMOVED: All other candidates (DID, public key, pn name) - they cause duplicate API calls
    // Only use standardized pn identifier: pn-{12-char-hex-hash}
    
    return Array.from(new Set(candidates.filter((value) => value && value.trim().length > 0)));
  }

  React.useEffect(() => {
    // SECURITY: Check if credentials exist in SecureCredentialManager
    // resolvedAuth no longer contains passcode (it's a secret)
    try {
      const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
      const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
      
      if (!resolvedAuth || credentials) {
        // Credentials already exist, no need to hydrate
        return;
      }
    } catch (e) {
      console.warn('⚠️ [FileStorageAggregator] Unable to get credentials from SecureCredentialManager:', e);
    }
  }, [resolvedAuth, authenticatedUser]);

  // Resolve auth credentials
  React.useEffect(() => {
    const resolveAuth = async () => {
      // Always log - this is critical debugging
      if (import.meta.env.DEV) {
        console.log('🔍 [FileStorageAggregator] Resolving auth...');
      }
      // pnName is secret - not logged
      if (import.meta.env.DEV) {
        console.log('🔍 [FileStorageAggregator] authenticatedUser prop received');
      }

      // Try prop first
      if (authenticatedUser) {
        if (import.meta.env.DEV) {
          try {
            const safeKeys = Object.keys(authenticatedUser).filter(k => k !== 'pnName' && k !== 'passcode');
            console.log('🔍 [FileStorageAggregator] authenticatedUser keys:', safeKeys);
            console.log('🔍 [FileStorageAggregator] authenticatedUser structure:', {
              hasId: !!authenticatedUser.id,
              hasPublicKey: !!authenticatedUser.publicKey,
              hasNickname: !!authenticatedUser.nickname,
            });
          } catch (e) {
            console.warn('🔍 [FileStorageAggregator] Could not inspect authenticatedUser:', e);
          }
        }
        
        // SECURITY: Get pnName from SecureCredentialManager ONLY (secrets)
        // Never extract pnName from authenticatedUser - it's a SECRET and shouldn't be there
        const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        const pnName = credentials?.pnName || null;
        
        // Try multiple ways to extract publicKey
        let publicKey = authenticatedUser.publicKey;
        if (!publicKey && authenticatedUser.id) {
          if (typeof authenticatedUser.id === 'string' && authenticatedUser.id.startsWith('did:key:')) {
            publicKey = authenticatedUser.id;
          } else if (typeof authenticatedUser.id === 'string') {
            // Use id as publicKey if it's not a DID
            publicKey = authenticatedUser.id;
          }
        }
        
        if (import.meta.env.DEV) {
          console.log('🔍 [FileStorageAggregator] Extracted from prop:', { hasPnName: !!pnName, hasPublicKey: !!publicKey, hasId: !!authenticatedUser.id });
        }
        
        let passcode: string | null = null;
        try {
          // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          passcode = getPasscodeFromSecureStorage(sessionId);
          if (import.meta.env.DEV) {
            console.log('🔍 [FileStorageAggregator] Passcode from SecureCredentialManager:', passcode ? 'found' : 'not found');
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.warn('🔍 [FileStorageAggregator] SecureCredentialManager not available');
          }
        }
        
        const authToken = authenticatedUser?.authToken;
        
        if (pnName && publicKey && passcode) {
          // SECURITY: Store secrets in SecureCredentialManager, not in resolvedAuth state
          const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
          if (sessionId) {
            SecureCredentialManager.setCredentials(sessionId, pnName, passcode);
          }
          
          if (import.meta.env.DEV) {
            console.log('✅ [FileStorageAggregator] Auth resolved from prop:', { hasPnName: !!pnName, hasPublicKey: !!publicKey });
          }
          // SECURITY: Only store public data in resolvedAuth (no secrets)
          setResolvedAuth({
            publicKey,
            authToken: authToken || undefined,
          });
          setError(null);
          return;
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ [FileStorageAggregator] Missing credentials from prop:', { hasPnName: !!pnName, hasPublicKey: !!publicKey, authenticatedUserKeys: Object.keys(authenticatedUser || {}) });
          }
        }
      } else {
        if (import.meta.env.DEV) {
          console.log('⚠️ [FileStorageAggregator] No authenticatedUser prop');
        }
      }
      
      // Fallback: Try to load from storage
      try {
        if (import.meta.env.DEV) {
          console.log('🔍 [FileStorageAggregator] Trying storage fallback...');
        }
        const { SecureStorage } = await import('../../../utils/storage');
        const storage = new SecureStorage();
        await storage.init(); // Initialize database first
        const session = await storage.getCurrentSession();
        
        if (session) {
          const pnName = (session as any).pnName || (session as any).username || (session as any).name;
          const publicKey = (session as any).publicKey || 
            (session.id && session.id.startsWith('did:key:') ? session.id : session.id);
          const sessionAuthToken = (session as any).authToken;
          
          if (import.meta.env.DEV) {
            console.log('🔍 [FileStorageAggregator] Extracted from storage:', { hasPnName: !!pnName, hasPublicKey: !!publicKey, sessionKeys: Object.keys(session) });
          }
          
          let passcode: string | null = null;
          try {
            // SECURITY: Get passcode from SecureCredentialManager instead of sessionStorage
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
            passcode = getPasscodeFromSecureStorage(sessionId);
          } catch (e) {
            // SecureCredentialManager might not be available
          }
          
          if (pnName && publicKey && passcode) {
            // SECURITY: Store secrets in SecureCredentialManager, not in resolvedAuth state
            const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || session?.id || null;
            if (sessionId) {
              SecureCredentialManager.setCredentials(sessionId, pnName, passcode);
            }
            
            if (import.meta.env.DEV) {
              console.log('✅ [FileStorageAggregator] Auth resolved from storage');
            }
            // SECURITY: Only store public data in resolvedAuth (no secrets)
            setResolvedAuth({
              publicKey,
              authToken: sessionAuthToken || undefined,
            });
            setError(null);
          } else {
            if (import.meta.env.DEV) {
              console.warn('⚠️ [FileStorageAggregator] Missing credentials from storage:', { hasPnName: !!pnName, hasPublicKey: !!publicKey });
            }
          }
        } else {
          if (import.meta.env.DEV) {
            console.warn('⚠️ [FileStorageAggregator] No session found in storage');
          }
        }
      } catch (err) {
        console.error('❌ [FileStorageAggregator] Error loading from storage:', err);
      }
    };
    
    // Wrap in try-catch to prevent unhandled promise rejections
    resolveAuth().catch((err) => {
      console.error('❌ [FileStorageAggregator] Auth resolution failed:', err);
      // Don't break the app - just log the error
    });
  }, [authenticatedUser]);

  // Broadcast the unlocked identity session to the desktop shell.
  React.useEffect(() => {
    if (!isDesktopShell) {
      lastDesktopAuthStateRef.current = 'locked';
      lastDesktopPayloadRef.current = null;
      return;
    }

    // SECURITY: Check credentials instead of resolvedAuth.pnName (secret)
    const sessionId = authenticatedUser?.id || (authenticatedUser as any)?.publicKey || null;
    const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
    const hasAuth = Boolean(credentials?.pnName && resolvedAuth?.publicKey && resolvedAuth?.authToken);

    if (!hasAuth) {
      if (lastDesktopAuthStateRef.current === 'unlocked') {
        window.dispatchEvent(
          new CustomEvent<DesktopLockPayload>('pn-auth-locked', {
            detail: lastDesktopPayloadRef.current ?? undefined,
          })
        );
        lastDesktopAuthStateRef.current = 'locked';
        lastDesktopPayloadRef.current = null;
      }
      return;
    }

    let disposed = false;

    void (async () => {
      let pnIdentifier: string | undefined;

      // STANDARDIZED: Use VolumeIdGenerator - the ONLY method for pN identifier
      // Formula: SHA256(pnName:passcode:publicKey) → first 12 hex chars → pn-{hash}
      try {
        const { VolumeIdGenerator } = await import('@par-noir/identity-crypto');
        const sessionId = authenticatedUser?.id;
        const credentials = sessionId ? SecureCredentialManager.getCredentials(sessionId) : null;
        
        // SECURITY: Get pnName from credentials (secrets), publicKey from resolvedAuth (public)
        if (credentials?.pnName && credentials?.passcode && resolvedAuth?.publicKey) {
          pnIdentifier = await VolumeIdGenerator.generateVolumeId({
            pnName: credentials.pnName,
            passcode: credentials.passcode,
            publicKey: resolvedAuth.publicKey
          });
          console.log('[DesktopUnlock] Generated pN identifier (standardized):', (pnIdentifier || '').substring(0, 8) + '...');
        } else {
          console.warn('[DesktopUnlock] Cannot generate standardized pN identifier - credentials required');
        }
      } catch (err) {
        console.error('[DesktopUnlock] Failed to generate standardized pN identifier:', err);
      }

      if (disposed) {
        return;
      }

      // SECURITY: Get pnName from credentials (secrets) for desktop unlock payload
      const pnNameForPayload = credentials?.pnName || null;
      if (!pnNameForPayload || !resolvedAuth?.publicKey || !resolvedAuth.authToken) {
        console.error('[DesktopUnlock] Missing credentials or publicKey');
        return;
      }

      const payload: DesktopUnlockPayload = {
        pnName: pnNameForPayload,
        publicKey: resolvedAuth.publicKey,
        authToken: resolvedAuth.authToken,
        pnIdentifier,
      };

      lastDesktopPayloadRef.current = payload;
      lastDesktopAuthStateRef.current = 'unlocked';

      console.debug('[FileStorageAggregator] Dispatching pn-auth-session', {
        hasAuthToken: Boolean(payload.authToken),
        pnIdentifier: payload.pnIdentifier,
      });

      window.dispatchEvent(new CustomEvent<DesktopUnlockPayload>('pn-auth-session', { detail: payload }));
    })();

    return () => {
      disposed = true;
    };
  }, [isDesktopShell, resolvedAuth, authenticatedUser]);

  React.useEffect(() => {
    if (!authenticatedUser && resolvedAuth) {
      setResolvedAuth(null);
    }
  }, [authenticatedUser, resolvedAuth]);

  return {
    resolvedAuth,
    setResolvedAuth,
    resolvedAuthRef,
    authenticatedUserRef,
    pnIdentifierRef,
    cloudPnIdentifier,
    getPnIdentifier,
    getStorageIdentityCandidates,
  };
}
