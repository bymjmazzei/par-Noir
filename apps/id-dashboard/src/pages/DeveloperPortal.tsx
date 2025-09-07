import React, { useState, useEffect } from 'react';
import { LicenseModal } from '../components/LicenseModal';
import { LicenseVerification, LicenseInfo } from '../utils/licenseVerification';
import { DataPointProposalModal } from '../components/DataPointProposalModal';
import { ZKPGenerator } from '../types/standardDataPoints';

export const DeveloperPortal: React.FC = () => {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);

  useEffect(() => {
    loadLicenseInfo();
    loadPendingProposals();
  }, []);

  useEffect(() => {
    // Function to update theme
    const updateTheme = () => {
      const isDarkTheme = document.documentElement.className.includes('theme-dark');
      setCurrentTheme(isDarkTheme ? 'dark' : 'light');
    };

    // Initial theme check
    updateTheme();

    // Listen for theme changes
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  const loadLicenseInfo = async () => {
    setIsLoading(true);
    try {
      const storedLicense = localStorage.getItem('identity_protocol_license');
      if (storedLicense) {
        const licenseData = JSON.parse(storedLicense);
        setLicenseInfo(licenseData);
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const handleLicensePurchased = async (newLicenseKey: string) => {
    setShowLicenseModal(false);
    loadLicenseInfo();
  };

  const loadPendingProposals = async () => {
    try {
      // Get current session info
      const session = JSON.parse(localStorage.getItem('current_session') || '{}');
      if (session.id && session.pnName && session.passcode) {
        const proposals = await ZKPGenerator.getPendingProposals(session.id, session.pnName, session.passcode);
        setPendingProposals(proposals);
      } else {
        setPendingProposals([]);
      }
    } catch (error) {
      setPendingProposals([]);
    }
  };

  const handleProposalSubmitted = (proposalId: string) => {
    loadPendingProposals();
  };

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

  const getLicenseStatus = () => {
    if (!licenseInfo) return { status: 'Open Source', color: 'text-gray-400', bgColor: 'bg-gray-800', expiration: null };
    
    switch (licenseInfo.type) {
      case 'perpetual':
        return { status: 'Perpetual License', color: 'text-green-400', bgColor: 'bg-green-900', expiration: null };
      case 'annual':
        const expirationDate = licenseInfo.expiresAt && licenseInfo.expiresAt !== 'Never' 
          ? new Date(licenseInfo.expiresAt).toLocaleDateString()
          : null;
        return { 
          status: 'Annual License', 
          color: 'text-blue-400', 
          bgColor: 'bg-blue-900', 
          expiration: expirationDate 
        };
      default:
        return { status: 'Open Source', color: 'text-gray-400', bgColor: 'bg-gray-800', expiration: null };
    }
  };

  const licenseStatus = getLicenseStatus();
  const backgroundColor = currentTheme === 'dark' ? '#1a1a1a' : '#ffffff';

  return (
    <div className="min-h-screen text-text-primary" style={{ backgroundColor }}>
      {/* License Status Banner */}
      <div className="border-b border-border py-4" style={{ backgroundColor }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4">
              <h1 className="text-2xl font-bold text-text-primary">Developer Portal</h1>
              <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-2">
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${licenseStatus.bgColor} ${licenseStatus.color}`}>
                  {licenseStatus.status}
                </div>
                {licenseStatus.expiration && (
                  <div className="text-sm text-text-secondary">
                    Expires: {licenseStatus.expiration}
                  </div>
                )}
              </div>
            </div>
            {!licenseInfo && (
              <button
                onClick={() => setShowLicenseModal(true)}
                className="px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-auto"
                style={{
                  backgroundColor: '#3b82f6',
                  color: '#ffffff'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                Purchase Commercial License
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <section className="bg-gradient-to-br from-secondary to-bg-primary py-20 rounded-lg mb-12">
          <div className="text-center">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary text-bg-primary mb-6">
              Developer Portal
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-6xl font-bold mb-6 text-text-primary">
              Build the Future of <span className="text-primary">Digital Identity</span>
            </h1>
            <p className="text-lg sm:text-xl text-text-secondary mb-8 max-w-3xl mx-auto px-4">
              Integrate sovereign identity into your applications with our comprehensive SDK, 
              documentation, and developer tools.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
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
        </section>

        {/* Quick Start Section */}
        <section id="quickstart" className="py-20">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-text-primary mb-4">Quick Start</h2>
            <p className="text-lg sm:text-xl text-text-secondary px-4">Get up and running with par Noir in 5 minutes.</p>
          </div>
          <div className="space-y-6">
            <div className="bg-secondary rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
              <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">1</div>
              <div className="flex-1 w-full">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Install the SDK</h3>
                <div className="bg-bg-primary rounded-lg p-4 relative overflow-x-auto">
                  <pre className="text-sm text-text-primary whitespace-nowrap"><code>npm install @identity-protocol/identity-sdk</code></pre>
                  <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
                </div>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
              <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">2</div>
              <div className="flex-1 w-full">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Initialize the Client</h3>
                <div className="bg-bg-primary rounded-lg p-4 relative overflow-x-auto">
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
                  <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
                </div>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
              <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">3</div>
              <div className="flex-1 w-full">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Create an Identity</h3>
                <div className="bg-bg-primary rounded-lg p-4 relative overflow-x-auto">
                  <pre className="text-sm text-text-primary"><code>{`const identity = await sdk.createIdentity({
  name: "User Name",
  email: "user@example.com"
});`}</code></pre>
                  <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
                </div>
              </div>
            </div>
            <div className="bg-secondary rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
              <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">4</div>
              <div className="flex-1 w-full">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Start Building</h3>
                <p className="text-text-secondary mb-4">Your identity is ready! Explore our documentation to add authentication, zero-knowledge proofs, and social recovery to your application.</p>
                <a href="#docs" className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors">
                  View Documentation
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Documentation Section */}
        <section id="docs" className="py-20 bg-secondary rounded-lg">
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
              <a href="https://bymjmazzei.github.io/par-Noir/#authentication" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">View API Docs →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Zero-Knowledge Proofs</h3>
              <p className="text-text-secondary mb-4">Learn how to implement privacy-preserving features with cryptographic proofs.</p>
              <a href="https://bymjmazzei.github.io/par-Noir/#zero-knowledge-proofs" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">ZKP Guide →</a>
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
              <a href="https://bymjmazzei.github.io/par-Noir/#social-recovery" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Recovery Guide →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-red-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Authentication</h3>
              <p className="text-text-secondary mb-4">Add sovereign identity authentication to your web and mobile apps.</p>
              <a href="https://bymjmazzei.github.io/par-Noir/#authentication" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Auth Guide →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-yellow-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">SDK Documentation</h3>
              <p className="text-text-secondary mb-4">Language-specific SDKs for JavaScript, TypeScript, React, and more.</p>
              <a href="https://bymjmazzei.github.io/par-Noir/#javascript-sdk" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">SDK Docs →</a>
            </div>
            <div className="bg-bg-primary rounded-lg p-6">
              <div className="w-12 h-12 bg-indigo-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-text-primary mb-2">Best Practices</h3>
              <p className="text-text-secondary mb-4">Security guidelines, performance tips, and implementation patterns.</p>
              <a href="https://bymjmazzei.github.io/par-Noir/#security-best-practices" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-accent font-medium">Best Practices →</a>
            </div>
          </div>
        </section>

        {/* Data Point Proposals Section */}
        <section id="data-point-proposals" className="py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Standard Data Points</h2>
            <p className="text-xl text-text-secondary">Propose new standard data points for the global library.</p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8 mb-8">
            {/* Propose New Data Point */}
            <div className="bg-secondary rounded-lg p-8">
              <div className="w-16 h-16 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-4">Propose New Data Point</h3>
              <p className="text-text-secondary mb-6">
                Suggest new standard data points that can be used by all developers. 
                Approved proposals become part of the global library.
              </p>
              <button
                onClick={() => setShowProposalModal(true)}
                className="inline-flex items-center px-6 py-3 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors"
              >
                <span>Propose Data Point</span>
                <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7"/>
                </svg>
              </button>
            </div>

            {/* View Pending Proposals */}
            <div className="bg-secondary rounded-lg p-8">
              <div className="w-16 h-16 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-text-primary mb-4">Pending Proposals</h3>
              <p className="text-text-secondary mb-6">
                Review and vote on data point proposals from the community. 
                Help shape the future of standardized data collection.
              </p>
              <div className="text-center">
                <div className="text-3xl font-bold text-text-primary mb-2">{pendingProposals.length}</div>
                <div className="text-text-secondary">Pending Proposals</div>
              </div>
            </div>
          </div>

          {/* Pending Proposals List */}
          {pendingProposals.length > 0 && (
            <div className="bg-secondary rounded-lg p-6">
              <h3 className="text-lg font-semibold text-text-primary mb-4">Recent Proposals</h3>
              <div className="space-y-4">
                {pendingProposals.slice(0, 3).map((proposal) => (
                  <div key={proposal.id} className="bg-bg-primary rounded-lg p-4 border border-border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-text-primary mb-1">{proposal.name}</h4>
                        <p className="text-sm text-text-secondary mb-2">{proposal.description}</p>
                        <div className="flex items-center space-x-4 text-xs text-text-secondary">
                          <span>Proposed by: {proposal.proposedBy}</span>
                          <span>Category: {proposal.category}</span>
                          <span>Votes: {proposal.votes.upvotes - proposal.votes.downvotes}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600">
                          Vote
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {pendingProposals.length > 3 && (
                <div className="text-center mt-4">
                  <button className="text-primary hover:text-accent font-medium">
                    View All {pendingProposals.length} Proposals →
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Community Section */}
        <section id="community" className="py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-text-primary mb-4">Join the Community</h2>
            <p className="text-xl text-text-secondary">Connect with developers building the future of digital identity.</p>
          </div>
          <div className="flex justify-center">
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
          </div>
        </section>
      </div>

      {/* License Modal */}
      {showLicenseModal && (
        <LicenseModal
          isOpen={showLicenseModal}
          onClose={() => setShowLicenseModal(false)}
          onLicensePurchased={handleLicensePurchased}
        />
      )}

      {/* Data Point Proposal Modal */}
      {showProposalModal && (
        <DataPointProposalModal
          isOpen={showProposalModal}
          onClose={() => setShowProposalModal(false)}
          onProposalSubmitted={handleProposalSubmitted}
        />
      )}
    </div>
  );
};
