/**
 * License Modal (Reworked)
 * Now handles API key activation instead of license purchase
 * All pNs automatically get an inactive API key
 * Activation requires Veriff verification (AML/KYC)
 */

import React, { useState, useEffect } from 'react';
import { Key, Shield, CheckCircle, X, Copy, ExternalLink, AlertCircle } from 'lucide-react';
import { apiKeyService, ApiKey } from '../services/api/ApiKeyService';
import { IdentityVerificationModal } from './IdentityVerificationModal';
import type { VerifiedIdentityData } from './IdentityVerificationModal';

interface LicenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  authenticatedUser: { id: string } | null;
  onApiKeyActivated?: (apiKey: ApiKey) => void;
}

export const LicenseModal: React.FC<LicenseModalProps> = ({
  isOpen,
  onClose,
  authenticatedUser,
  onApiKeyActivated
}) => {
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVerification, setShowVerification] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && authenticatedUser?.id) {
      loadApiKey();
    }
  }, [isOpen, authenticatedUser?.id]);

  const loadApiKey = async () => {
    if (!authenticatedUser?.id) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const key = await apiKeyService.getOrCreateApiKey(authenticatedUser.id);
      setApiKey(key);
    } catch (err) {
      console.error('Failed to load API key:', err);
      setError(err instanceof Error ? err.message : 'Failed to load API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivate = () => {
    setShowVerification(true);
  };

  const handleVerificationComplete = async (verifiedData: VerifiedIdentityData) => {
    if (!authenticatedUser?.id || !apiKey) return;

    try {
      setIsLoading(true);
      
      // Activate API key with verification
      const activated = await apiKeyService.activateApiKey(
        authenticatedUser.id,
        verifiedData.verificationId,
        {
          verified: true,
          dataPoints: verifiedData.dataPoints
        }
      );

      setApiKey(activated);
      setShowVerification(false);
      onApiKeyActivated?.(activated);
    } catch (err) {
      console.error('Failed to activate API key:', err);
      setError(err instanceof Error ? err.message : 'Failed to activate API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = async () => {
    if (!apiKey?.key) return;

    try {
      const { copyToClipboard } = await import('../utils/helpers');
      const ok = await copyToClipboard(apiKey.key);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy API key:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center space-x-3">
              <Key className="h-6 w-6 text-blue-400" />
              <h2 className="text-xl font-semibold text-white">API Access</h2>
            </div>
          <button
            onClick={onClose}
              className="text-neutral-400 hover:text-white transition-colors"
          >
              <X className="h-5 w-5" />
          </button>
        </div>

          {/* Error Message */}
        {error && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

          {/* Loading State */}
          {isLoading && !apiKey && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
              <p className="text-neutral-400">Loading API key...</p>
          </div>
          )}

          {/* API Key Content */}
          {apiKey && (
            <div className="space-y-6">
              {/* Status Badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {apiKey.isActive ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-400" />
                      <span className="text-green-400 font-medium">Active</span>
                    </>
                  ) : (
                    <>
                      <Shield className="h-5 w-5 text-yellow-400" />
                      <span className="text-yellow-400 font-medium">Inactive</span>
                    </>
                  )}
                </div>
                {apiKey.activatedAt && (
                  <span className="text-xs text-neutral-400">
                    Activated {new Date(apiKey.activatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>

              {/* API Key Display */}
              <div className="bg-neutral-800 rounded-lg p-4">
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Your API Key
                </label>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 bg-neutral-900 px-3 py-2 rounded text-sm text-white font-mono break-all">
                    {apiKey.isActive ? apiKey.key : apiKeyService.getMaskedKey(apiKey)}
                  </code>
                  {apiKey.isActive && (
                    <button
                      onClick={handleCopyKey}
                      className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
                      title="Copy API key"
                    >
                      <Copy className={`h-4 w-4 ${copied ? 'text-green-400' : 'text-neutral-300'}`} />
                    </button>
                  )}
                </div>
                {copied && (
                  <p className="text-xs text-green-400 mt-2">Copied to clipboard!</p>
                )}
        </div>

              {/* Activation Status */}
              {!apiKey.isActive ? (
                <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <Shield className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-blue-300 mb-2">
                        Activate Your API Key
                      </h3>
                      <p className="text-sm text-blue-200 mb-4">
                        To activate your API key and access par Noir APIs, you need to complete identity verification.
                        This ensures compliance with AML/KYC requirements for API access.
                      </p>
          <button
                        onClick={handleActivate}
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
                        {isLoading ? 'Processing...' : 'Start Verification'}
          </button>
        </div>
      </div>
            </div>
              ) : (
                <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-green-300 mb-2">
                        API Key Active
                </h3>
                      <p className="text-sm text-green-200 mb-4">
                        Your API key is active and ready to use. You can now access par Noir APIs for OAuth authentication,
                        data point requests, and content portability.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* API Information */}
              <div className="border-t border-neutral-700 pt-4">
                <h3 className="text-sm font-medium text-white mb-3">Available APIs</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-neutral-800 rounded">
                    <div>
                      <p className="text-sm font-medium text-white">OAuth Authentication</p>
                      <p className="text-xs text-neutral-400">Third-party user authentication</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-neutral-400" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-neutral-800 rounded">
                    <div>
                      <p className="text-sm font-medium text-white">Data Point Requests</p>
                      <p className="text-xs text-neutral-400">Request persistent and transactional data points</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-neutral-400" />
                  </div>
                  <div className="flex items-center justify-between p-3 bg-neutral-800 rounded">
                    <div>
                      <p className="text-sm font-medium text-white">Content Portability</p>
                      <p className="text-xs text-neutral-400">Access user's public index</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-neutral-400" />
                  </div>
                </div>
              </div>

              {/* Rate Limits */}
              {apiKey.isActive && apiKey.rateLimit && (
                <div className="border-t border-neutral-700 pt-4">
                  <h3 className="text-sm font-medium text-white mb-3">Rate Limits</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-neutral-800 rounded p-3">
                      <p className="text-xs text-neutral-400 mb-1">Per Minute</p>
                      <p className="text-lg font-semibold text-white">{apiKey.rateLimit.requestsPerMinute}</p>
                    </div>
                    <div className="bg-neutral-800 rounded p-3">
                      <p className="text-xs text-neutral-400 mb-1">Per Day</p>
                      <p className="text-lg font-semibold text-white">{apiKey.rateLimit.requestsPerDay.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-neutral-700">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
    </div>

      {/* Identity Verification Modal */}
      {showVerification && (
        <IdentityVerificationModal
          isOpen={showVerification}
          onClose={() => setShowVerification(false)}
          onVerificationComplete={handleVerificationComplete}
          identityId={authenticatedUser?.id}
        />
      )}
    </>
  );
};
