import React, { useState, useEffect, useCallback } from 'react';
import { X, Shield, CheckCircle, AlertCircle, CreditCard } from 'lucide-react';
import type { EncryptedIdentity } from '../types/crypto';
import type { VerifiedIdentityData, VerificationMetadata } from '../types/verifiedIdentity';
import { SectionInfo } from './common/SectionInfo';
import {
  MonetizationService,
  type MonetizationStatusResponse,
  type IdentityDecisionResponse
} from '../services/monetization/MonetizationService';

interface IdentityVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationComplete: (verifiedData: VerifiedIdentityData) => void | Promise<void>;
  identityId?: string;
  /** Required to mint ZK v1 proofs (ML-DSA). */
  encryptedIdentity?: EncryptedIdentity;
  /** API bearer token for membership status, verification session and decision. */
  accessToken?: string | null;
  /** Reconciles the held credential with the API flag (present / reissue); true when the flag changed. */
  syncHeldCredential?: (serverVerified: boolean) => Promise<boolean>;
}

interface PendingIdentitySession {
  sessionId: string;
  url: string;
  state: string;
  createdAt: number;
}

/** The signed state lives 7 days; resume for 6. Hosted URLs are short-lived, so resuming refetches one. */
const PENDING_RESUME_MS = 6 * 24 * 60 * 60 * 1000;
const TERMINAL_STATUSES = new Set(['approved', 'declined', 'expired', 'unknown']);

function pendingKey(identityId: string | undefined): string {
  return `parnoir.identityPending.${identityId || 'default'}`;
}

function readPending(identityId: string | undefined): PendingIdentitySession | null {
  try {
    const raw = localStorage.getItem(pendingKey(identityId));
    const p = raw ? (JSON.parse(raw) as PendingIdentitySession) : null;
    if (!p?.state || !p.url || Date.now() - p.createdAt > PENDING_RESUME_MS) return null;
    return p;
  } catch {
    return null;
  }
}

function writePending(identityId: string | undefined, p: PendingIdentitySession | null): void {
  try {
    if (p) localStorage.setItem(pendingKey(identityId), JSON.stringify(p));
    else localStorage.removeItem(pendingKey(identityId));
  } catch {
    /* storage unavailable: the session still completes, it just won't resume */
  }
}

interface VerificationStep {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
}

const STEPS: VerificationStep[] = [
  { id: 'membership', title: 'Membership', icon: CreditCard },
  { id: 'verification', title: 'Identity Check', icon: Shield },
  { id: 'complete', title: 'Complete', icon: CheckCircle }
];

const DECISION_MESSAGES: Record<string, string> = {
  pending: 'Finish the Stripe verification flow, then finalize here. If you already submitted, try again in a few minutes.',
  review: 'Stripe is processing your submission. Try again in a few minutes.',
  resubmission_requested: 'Stripe could not verify that submission. Continue verification to try again.',
  declined: 'This verification was declined.',
  expired: 'The verification session ended. Start verification again.',
  unknown: 'The verification session is in an unexpected state. Start verification again.'
};

function documentTypeFromStripe(
  type: string | null | undefined,
  country: string | null | undefined
): VerificationMetadata['documentType'] {
  switch (String(type || '').toLowerCase()) {
    case 'passport':
      return 'passport';
    case 'driving_license':
      return 'drivers_license';
    case 'id_card':
      return String(country || '').toUpperCase() === 'US' ? 'state_id' : 'national_id';
    default:
      return 'national_id';
  }
}

function extractedFromDecision(decision: IdentityDecisionResponse) {
  const person = decision.person;
  const doc = decision.document;
  return {
    firstName: person?.firstName || '',
    lastName: person?.lastName || '',
    middleName: '',
    dateOfBirth: person?.dateOfBirth || '',
    documentType: documentTypeFromStripe(doc?.type, doc?.country),
    documentNumber: doc?.number || '',
    country: doc?.country || '',
    state: doc?.state || '',
    expirationDate: doc?.validUntil || ''
  };
}

