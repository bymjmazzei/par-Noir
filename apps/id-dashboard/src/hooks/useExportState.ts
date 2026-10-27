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
  const [pendingExportAction, setPendingExportAction] = useState<'download' | 'usb' | 'nfc' | 'device-bound' | null>(null);
  const [exportAuthData, setExportAuthData] = useState({ key1: '', key2: '' });
  const [showExportKey2, setShowExportKey2] = useState(false);
  const [showExportKey1, setShowExportKey1] = useState(false);

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
  const [transferCode, setTransferCode] = useState('');
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
    showExportKey2,
    setShowExportKey2,
    showExportKey1,
    setShowExportKey1,

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
    transferCode,
    setTransferCode,
    transferCreated,
    setTransferCreated
  };
}
