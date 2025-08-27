import React, { useState, useEffect } from 'react';
import { LicenseModal } from './LicenseModal';
import { LicenseVerification, LicenseInfo, LicenseProof, LicenseReceipt, UsagePattern } from '../utils/licenseVerification';
import DetectionTest from '../utils/detectionTest';
import EnforcementTest from '../utils/enforcementTest';

export const LicenseDashboard: React.FC = () => {
  const [licenseKey, setLicenseKey] = useState<string>('');
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [licenseProof, setLicenseProof] = useState<LicenseProof | null>(null);
  const [receipt, setReceipt] = useState<LicenseReceipt | null>(null);
  const [identityHash, setIdentityHash] = useState<string>('');
  const [usagePattern, setUsagePattern] = useState<UsagePattern | null>(null);
  const [showDetectionModal, setShowDetectionModal] = useState<boolean>(false);

  useEffect(() => {
    loadLicenseInfo();
  }, []);

    const loadLicenseInfo = async () => {
    setIsLoading(true);
    try {
      // Get current identity hash (in production, this would come from the authenticated user)
      const currentIdentityHash = localStorage.getItem('current_identity_hash') || 'demo_identity_hash';
      setIdentityHash(currentIdentityHash);

      // Check if user has any license
      const hasLicense = await LicenseVerification.hasLicense(currentIdentityHash);

      if (hasLicense) {
        // Load existing license
        const licenseData = await LicenseVerification.findLicenseByIdentityHash(currentIdentityHash);
        if (licenseData) {
          setLicenseKey(licenseData.licenseKey);
          setLicenseInfo(licenseData);

          // Generate ZKP proof for verification
          const proof = await LicenseVerification.generateLicenseProof(licenseData, {});
          setLicenseProof(proof);
        }
      } else {
        // Generate free non-commercial license for new user
        const freeLicense = await LicenseVerification.generateFreeLicense(currentIdentityHash, 'Demo Identity');
        setLicenseKey(freeLicense.licenseKey);
        setLicenseInfo(freeLicense);

        // Generate ZKP proof for verification
        const proof = await LicenseVerification.generateLicenseProof(freeLicense, {});
        setLicenseProof(proof);
      }

      // Analyze usage patterns for detection
      const pattern = await LicenseVerification.analyzeUsagePattern(currentIdentityHash);
      setUsagePattern(pattern);

      // Check if commercial usage is detected
      if (pattern.isCommercial && !licenseInfo?.isCommercial) {
        setShowDetectionModal(true);
      }
    } catch (error) {
      console.error('Failed to load license info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLicensePurchased = async (newLicenseKey: string) => {
    setLicenseKey(newLicenseKey);
    setShowLicenseModal(false);
    
    // Generate receipt for the purchase
    const licenseData = await LicenseVerification.findLicenseByIdentityHash(identityHash);
    if (licenseData) {
      const receipt = LicenseVerification.generateReceipt(licenseData, {
        method: 'crypto',
        transactionHash: `TXN_${Date.now()}`
      });
      setReceipt(receipt);
    }
    
    loadLicenseInfo();
  };

  const removeLicense = async () => {
    // Remove commercial license and generate new free license
    if (licenseInfo && licenseInfo.isCommercial) {
      await LicenseVerification.invalidateLicense(licenseInfo.licenseKey);
      
      // Generate new free license
      const freeLicense = await LicenseVerification.generateFreeLicense(identityHash, 'Demo Identity');
      setLicenseKey(freeLicense.licenseKey);
      setLicenseInfo(freeLicense);
      
      // Generate ZKP proof for verification
      const proof = await LicenseVerification.generateLicenseProof(freeLicense, {});
      setLicenseProof(proof);
      
      setReceipt(null);
    }
  };

  const downloadReceipt = () => {
    if (!receipt) return;
    
    const receiptData = JSON.stringify(receipt, null, 2);
    const blob = new Blob([receiptData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-receipt-${receipt.receiptId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadLicenseProof = () => {
    if (!licenseProof) return;
    
    const proofData = JSON.stringify(licenseProof, null, 2);
    const blob = new Blob([proofData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `license-proof-${licenseInfo?.licenseKey}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const verifyLicenseProof = async () => {
    if (!licenseProof) return;
    
    const isValid = await LicenseVerification.verifyLicenseProof(licenseProof);
    alert(isValid ? 'License proof is valid!' : 'License proof verification failed.');
  };

  const getLicenseStatusColor = (status: string, isCommercial: boolean) => {
    if (isCommercial) {
      switch (status) {
        case 'active': return 'text-white bg-gray-800 border-gray-600';
        case 'expired': return 'text-gray-300 bg-gray-900 border-gray-700';
        case 'pending': return 'text-gray-400 bg-gray-800 border-gray-600';
        default: return 'text-gray-400 bg-gray-900 border-gray-700';
      }
    } else {
      // Free license styling
      return 'text-white bg-blue-900 border-blue-600';
    }
  };

  const getLicenseStatusIcon = (status: string, isCommercial: boolean) => {
    if (isCommercial) {
      switch (status) {
        case 'active': return '✓';
        case 'expired': return '⚠';
        case 'pending': return '⏳';
        default: return '?';
      }
    } else {
      return '🆓'; // Free license icon
    }
  };

  const getLicenseTypeDisplay = (type: string) => {
    switch (type) {
      case 'free': return 'Free Non-Commercial';
      case 'perpetual': return 'Perpetual Commercial';
      case 'annual': return 'Annual Commercial';
      default: return type;
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-white">License Management</h2>
        {licenseInfo && !licenseInfo.isCommercial && (
          <button
            onClick={() => setShowLicenseModal(true)}
            className="bg-white text-black px-4 py-2 rounded hover:bg-gray-200"
          >
            Upgrade to Commercial
          </button>
        )}
      </div>
      
      {licenseInfo && (
        <div className={`border border-gray-700 rounded-lg p-4 mb-6 ${getLicenseStatusColor(licenseInfo.status, licenseInfo.isCommercial)}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center text-white">
              <span className="mr-2">{getLicenseStatusIcon(licenseInfo.status, licenseInfo.isCommercial)}</span>
              {licenseInfo.isCommercial ? 'Commercial License Active' : 'Free License Active'}
            </h3>
            {licenseInfo.isCommercial && (
              <button
                onClick={removeLicense}
                className="text-sm text-gray-400 hover:text-gray-300"
              >
                Downgrade to Free
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-sm font-medium text-gray-300">License Key</p>
              <p className="font-mono text-sm bg-gray-800 border border-gray-600 px-2 py-1 rounded mt-1 break-all text-gray-200">
                {licenseKey}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-300">Type</p>
              <p className="capitalize mt-1 text-white">{getLicenseTypeDisplay(licenseInfo.type)}</p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-300">Issued</p>
              <p className="mt-1 text-white">
                {licenseInfo.issuedAt ? new Date(licenseInfo.issuedAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-300">Expires</p>
              <p className="mt-1 text-white">
                {licenseInfo.expiresAt === 'Never' ? 'Never (Perpetual)' : 
                 licenseInfo.expiresAt ? new Date(licenseInfo.expiresAt).toLocaleDateString() : 'Unknown'}
              </p>
            </div>
            
            <div>
              <p className="text-sm font-medium text-gray-300">Bound Identity</p>
              <p className="mt-1 text-white">Demo Identity</p>
            </div>

            {licenseInfo.transferredFrom && (
              <div>
                <p className="text-sm font-medium text-gray-300">Transferred From</p>
                <p className="mt-1 text-white font-mono text-xs">
                  {licenseInfo.transferredFrom.substring(0, 16)}...
                </p>
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded p-3 mb-4">
            <h4 className="font-medium mb-2 text-white">License Features</h4>
            <ul className="text-sm space-y-1">
              {licenseInfo.type === 'free' ? (
                <>
                  <li className="text-gray-300">• Free non-commercial use</li>
                  <li className="text-gray-300">• Research and development</li>
                  <li className="text-gray-300">• Personal projects</li>
                  <li className="text-gray-300">• Community support</li>
                </>
              ) : licenseInfo.type === 'perpetual' ? (
                <>
                  <li className="text-gray-300">• Lifetime commercial use</li>
                  <li className="text-gray-300">• Commercial use rights</li>
                  <li className="text-gray-300">• Full access to protocol features</li>
                  <li className="text-gray-300">• No monthly fees</li>
                </>
              ) : (
                <>
                  <li className="text-gray-300">• Annual commercial use</li>
                  <li className="text-gray-300">• Commercial use rights</li>
                  <li className="text-gray-300">• Full access to protocol features</li>
                  <li className="text-gray-300">• All updates included</li>
                </>
              )}
            </ul>
          </div>

          {/* ZKP Proof and Receipt Section */}
          <div className="bg-gray-800 border border-gray-700 rounded p-3">
            <h4 className="font-medium mb-3 text-white">Verification & Receipts</h4>
            <div className="flex flex-wrap gap-2">
              {licenseProof && (
                <>
                  <button
                    onClick={verifyLicenseProof}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                  >
                    Verify Proof
                  </button>
                  <button
                    onClick={downloadLicenseProof}
                    className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                  >
                    Download Proof
                  </button>
                </>
              )}
              {receipt && (
                <button
                  onClick={downloadReceipt}
                  className="bg-gray-700 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                >
                  Download Receipt
                </button>
              )}
            </div>
            {licenseProof && (
              <p className="text-xs text-gray-400 mt-2">
                ZKP Proof ID: {licenseProof.proof.substring(0, 16)}...
              </p>
            )}
          </div>

          {/* Usage Pattern Detection Section */}
          {usagePattern && (
            <div className="bg-gray-800 border border-gray-700 rounded p-3">
              <h4 className="font-medium mb-3 text-white">Usage Pattern Detection</h4>
              <div className="text-sm text-gray-300 space-y-2">
                <div className="flex justify-between">
                  <span>API Call Frequency (last hour):</span>
                  <span className={usagePattern.apiCallFrequency > 100 ? 'text-red-400' : 'text-green-400'}>
                    {usagePattern.apiCallFrequency} calls
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Enterprise Feature Access:</span>
                  <span className={usagePattern.enterpriseFeatureAccess ? 'text-red-400' : 'text-green-400'}>
                    {usagePattern.enterpriseFeatureAccess ? 'Detected' : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Scale Indicators:</span>
                  <span className={usagePattern.scaleIndicators ? 'text-red-400' : 'text-green-400'}>
                    {usagePattern.scaleIndicators ? 'Detected' : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Commercial Usage Detected:</span>
                  <span className={usagePattern.isCommercial ? 'text-red-400 font-semibold' : 'text-green-400'}>
                    {usagePattern.isCommercial ? 'YES - License Upgrade Required' : 'No'}
                  </span>
                </div>
                {usagePattern.isCommercial && (
                  <div className="flex justify-between">
                    <span>Grace Period Status:</span>
                    <span className={usagePattern.gracePeriodActive ? 'text-yellow-400' : 'text-red-400'}>
                      {usagePattern.gracePeriodActive 
                        ? `Active (${Math.ceil((usagePattern.gracePeriodExpires! - Date.now()) / (24 * 60 * 60 * 1000))} days left)`
                        : 'Expired - Restrictions Active'
                      }
                    </span>
                  </div>
                )}
              </div>
              {usagePattern.isCommercial && !licenseInfo?.isCommercial && (
                <div className="mt-3 p-2 bg-red-900/20 border border-red-700 rounded">
                  <p className="text-red-400 text-xs">
                    {usagePattern.gracePeriodActive 
                      ? `Commercial usage detected. You have ${Math.ceil((usagePattern.gracePeriodExpires! - Date.now()) / (24 * 60 * 60 * 1000))} days remaining in your grace period to upgrade to a commercial license.`
                      : 'Grace period expired. Please upgrade to a commercial license to continue using enterprise features.'
                    }
                  </p>
                </div>
              )}
              
              {/* Test Detection Mechanisms */}
              <div className="mt-3 pt-3 border-t border-gray-700">
                <h5 className="text-sm font-medium text-white mb-2">Test Detection & Enforcement</h5>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      await DetectionTest.runComprehensiveTest(identityHash);
                      await loadLicenseInfo(); // Refresh the display
                    }}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-500"
                  >
                    Test Detection
                  </button>
                  <button
                    onClick={async () => {
                      await EnforcementTest.runComprehensiveEnforcementTest(identityHash);
                      await loadLicenseInfo(); // Refresh the display
                    }}
                    className="bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-500"
                  >
                    Test Enforcement
                  </button>
                  <button
                    onClick={async () => {
                      await DetectionTest.testGracePeriod(identityHash);
                      await loadLicenseInfo(); // Refresh the display
                    }}
                    className="bg-yellow-600 text-white px-3 py-1 rounded text-xs hover:bg-yellow-500"
                  >
                    Test Grace Period
                  </button>
                  <button
                    onClick={async () => {
                      await DetectionTest.simulateGracePeriodExpiration(identityHash);
                      await loadLicenseInfo(); // Refresh the display
                    }}
                    className="bg-red-600 text-white px-3 py-1 rounded text-xs hover:bg-red-500"
                  >
                    Simulate Expiration
                  </button>
                  <button
                    onClick={async () => {
                      DetectionTest.resetDetectionLogs();
                      await loadLicenseInfo(); // Refresh the display
                    }}
                    className="bg-gray-600 text-white px-3 py-1 rounded text-xs hover:bg-gray-500"
                  >
                    Reset All
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold mb-3 text-white">License Information</h3>
        <div className="text-sm text-gray-300 space-y-2">
          <p>
            <strong className="text-white">Free License:</strong> Automatically issued for non-commercial use, 
            includes research, development, and personal projects. No payment required.
          </p>
          <p>
            <strong className="text-white">Perpetual License ($3,999):</strong> One-time purchase for lifetime commercial use, 
            includes commercial use rights and full access to protocol features.
          </p>
          <p>
            <strong className="text-white">Annual License ($1,499/year):</strong> Annual subscription with commercial use rights, 
            full access to protocol features, and all updates included.
          </p>
          <p>
            <strong className="text-white">Crypto Payments:</strong> Accept Bitcoin, Ethereum, Ripple, and Tether for all license purchases.
          </p>
          <p>
            <strong className="text-white">Support:</strong> Email support included with all licenses.
          </p>
          <p>
            <strong className="text-white">Recovery:</strong> Licenses automatically transfer during identity recovery.
          </p>
        </div>
      </div>

      <LicenseModal
        isOpen={showLicenseModal}
        onClose={() => setShowLicenseModal(false)}
        onLicensePurchased={handleLicensePurchased}
      />

      {/* Detection Modal */}
      {showDetectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-semibold mb-4 text-white">Commercial Usage Detected</h3>
            <p className="text-gray-300 mb-4">
              Our system has detected commercial usage patterns in your activity. You have a 3-day grace period to upgrade to a commercial license before restrictions are applied.
            </p>
                          <div className="text-sm text-gray-400 mb-4">
                <p><strong>Detected Patterns:</strong></p>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {usagePattern?.apiCallFrequency && usagePattern.apiCallFrequency > 100 && (
                    <li>High API call frequency ({usagePattern.apiCallFrequency} calls/hour)</li>
                  )}
                  {usagePattern?.enterpriseFeatureAccess && (
                    <li>Enterprise feature access detected</li>
                  )}
                  {usagePattern?.scaleIndicators && (
                    <li>Scale indicators detected (multi-user, integrations, white-label, etc.)</li>
                  )}
                </ul>
                {usagePattern?.gracePeriodActive && (
                  <div className="mt-3 p-2 bg-yellow-900/20 border border-yellow-700 rounded">
                    <p className="text-yellow-400 text-xs">
                      <strong>Grace Period Active:</strong> You have {Math.ceil((usagePattern.gracePeriodExpires! - Date.now()) / (24 * 60 * 60 * 1000))} days remaining to upgrade your license.
                    </p>
                  </div>
                )}
              </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDetectionModal(false)}
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setShowDetectionModal(false);
                  setShowLicenseModal(true);
                }}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500"
              >
                Upgrade License
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
