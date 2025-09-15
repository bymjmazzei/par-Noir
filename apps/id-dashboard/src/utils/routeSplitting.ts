
// Route-based code splitting configuration
export const routeConfig = {
  dashboard: () => import('../pages/Dashboard'),
  developerPortal: () => import('../pages/DeveloperPortal'),
  privacyControls: () => import('../components/PrivacyControls'),
  securityPanel: () => import('../components/SecurityPanel'),
  integrationSettings: () => import('../components/IntegrationSettingsManager'),
  licenseModal: () => import('../components/LicenseModal'),
  onboarding: () => import('../components/OnboardingWizard'),
  toolSettings: () => import('../components/ToolSettingsModal'),
  dataPointProposal: () => import('../components/DataPointProposalModal'),
  transferReceiver: () => import('../pages/TransferReceiver')
};

// Preload critical routes
export const preloadCriticalRoutes = () => {
  // Preload dashboard and main components
  routeConfig.dashboard();
  routeConfig.privacyControls();
  routeConfig.securityPanel();
};
