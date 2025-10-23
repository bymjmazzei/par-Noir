import { useState } from 'react';

export function useExportState() {
  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportAuthModal, setShowExportAuthModal] = useState(false);
  const [showExportOptionsModal, setShowExportOptionsModal] = useState(false);
  const [exportAuthData, setExportAuthData] = useState({ pnName: '', passcode: '' });
  const [showExportPasscode, setShowExportPasscode] = useState(false);
  const [showExportPnName, setShowExportPnName] = useState(false);

  // Transfer state
  const [showTransferReceiver, setShowTransferReceiver] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTransferSetupModal, setShowTransferSetupModal] = useState(false);
  const [transferUrl, setTransferUrl] = useState('');
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [activeDelegations, setActiveDelegations] = useState([]);
  const [transferId, setTransferId] = useState('');
  const [transferPasscode, setTransferPasscode] = useState('');
  const [transferCreated, setTransferCreated] = useState(false);

  return {
    // Export modals
    showExportModal,
    setShowExportModal,
    showExportAuthModal,
    setShowExportAuthModal,
    showExportOptionsModal,
    setShowExportOptionsModal,
    exportAuthData,
    setExportAuthData,
    showExportPasscode,
    setShowExportPasscode,
    showExportPnName,
    setShowExportPnName,

    // Transfer state
    showTransferReceiver,
    setShowTransferReceiver,
    showTermsOfService,
    setShowTermsOfService,
    showPrivacyPolicy,
    setShowPrivacyPolicy,
    showTransferSetupModal,
    setShowTransferSetupModal,
    transferUrl,
    setTransferUrl,
    showDelegationModal,
    setShowDelegationModal,
    activeDelegations,
    setActiveDelegations,
    transferId,
    setTransferId,
    transferPasscode,
    setTransferPasscode,
    transferCreated,
    setTransferCreated
  };
}
