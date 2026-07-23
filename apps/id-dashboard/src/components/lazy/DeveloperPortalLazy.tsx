import React, { Suspense } from 'react';
import { lazy } from 'react';

// Lazy load the component
const DeveloperPortal = lazy(() =>
  import('../../pages/DeveloperPortal.tsx').then(module => ({
    default: module.DeveloperPortal,
  }))
);

// Lazy wrapper with loading state
export const DeveloperPortalLazy = (props: React.ComponentProps<typeof DeveloperPortal>) => (
  <Suspense fallback={
    <div className="flex items-center justify-center p-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      <span className="ml-2 text-text-secondary">Loading DeveloperPortal...</span>
    </div>
  }>
      <DeveloperPortal {...props} />
  </Suspense>
);

export default DeveloperPortalLazy;