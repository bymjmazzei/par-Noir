import React, { useState, useEffect , useCallback} from 'react';
import { LicenseModal } from '../components/LicenseModal';
import { LicenseVerification, LicenseInfo } from '../utils/licenseVerification';
import { DataPointProposalModal } from '../components/DataPointProposalModal';
import { ZKPGenerator } from '../types/standardDataPoints';
import {
  DeveloperPortalHeader,
  QuickStartSection,
  DocumentationSection,
  PendingProposalsSection,
  CommunitySection
} from '../components/developer-portal';

export const DeveloperPortal: React.FC = React.memo(() => {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);

  useEffect(() => {
    loadLicenseInfo();
    loadPendingProposals();
  }, []);

  useEffect(() => {
    // Function to update theme
    const updateTheme = () => {
      const isDarkTheme = document.documentElement.className.includes('theme-dark');
      setCurrentTheme(isDarkTheme ? 'dark' : 'light');
    };

    // Initial theme check
    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const loadLicenseInfo = async () => {
    setIsLoading(true);
    try {
      const storedLicense = localStorage.getItem('identity_protocol_license');
      if (storedLicense) {
        const licenseData = JSON.parse(storedLicense);
        setLicenseInfo(licenseData);
      }
    } catch (error) {
      // Error handling for production
    } finally {
      setIsLoading(false);
    }
  };

  const handleLicensePurchased = async (newLicenseKey: string) => {
    setShowLicenseModal(false);
    loadLicenseInfo();
  };

  const loadPendingProposals = async () => {
    try {
      // Get current session info
      const session = JSON.parse(localStorage.getItem('current_session') || '{}');
      if (session.id && session.pnName && session.passcode) {
        const proposals = await ZKPGenerator.getPendingProposals(session.id, session.pnName, session.passcode);
        setPendingProposals(proposals);
      } else {
        setPendingProposals([]);
      }
    } catch (error) {
      setPendingProposals([]);
    }
  };

  const handleProposalSubmitted = (proposalId: string) => {
    loadPendingProposals();
  };

  const copyCode = (button: React.MouseEvent<HTMLButtonElement>) => {
    const codeBlock = button.currentTarget.previousElementSibling as HTMLElement;
    const code = codeBlock.textContent || '';
    
    navigator.clipboard.writeText(code).then(() => {
      const originalText = button.currentTarget.textContent;
      button.currentTarget.textContent = 'Copied!';
      button.currentTarget.style.background = '#3b82f6';
      
      setTimeout(() => {
        button.currentTarget.textContent = originalText;
        button.currentTarget.style.background = '';
      }, 2000);
    });
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <DeveloperPortalHeader
        licenseInfo={licenseInfo}
        onShowLicenseModal={() => setShowLicenseModal(true)}
        onShowProposalModal={() => setShowProposalModal(true)}
      />

      {/* Quick Start Section */}
      <QuickStartSection onCopyCode={copyCode} />

      {/* Documentation Section */}
      <DocumentationSection />

      {/* Pending Proposals Section */}
      <PendingProposalsSection pendingProposals={pendingProposals} />

      {/* Community Section */}
      <CommunitySection />

      {/* License Modal */}
      {showLicenseModal && (
        <LicenseModal
          isOpen={showLicenseModal}
          onClose={() => setShowLicenseModal(false)}
          onLicensePurchased={handleLicensePurchased}
        />
      )}

      {/* Data Point Proposal Modal */}
      {showProposalModal && (
        <DataPointProposalModal
          isOpen={showProposalModal}
          onClose={() => setShowProposalModal(false)}
          onProposalSubmitted={handleProposalSubmitted}
        />
      )}
    </div>
  );
}, []););

DeveloperPortal.displayName = 'DeveloperPortal';