export const IdentityVerificationModal: React.FC<IdentityVerificationModalProps> = ({
  isOpen,
  onClose,
  onVerificationComplete,
  identityId,
  encryptedIdentity,
  accessToken,
  syncHeldCredential
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<MonetizationStatusResponse | null>(null);
  const [pending, setPending] = useState<PendingIdentitySession | null>(null);

  const loadStatus = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    setPending(readPending(identityId));
    try {
      let s = await MonetizationService.getStatus(accessToken);
      if (syncHeldCredential) {
        const changed = await syncHeldCredential(s.verified).catch((e) => {
          console.warn('Held verification credential not applied:', e instanceof Error ? e.message : e);
          return false;
        });
        if (changed) s = await MonetizationService.getStatus(accessToken);
      }
      setStatus(s);
      setCurrentStep(s.maintenanceActive || s.verified ? 1 : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load membership status');
    } finally {
      setLoading(false);
    }
  }, [accessToken, identityId, syncHeldCredential]);

  useEffect(() => {
    if (isOpen) void loadStatus();
    // syncHeldCredential is an inline prop; re-run only when the modal opens or the pN changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accessToken, identityId]);

  const clearPending = () => {
    writePending(identityId, null);
    setPending(null);
  };

  const subscribe = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      window.location.href = await MonetizationService.createCheckoutSession(
        accessToken,
        window.location.origin
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setLoading(false);
    }
  };

  const redirectToVerification = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const resume = readPending(identityId);
      if (resume) {
        const decision = await MonetizationService.getIdentityDecision(accessToken, resume.state);
        if (decision.url) {
          writePending(identityId, { ...resume, url: decision.url });
          window.location.href = decision.url;
          return;
        }
        if (decision.status === 'approved') {
          await completeFromDecision(decision);
          setLoading(false);
          return;
        }
        if (!TERMINAL_STATUSES.has(decision.status)) {
          setError(DECISION_MESSAGES[decision.status] || `Verification status: ${decision.status}`);
          setLoading(false);
          return;
        }
        clearPending();
      }
      const session = await MonetizationService.createIdentitySession(
        accessToken,
        `${window.location.origin}/?verification=identity_return`
      );
      writePending(identityId, { ...session, createdAt: Date.now() });
      window.location.href = session.url;
    } catch (e) {
      if ((e as { code?: string }).code === 'invalid_state') clearPending();
      setError(e instanceof Error ? e.message : 'Failed to start verification. Please try again later.');
      setLoading(false);
    }
  };

  const generateZKProofs = async (extractedData: any) => {
    const { ZKPGenerator } = await import('../utils/ZKPGenerator');
    const zkpProofs: { [key: string]: { value: any; zkpProof: string; verified: boolean; expirationDate?: string } } = {};

    if (!identityId) {
      throw new Error('Identity context missing: unlock to generate ZK proofs.');
    }

    const { loadMlDsaKeypairForZk } = await import('../utils/zkPqcSigning');
    const zkBase = { signingKeys: await loadMlDsaKeypairForZk(identityId, encryptedIdentity) };

    // Calculate ID expiration days for dynamic data
    const idExpirationDate = extractedData.expirationDate;
    const idExpirationDays = idExpirationDate 
      ? Math.ceil((new Date(idExpirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      : 365; // Fallback to 1 year if no expiration date

    // Static data - truly perpetual (100 years)
    const perpetualExpiration = 365 * 100;

    // Generate ZKPs for identity attestation (perpetual)
    if (extractedData.firstName && extractedData.lastName) {
      const identityProof = await ZKPGenerator.generateZKP({
        ...zkBase,
        dataPointId: 'identity_attestation',
        userData: {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        },
        verificationLevel: 'verified',
        expirationDays: perpetualExpiration
      });
      
      zkpProofs.identity_attestation = {
        value: {
          firstName: extractedData.firstName,
          lastName: extractedData.lastName,
          middleName: extractedData.middleName || ''
        },
        zkpProof: identityProof.proof,
        verified: true,
        expirationDate: new Date(Date.now() + perpetualExpiration * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Generate ZKP for age attestation (perpetual)
    if (extractedData.dateOfBirth) {
      const ageProof = await ZKPGenerator.generateZKP({
        ...zkBase,
        dataPointId: 'age_attestation',
        userData: {
          dateOfBirth: extractedData.dateOfBirth
        },
        verificationLevel: 'verified',
        expirationDays: perpetualExpiration
      });
      
      zkpProofs.age_attestation = {
        value: {
          dateOfBirth: extractedData.dateOfBirth
        },
        zkpProof: ageProof.proof,
        verified: true,
        expirationDate: new Date(Date.now() + perpetualExpiration * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Generate ZKP for location verification (ID-based expiration)
    if (extractedData.country && extractedData.state) {
      const locationProof = await ZKPGenerator.generateZKP({
        ...zkBase,
        dataPointId: 'location_verification',
        userData: {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        },
        verificationLevel: 'verified',
        expirationDays: idExpirationDays
      });
      
      zkpProofs.location_verification = {
        value: {
          country: extractedData.country,
          region: extractedData.state,
          city: extractedData.city || '',
          postalCode: extractedData.postalCode || ''
        },
        zkpProof: locationProof.proof,
        verified: true,
        expirationDate: idExpirationDate || new Date(Date.now() + idExpirationDays * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    // Generate ZKP for document verification (ID-based expiration)
    if (extractedData.documentNumber && extractedData.documentType) {
      const documentProof = await ZKPGenerator.generateZKP({
        ...zkBase,
        dataPointId: 'document_verification',
        userData: {
          documentType: extractedData.documentType,
          documentNumber: extractedData.documentNumber,
          issuingAuthority: extractedData.issuingAuthority || '',
          expirationDate: extractedData.expirationDate || ''
        },
        verificationLevel: 'verified',
        expirationDays: idExpirationDays
      });
      
      zkpProofs.document_verification = {
        value: {
          documentType: extractedData.documentType,
          documentNumber: extractedData.documentNumber,
          issuingAuthority: extractedData.issuingAuthority || '',
          expirationDate: extractedData.expirationDate || ''
        },
        zkpProof: documentProof.proof,
        verified: true,
        expirationDate: idExpirationDate || new Date(Date.now() + idExpirationDays * 24 * 60 * 60 * 1000).toISOString()
      };
    }

    return zkpProofs;
  };

  /** Mint proofs from an approved decision and hand the credential to the pN. */
  const completeFromDecision = async (decision: IdentityDecisionResponse) => {
    const extracted = extractedFromDecision(decision);
    const zkpProofs = await generateZKProofs(extracted);
    const now = new Date().toISOString();
    const dataPoints: VerifiedIdentityData['dataPoints'] = {};
    for (const [id, p] of Object.entries(zkpProofs)) {
      dataPoints[id] = {
        dataPointId: id,
        zkpProof: p.zkpProof,
        verified: true,
        verifiedAt: now,
        expiresAt: p.expirationDate,
        verificationLevel: 'verified',
        value: p.value
      };
    }
    await onVerificationComplete({
      id: identityId || 'stripe_identity',
      verificationId: `stripe_identity:${decision.sessionId}`,
      verifiedAt: now,
      verificationLevel: 'verified',
      provider: 'stripe_identity',
      fraudPrevention: {
        livenessCheck: true,
        documentAuthenticity: true,
        biometricMatch: true,
        riskScore: 0,
        fraudIndicators: [],
        confidence: 1,
        timestamp: now
      },
      metadata: {
        documentType: extracted.documentType,
        documentNumber: extracted.documentNumber || 'unknown',
        expirationDate: extracted.expirationDate || undefined,
        verificationProvider: 'stripe_identity',
        providerVerificationId: decision.sessionId || undefined,
        quality: { document: 1, biometric: 1, overall: 1 },
        securityFeatures: []
      },
      dataPoints,
      credential: decision.credential,
      credentialExpiresAt: decision.expiresAt,
      extracted
    } as VerifiedIdentityData & { extracted: typeof extracted });
    clearPending();
    setCurrentStep(2);
  };

  const finalizeFromDecision = async () => {
    if (!accessToken) return;
    const session = readPending(identityId);
    if (!session) {
      setError('No verification session in progress on this device. Start verification first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const decision = await MonetizationService.getIdentityDecision(accessToken, session.state);
      if (decision.status !== 'approved') {
        if (TERMINAL_STATUSES.has(decision.status)) clearPending();
        else if (decision.url) writePending(identityId, { ...session, url: decision.url });
        setError(DECISION_MESSAGES[decision.status] || `Verification status: ${decision.status}`);
        return;
      }
      await completeFromDecision(decision);
    } catch (e) {
      if ((e as { code?: string }).code === 'invalid_state') clearPending();
      setError(e instanceof Error ? e.message : 'Failed to finalize verification proofs');
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    if (!accessToken) {
      return (
        <div className="text-center space-y-6">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto" />
          <p className="text-text-secondary">Unlock your pN to verify your identity.</p>
        </div>
      );
    }
    if (!status) {
      return loading ? (
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      ) : null;
    }

    switch (currentStep) {
      case 0: {
        const price =
          status.renewalPriceCents != null && status.renewalPriceCents > 0
            ? `${(status.renewalPriceCents / 100).toFixed(2)} USD per month`
            : 'a monthly membership';
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <CreditCard className="w-12 h-12 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-text-primary mb-2 flex items-center justify-center gap-2">
                Membership required
                <SectionInfo title="Identity verification">
                  <ul>
                    <li>Verification is included in the membership ({price}).</li>
                    <li>Each pN verifies separately; verification stays active for its validity period even if your membership lapses.</li>
                    <li>Document authenticity, selfie match and liveness are checked by Stripe Identity.</li>
                    <li>ZKPs for name, age, location and document are minted on this device.</li>
                  </ul>
                </SectionInfo>
              </h3>
              <p className="text-text-secondary mb-6">
                Identity verification is included with the par Noir membership ({price}).
              </p>
            </div>
            {status.stripeConfigured ? (
              <button
                type="button"
                onClick={() => void subscribe()}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Opening checkout...' : 'Subscribe'}
              </button>
            ) : (
              <p className="text-sm text-amber-600">Billing is not configured on this deployment.</p>
            )}
          </div>
        );
      }

      case 1:
        if (!status.identityVerificationConfigured) {
          return (
            <div className="text-center space-y-6">
              <div className="mx-auto w-24 h-24 bg-neutral-800 rounded-full flex items-center justify-center">
                <Shield className="w-12 h-12 text-neutral-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-text-primary mb-2">
                  Identity verification coming soon
                </h3>
                <p className="text-text-secondary mb-6">
                  Stripe Identity verification is not enabled on this deployment yet.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-secondary text-text-primary py-3 px-6 rounded-lg hover:bg-border transition-colors"
              >
                Close
              </button>
            </div>
          );
        }
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
              <Shield className="w-12 h-12 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-text-primary mb-2 flex items-center justify-center gap-2">
                {status.verified ? 'Verified' : 'Start Verification'}
                <SectionInfo title="Secure third-party verification">
                  <ul>
                    <li>par Noir never stores your ID documents or your name</li>
                    <li>Stripe runs the ID and selfie check, and the session is redacted at Stripe once you finalize</li>
                    <li>You&apos;ll return here after verification</li>
                    <li>Your signed verification credential and ZKPs live in your pN&apos;s encrypted Knowledge docs</li>
                    <li>Each pN verifies (and pays) separately, even with the same ID</li>
                  </ul>
                </SectionInfo>
              </h3>
              <p className="text-text-secondary mb-6">
                {status.verified
                  ? 'Your pN is verified. Your signed credential is held in your pN.'
                  : pending
                    ? 'You have a verification session in progress. Continue it, or finalize once Stripe has verified it.'
                    : "You'll be redirected to Stripe to scan your ID and take a selfie, then return here to finalize."}
              </p>
            </div>

            {!status.verified && (
              <button
                type="button"
                onClick={() => void redirectToVerification()}
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Starting Verification...' : pending ? 'Continue verification' : 'Start Verification with Stripe'}
              </button>
            )}
            {pending && (
              <>
                <button
                  type="button"
                  disabled={loading || !identityId || !encryptedIdentity}
                  className="w-full border border-border text-text-primary py-3 px-6 rounded-lg hover:bg-hover disabled:opacity-50"
                  onClick={() => void finalizeFromDecision()}
                >
                  Finalize verification
                </button>
                <p className="text-xs text-text-secondary">
                  Finalizing reads your verification result, stores the signed credential in your pN and mints locked
                  name/age/document proofs (ID-verified values win over prior attestations).
                </p>
              </>
            )}
          </div>
        );

      case 2:
        return (
          <div className="text-center space-y-6">
            <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-text-primary mb-2">
                Verification Complete!
              </h3>
              <p className="text-text-secondary mb-6">
                Your identity has been verified and ZKPs have been generated for the verified data points.
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors"
            >
              Continue
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-modal-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-modal-border shadow-2xl">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-text-primary">Identity Verification</h2>
            <button
              onClick={onClose}
              className="text-text-secondary hover:text-text-primary"
              disabled={loading}
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = index < currentStep;
                const isCurrent = index === currentStep;
                
                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      isCompleted 
                        ? 'bg-green-600 border-green-600 text-white' 
                        : isCurrent 
                        ? 'bg-blue-600 border-blue-600 text-white' 
                        : 'bg-gray-100 border-gray-300 text-gray-500'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="mt-2 text-center">
                      <div className={`text-xs font-medium ${
                        isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {step.title}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800 dark:text-red-200">
                  {error}
                </div>
              </div>
            </div>
          )}

          {/* Step Content */}
          <div className="min-h-[400px] flex items-center justify-center">
            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
};
