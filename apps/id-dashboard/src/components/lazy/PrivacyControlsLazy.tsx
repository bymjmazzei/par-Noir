import React, { Suspense } from 'react';
import { lazy } from 'react';

// Lazy load the component
const PrivacyControls = lazy(() => import('../components/PrivacyControls.tsx'));

// Lazy wrapper with loading state
export const PrivacyControlsLazy = (props) => (
  <Suspense fallback={
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span className="ml-2 text-text-secondary">Loading PrivacyControls...</span>
    </div>
  }>
      <PrivacyControls {...props} />
  </Suspense>
);

export default PrivacyControlsLazy;