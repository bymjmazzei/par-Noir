import { useState } from 'react';
import { GlobalPrivacySettings } from '../types/privacy';

export function usePrivacyState() {
  // Enhanced Privacy Settings
  const [showEnhancedPrivacyPanel, setShowEnhancedPrivacyPanel] = useState(false);
  const [privacySettings, setPrivacySettings] = useState<GlobalPrivacySettings>({
    allowAnalytics: false,
    allowMarketing: false,
    allowThirdPartySharing: false,
    dataPoints: {},
    toolPermissions: {}
  });

  // Session Manager
  const [showSessionManager, setShowSessionManager] = useState(false);

  // Tool Settings Modal
  const [showToolSettingsModal, setShowToolSettingsModal] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string>('');

  // Integration Settings Manager
  const [showIntegrationSettings, setShowIntegrationSettings] = useState(false);

  const [showDataPointProposalModal, setShowDataPointProposalModal] = useState(false);

  return {
    // Privacy settings
    showEnhancedPrivacyPanel,
    setShowEnhancedPrivacyPanel,
    privacySettings,
    setPrivacySettings,

    // Session management
    showSessionManager,
    setShowSessionManager,

    // Tool settings
    showToolSettingsModal,
    setShowToolSettingsModal,
    selectedToolId,
    setSelectedToolId,

    // Integration settings
    showIntegrationSettings,
    setShowIntegrationSettings,

    showDataPointProposalModal,
    setShowDataPointProposalModal
  };
}
