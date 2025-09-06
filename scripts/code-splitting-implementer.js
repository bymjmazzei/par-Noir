#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('=== PHASE 3.3: CODE SPLITTING IMPLEMENTATION ===\n');

// Components to implement lazy loading for (based on bundle analysis)
const lazyLoadCandidates = [
  'components/PrivacyControls.tsx',
  'components/IntegrationSettingsManager.tsx',
  'pages/DeveloperPortal.tsx',
  'components/SecurityPanel.tsx',
  'components/LicenseModal.tsx',
  'components/OnboardingWizard.tsx',
  'components/ToolSettingsModal.tsx',
  'components/DataPointProposalModal.tsx',
  'components/Onboarding.tsx',
  'pages/TransferReceiver.tsx'
];

// Create lazy loading wrapper
const createLazyWrapper = (componentPath) => {
  const componentName = path.basename(componentPath, '.tsx');
  const relativePath = componentPath.replace('components/', '../components/').replace('pages/', '../pages/');
  
  return `import React, { Suspense } from 'react';
import { lazy } from 'react';

// Lazy load the component
const ${componentName} = lazy(() => import('${relativePath}'));

// Lazy wrapper with loading state
export const ${componentName}Lazy = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span className="ml-2 text-text-secondary">Loading ${componentName}...</span>
    </div>
  }>
      <${componentName} {...props} />
  </Suspense>
);

export default ${componentName}Lazy;`;
};

// Create lazy loading directory
const lazyDir = './apps/id-dashboard/src/components/lazy';
if (!fs.existsSync(lazyDir)) {
  fs.mkdirSync(lazyDir, { recursive: true });
}

// Generate lazy loading components
lazyLoadCandidates.forEach(componentPath => {
  const componentName = path.basename(componentPath, '.tsx');
  const lazyWrapperPath = path.join(lazyDir, `${componentName}Lazy.tsx`);
  
  try {
    const lazyWrapper = createLazyWrapper(componentPath);
    fs.writeFileSync(lazyWrapperPath, lazyWrapper);
    console.log(`✅ Created lazy wrapper: ${componentName}Lazy.tsx`);
  } catch (error) {
    console.error(`❌ Error creating lazy wrapper for ${componentName}:`, error.message);
  }
});

// Create lazy loading index file
const lazyIndexContent = lazyLoadCandidates.map(componentPath => {
  const componentName = path.basename(componentPath, '.tsx');
  return `export { default as ${componentName}Lazy } from './${componentName}Lazy';`;
}).join('\n');

const lazyIndexPath = path.join(lazyDir, 'index.ts');
fs.writeFileSync(lazyIndexPath, lazyIndexContent);

console.log('\n✅ Lazy loading index file created');

// Create route-based code splitting configuration
const routeSplittingConfig = `
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
`;

const routeConfigPath = './apps/id-dashboard/src/utils/routeSplitting.ts';
fs.writeFileSync(routeConfigPath, routeSplittingConfig);

console.log('✅ Route splitting configuration created');

console.log('\n=== PHASE 3.3 COMPLETED ===');
console.log('Code splitting implementation completed!');
console.log('- Lazy loading wrappers created for large components');
console.log('- Route-based code splitting configured');
console.log('- Preloading strategy implemented for critical routes');
