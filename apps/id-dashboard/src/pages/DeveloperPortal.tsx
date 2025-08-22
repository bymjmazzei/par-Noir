import React from 'react';

export const DeveloperPortal: React.FC = () => {
  const copyCode = (button: React.MouseEvent<HTMLButtonElement>) => {
    const codeBlock = button.currentTarget.previousElementSibling as HTMLElement;
    const code = codeBlock.textContent || '';
    
    navigator.clipboard.writeText(code).then(() => {
      const originalText = button.currentTarget.textContent;
      button.currentTarget.textContent = 'Copied!';
      button.currentTarget.style.background = '#3b82f6';
      
      setTimeout(() => {
        button.currentTarget.textContent = originalText;
        button.currentTarget.style.background = '';
      }, 2000);
    });
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-secondary to-bg-primary py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary text-bg-primary mb-6">
                Developer Portal
              </div>
              <h1 className="text-4xl lg:text-6xl font-bold mb-6 text-text-primary">
                Build the Future of <span className="text-primary">Digital Identity</span>
              </h1>
              <p className="text-xl text-text-secondary mb-8">
                Integrate sovereign identity into your applications with our comprehensive SDK, 
                documentation, and developer tools.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <a href="#quickstart" className="inline-flex items-center px-6 py-3 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors">
                  <span>Get Started</span>
                  <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7"/>
                  </svg>
                </a>
                <a href="https://github.com/identity-protocol" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-6 py-3 bg-secondary hover:bg-hover text-text-primary rounded-lg font-medium transition-colors">
                  <span>View on GitHub</span>
                  <svg className="ml-2 w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                  </svg>
                </a>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-6">
              <div className="flex items-center mb-4">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <span className="ml-4 text-sm text-text-secondary">quickstart.js</span>
              </div>
              <pre className="text-sm text-text-secondary overflow-x-auto">
                <code>{`// Import the Identity SDK
import { createIdentitySDK } from '@identity-protocol/identity-sdk';

// Initialize the SDK
const sdk = createIdentitySDK({
  identityProvider: {
    name: 'Identity Protocol',
    type: 'oauth2',
    config: {
      clientId: 'your-client-id',
      redirectUri: 'your-redirect-uri'
    }
  }
});

// Create your sovereign identity
const identity = await sdk.createIdentity({
  name: "John Doe",
  email: "john@example.com"
});`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section id="quickstart" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Quick Start</h2>
            <p className="text-xl text-text-secondary">Get up and running with par Noir in 5 minutes.</p>
          </div>
          <div className="space-y-6">
            <div className="bg-secondary rounded-lg p-6 flex items-start gap-6">
              <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">1</div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Install the SDK</h3>
                <div className="bg-bg-primary rounded-lg p-4 relative">
                  <pre className="text-sm text-text-primary"><code>npm install @identity-protocol/identity-sdk</code></pre>
                  <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
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
    type: 'oauth2',
    config: {
      clientId: 'your-client-id',
      redirectUri: 'your-redirect-uri'
    }
  }
});`}</code></pre>
                  <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
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
});

console.log("Identity created:", identity.id);`}</code></pre>
                  <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
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
        </div>
      </section>

      {/* Documentation Section */}
      <section id="docs" className="py-20 bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Documentation</h2>
            <p className="text-xl text-text-secondary">Everything you need to build with par Noir.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-primary bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">API Reference</h3>
              <p className="text-text-secondary mb-4">Complete API documentation with examples for every endpoint and method.</p>
              <a href="https://github.com/bymjmazzei/par-Noir/blob/main/docs/api/API_REFERENCE.md" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">View API Docs →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Zero-Knowledge Proofs</h3>
              <p className="text-text-secondary mb-4">Learn how to implement privacy-preserving features with cryptographic proofs.</p>
              <a href="https://github.com/bymjmazzei/par-Noir/blob/main/docs/zk-integration.md" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">ZKP Guide →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-purple-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                  <path d="M16 3.13a4 4 0 010 7.75"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Social Recovery</h3>
              <p className="text-text-secondary mb-4">Implement secure identity recovery through trusted networks.</p>
              <a href="https://github.com/bymjmazzei/par-Noir/blob/main/docs/implementation-guide.md#social-recovery" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Recovery Guide →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-red-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Authentication</h3>
              <p className="text-text-secondary mb-4">Add sovereign identity authentication to your web and mobile apps.</p>
              <a href="https://github.com/bymjmazzei/par-Noir/blob/main/tutorials/privacy-auth.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Auth Guide →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-yellow-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">SDK Documentation</h3>
              <p className="text-text-secondary mb-4">Language-specific SDKs for JavaScript, TypeScript, React, and more.</p>
              <a href="https://github.com/bymjmazzei/par-Noir/tree/main/sdk/identity-sdk" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">SDK Docs →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-indigo-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Best Practices</h3>
              <p className="text-text-secondary mb-4">Security guidelines, performance tips, and implementation patterns.</p>
              <a href="https://github.com/bymjmazzei/par-Noir/blob/main/docs/security-hardening.md" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Best Practices →</a>
            </div>
          </div>
        </div>
      </section>

      {/* Examples Section */}
      <section id="examples" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Examples & Tutorials</h2>
            <p className="text-xl text-text-secondary">Real-world implementations to get you started.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-secondary rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-primary bg-opacity-20 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block bg-primary bg-opacity-20 text-primary text-xs px-2 py-1 rounded-full font-medium">Web App</span>
                    <span className="text-xs text-text-secondary ml-2">15 min</span>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Privacy-Preserving Authentication</h3>
                <p className="text-text-secondary mb-4">Implement sovereign identity authentication without storing personal data.</p>
                <div className="flex space-x-2">
                  <a href="https://github.com/bymjmazzei/par-Noir/blob/main/tutorials/age-verification.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-2 bg-primary hover:bg-hover text-bg-primary text-sm rounded-lg font-medium transition-colors">View Tutorial</a>
                  <a href="https://github.com/bymjmazzei/par-Noir/tree/main/core/identity-core/examples" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-2 bg-secondary hover:bg-hover text-text-primary text-sm rounded-lg font-medium transition-colors">View Code</a>
                </div>
              </div>
            </div>
            <div className="bg-secondary rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block bg-green-500 bg-opacity-20 text-green-500 text-xs px-2 py-1 rounded-full font-medium">Social</span>
                    <span className="text-xs text-text-secondary ml-2">20 min</span>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Cross-Platform Identity</h3>
                <p className="text-text-secondary mb-4">Use the same sovereign identity across web, mobile, and desktop applications.</p>
                <div className="flex space-x-2">
                  <a href="https://github.com/bymjmazzei/par-Noir/blob/main/tutorials/mobile-integration.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-2 bg-primary hover:bg-hover text-bg-primary text-sm rounded-lg font-medium transition-colors">View Tutorial</a>
                  <a href="https://github.com/bymjmazzei/par-Noir/tree/main/sdk/identity-sdk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-2 bg-secondary hover:bg-hover text-text-primary text-sm rounded-lg font-medium transition-colors">View Code</a>
                </div>
              </div>
            </div>
            <div className="bg-secondary rounded-lg shadow-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center mb-4">
                  <div className="w-10 h-10 bg-purple-500 bg-opacity-20 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                    </svg>
                  </div>
                  <div>
                    <span className="inline-block bg-purple-500 bg-opacity-20 text-purple-500 text-xs px-2 py-1 rounded-full font-medium">Mobile</span>
                    <span className="text-xs text-text-secondary ml-2">25 min</span>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">Mobile App Integration</h3>
                <p className="text-text-secondary mb-4">Add par Noir to React Native and Flutter applications for cross-device identity.</p>
                <div className="flex space-x-2">
                  <a href="https://github.com/bymjmazzei/par-Noir/blob/main/tutorials/mobile-integration.html" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-2 bg-primary hover:bg-hover text-bg-primary text-sm rounded-lg font-medium transition-colors">View Tutorial</a>
                  <a href="https://github.com/bymjmazzei/par-Noir/tree/main/sdk/identity-sdk" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-3 py-2 bg-secondary hover:bg-hover text-text-primary text-sm rounded-lg font-medium transition-colors">View Code</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section id="community" className="py-20 bg-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Join the Community</h2>
            <p className="text-xl text-text-secondary">Connect with developers building the future of digital identity.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-500 bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Discord</h3>
              <p className="text-text-secondary mb-4">Join our developer community for real-time support, discussions, and collaboration.</p>
              <a href="https://discord.gg/parnoir" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors">Join Discord</a>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-text-secondary" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">GitHub</h3>
              <p className="text-text-secondary mb-4">Contribute to the protocol, report issues, and explore the source code.</p>
              <a href="https://github.com/bymjmazzei/par-Noir" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors">View on GitHub</a>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500 bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Twitter</h3>
              <p className="text-text-secondary mb-4">Stay updated with the latest news, updates, and community highlights.</p>
              <a href="https://twitter.com/parnoir" target="_blank" rel="noopener noreferrer" className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors">Follow on Twitter</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
