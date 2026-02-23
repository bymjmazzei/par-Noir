import { useState } from 'react';

export function useExportState() {
  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportAuthModal, setShowExportAuthModal] = useState(false);
  const [showExportOptionsModal, setShowExportOptionsModal] = useState(false);
  const [showExportToUsbModal, setShowExportToUsbModal] = useState(false);
  const [identityForUsbExport, setIdentityForUsbExport] = useState<{ encryptedData: string; iv: string; salt: string; publicKey?: string } | null>(null);
  const [showExportToNfcModal, setShowExportToNfcModal] = useState(false);
  const [identityForNfcExport, setIdentityForNfcExport] = useState<{ encryptedData: string; iv: string; salt: string; publicKey?: string } | null>(null);
  const [pendingExportAction, setPendingExportAction] = useState<'download' | 'usb' | 'nfc' | null>(null);
  const [exportAuthData, setExportAuthData] = useState({ pnName: '', passcode: '' });
  /** Creds captured at USB modal open - avoids timing/closure issues with exportAuthData */
  const [usbExportCreds, setUsbExportCreds] = useState<{ pnName: string; passcode: string } | null>(null);
  const [nfcExportCreds, setNfcExportCreds] = useState<{ pnName: string; passcode: string } | null>(null);
  const [showExportPasscode, setShowExportPasscode] = useState(false);
  const [showExportPnName, setShowExportPnName] = useState(false);

  // Transfer state
  const [showTransferReceiver, setShowTransferReceiver] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showDmcaPolicy, setShowDmcaPolicy] = useState(false);
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
    showExportToUsbModal,
    setShowExportToUsbModal,
    identityForUsbExport,
    setIdentityForUsbExport,
    showExportToNfcModal,
    setShowExportToNfcModal,
    identityForNfcExport,
    setIdentityForNfcExport,
    pendingExportAction,
    setPendingExportAction,
    exportAuthData,
    setExportAuthData,
    usbExportCreds,
    setUsbExportCreds,
    nfcExportCreds,
    setNfcExportCreds,
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
    showDmcaPolicy,
    setShowDmcaPolicy,
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
