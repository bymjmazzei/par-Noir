import React from 'react';

interface QuickStartSectionProps {
  onCopyCode: (button: React.MouseEvent<HTMLButtonElement>) => void;
}

export const QuickStartSection: React.FC<QuickStartSectionProps> = React.memo(({ onCopyCode }) => {
  return (
    <section className="py-20">
      <div className="text-center mb-16">
        <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Quick Start</h2>
        <p className="text-xl text-text-secondary">Get up and running in minutes with our step-by-step guide.</p>
      </div>
      
      <div className="space-y-8">
        <div className="bg-secondary rounded-lg p-6 flex items-start gap-6">
          <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">1</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Install the SDK</h3>
            <div className="bg-bg-primary rounded-lg p-4 relative">
              <pre className="text-sm text-text-primary"><code>npm install @identity-protocol/identity-sdk</code></pre>
              <button onClick={onCopyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary rounded-lg p-6 flex items-start gap-6">
          <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">2</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Initialize the Client</h3>
            <div className="bg-bg-primary rounded-lg p-4 relative">
              <pre className="text-sm text-text-primary"><code>{`import { createIdentitySDK } from '@identity-protocol/identity-sdk';

const sdk = createIdentitySDK({
  identityProvider: {
    name: 'Identity Protocol',
    type: 'decentralized',
    config: {
      clientId: 'your-client-id',
      redirectUri: 'your-redirect-uri'
    }
  }
});`}</code></pre>
              <button onClick={onCopyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary rounded-lg p-6 flex items-start gap-6">
          <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">3</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Create an Identity</h3>
            <div className="bg-bg-primary rounded-lg p-4 relative">
              <pre className="text-sm text-text-primary"><code>{`const identity = await sdk.createIdentity({
  name: "User Name",
  email: "user@example.com"
});`}</code></pre>
              <button onClick={onCopyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
            </div>
          </div>
        </div>
        
        <div className="bg-secondary rounded-lg p-6 flex items-start gap-6">
          <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">4</div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Start Building</h3>
            <p className="text-text-secondary mb-4">Your identity is ready! Explore our documentation to add authentication, zero-knowledge proofs, and social recovery to your application.</p>
            <a href="#docs" className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors">
              View Documentation
            </a>
          </div>
        </div>
      </div>
    </section>
  );
});

QuickStartSection.displayName = 'QuickStartSection';
