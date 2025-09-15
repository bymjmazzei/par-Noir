import React, { Suspense } from 'react';
import { lazy } from 'react';

// Lazy load the component
const OnboardingWizard = lazy(() => import('../components/OnboardingWizard.tsx'));

// Lazy wrapper with loading state
export const OnboardingWizardLazy = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span className="ml-2 text-text-secondary">Loading OnboardingWizard...</span>
    </div>
  }>
      <OnboardingWizard {...props} />
  </Suspense>
);

export default OnboardingWizardLazy;