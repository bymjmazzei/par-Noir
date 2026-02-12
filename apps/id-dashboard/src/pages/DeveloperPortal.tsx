import React, { useState, useEffect } from 'react';
import { LicenseModal } from '../components/LicenseModal';
import { FeedCreator } from '../components/feeds/FeedCreator';
import { CreateFeedPostModal } from '../components/feeds/CreateFeedPostModal';
import { DataPointProposalModal } from '../components/DataPointProposalModal';
import { FeedService, Feed } from '../services/feeds/FeedService';
import { apiKeyService, ApiKey } from '../services/api/ApiKeyService';
import { ZKPGenerator } from '../types/standardDataPoints';
import { 
  Rss, Key, BookOpen, Plus, Edit, Trash2, Users, Settings, 
  CheckCircle, Shield, Copy, ExternalLink, Loader, AlertCircle, UserPlus
} from 'lucide-react';
import { FeedDelegationModal } from '../components/feeds/FeedDelegationModal';
import { ContentNoticesSection } from '../components/ContentNoticesSection';

interface DeveloperPortalProps {
  authenticatedUser: { id: string; publicKey?: string; nickname?: string; accessToken?: string } | null;
}

export const DeveloperPortal: React.FC<DeveloperPortalProps> = ({ authenticatedUser }) => {
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [showFeedCreator, setShowFeedCreator] = useState(false);
  const [creatingPostForFeed, setCreatingPostForFeed] = useState<Feed | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<'dark' | 'light'>('dark');
  const [pendingProposals, setPendingProposals] = useState<any[]>([]);
  
  // Feed Services state
  const [ownedFeeds, setOwnedFeeds] = useState<Feed[]>([]);
  const [delegatedFeeds, setDelegatedFeeds] = useState<Feed[]>([]);
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);
  const [delegatingFeed, setDelegatingFeed] = useState<Feed | null>(null);
  
  // API Access state
  const [apiKey, setApiKey] = useState<ApiKey | null>(null);
  const [isLoadingApiKey, setIsLoadingApiKey] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadPendingProposals();
    if (authenticatedUser?.id) {
      loadApiKey();
      loadFeeds();
    }
  }, [authenticatedUser?.id]);

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

  const loadApiKey = async () => {
    if (!authenticatedUser?.id) return;
    
    setIsLoadingApiKey(true);
    try {
      const key = await apiKeyService.getOrCreateApiKey(authenticatedUser.id);
      setApiKey(key);
    } catch (err) {
      console.error('Failed to load API key:', err);
    } finally {
      setIsLoadingApiKey(false);
    }
  };

  const loadFeeds = async () => {
    if (!authenticatedUser?.id) return;
    
    setIsLoadingFeeds(true);
    try {
      // Load owned feeds
      const ownedResult = await FeedService.listFeeds({ 
        creatorId: authenticatedUser.id,
        limit: 100 
      });
      setOwnedFeeds(ownedResult.feeds);
      
      // Load delegated feeds
      try {
        const delegatedResult = await FeedService.getDelegatedFeeds(authenticatedUser.id);
        setDelegatedFeeds(delegatedResult);
      } catch (err) {
        console.error('Failed to load delegated feeds:', err);
        setDelegatedFeeds([]);
      }
    } catch (err) {
      console.error('Failed to load feeds:', err);
    } finally {
      setIsLoadingFeeds(false);
    }
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

  const handleFeedCreated = async (feed: Feed) => {
    setShowFeedCreator(false);
    await loadFeeds(); // Reload feeds list
  };

  const handleApiKeyActivated = (activatedKey: ApiKey) => {
    setApiKey(activatedKey);
    setShowLicenseModal(false);
  };

  const handleCopyKey = async () => {
    if (!apiKey?.key) return;

    try {
      await navigator.clipboard.writeText(apiKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy API key:', err);
    }
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

  const backgroundColor = currentTheme === 'dark' ? '#1a1a1a' : '#ffffff';

  return (
    <div className="min-h-screen text-text-primary" style={{ backgroundColor }}>
      {/* Header */}
      <div className="border-b border-border py-4" style={{ backgroundColor }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-text-primary">Services</h1>
          <p className="text-sm text-text-secondary mt-1">Manage feeds, API access, and developer resources</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {authenticatedUser && (
          <ContentNoticesSection accessToken={(authenticatedUser as { accessToken?: string }).accessToken} />
        )}
        {/* Feed Services Section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Rss className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold text-text-primary">Feed Services</h2>
            </div>
            {authenticatedUser && (
              <button
                onClick={() => setShowFeedCreator(true)}
                className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Feed
              </button>
            )}
          </div>

          {!authenticatedUser ? (
            <div className="bg-secondary rounded-lg p-8 text-center">
              <AlertCircle className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary">Please sign in to manage feeds</p>
            </div>
          ) : isLoadingFeeds ? (
            <div className="bg-secondary rounded-lg p-8 text-center">
              <Loader className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-text-secondary">Loading feeds...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Owned Feeds */}
              {ownedFeeds.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">My Feeds</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {ownedFeeds.map((feed) => (
                      <div key={feed.feedId} className="bg-secondary rounded-lg p-6 border border-border">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h4 className="font-semibold text-text-primary mb-1">{feed.feedName}</h4>
                            {feed.feedDescription && (
                              <p className="text-sm text-text-secondary mb-2">{feed.feedDescription}</p>
                            )}
                            <div className="flex items-center space-x-4 text-xs text-text-secondary">
                              {feed.subscriberCount !== undefined && (
                                <span className="flex items-center">
                                  <Users className="h-3 w-3 mr-1" />
                                  {feed.subscriberCount} subscribers
                                </span>
                              )}
                              {feed.postCount !== undefined && (
                                <span>{feed.postCount} posts</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setCreatingPostForFeed(feed)}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                            title="Create post"
                          >
                            <Plus className="h-4 w-4 inline mr-1" />
                            Post
                          </button>
                          <button className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDelegatingFeed(feed)}
                            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
                            title="Delegate access"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                          <button className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors">
                            <Settings className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Delegated Feeds */}
              {delegatedFeeds.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-text-primary mb-4">Delegated Feeds</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {delegatedFeeds.map((feed) => (
                      <div key={feed.feedId} className="bg-secondary rounded-lg p-6 border border-border">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h4 className="font-semibold text-text-primary mb-1">{feed.feedName}</h4>
                            {feed.feedDescription && (
                              <p className="text-sm text-text-secondary mb-2">{feed.feedDescription}</p>
                            )}
                            <span className="text-xs text-blue-400">Delegated Access</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {ownedFeeds.length === 0 && delegatedFeeds.length === 0 && (
                <div className="bg-secondary rounded-lg p-12 text-center">
                  <Rss className="h-16 w-16 text-text-secondary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">No feeds yet</h3>
                  <p className="text-text-secondary mb-6">Create your first feed to start curating content</p>
                  <button
                    onClick={() => setShowFeedCreator(true)}
                    className="inline-flex items-center px-6 py-3 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Feed
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* API Access Section */}
        <section className="mb-12">
          <div className="flex items-center space-x-3 mb-6">
            <Key className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-text-primary">API Access</h2>
          </div>

          {!authenticatedUser ? (
            <div className="bg-secondary rounded-lg p-8 text-center">
              <AlertCircle className="h-12 w-12 text-text-secondary mx-auto mb-4" />
              <p className="text-text-secondary">Please sign in to manage API access</p>
            </div>
          ) : isLoadingApiKey ? (
            <div className="bg-secondary rounded-lg p-8 text-center">
              <Loader className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
              <p className="text-text-secondary">Loading API key...</p>
            </div>
          ) : (
            <div className="bg-secondary rounded-lg p-6">
              {apiKey && (
                <div className="space-y-4">
                  {/* API Key Status */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {apiKey.isActive ? (
                        <>
                          <CheckCircle className="h-5 w-5 text-green-400" />
                          <span className="text-green-400 font-medium">Active</span>
                        </>
                      ) : (
                        <>
                          <Shield className="h-5 w-5 text-yellow-400" />
                          <span className="text-yellow-400 font-medium">Inactive</span>
                        </>
                      )}
                    </div>
                    {apiKey.activatedAt && (
                      <span className="text-xs text-text-secondary">
                        Activated {new Date(apiKey.activatedAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* API Key Display */}
                  <div className="bg-neutral-800 rounded-lg p-4">
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      Your API Key
                    </label>
                    <div className="flex items-center space-x-2">
                      <code className="flex-1 bg-neutral-900 px-3 py-2 rounded text-sm text-white font-mono break-all">
                        {apiKey.isActive ? apiKey.key : apiKeyService.getMaskedKey(apiKey)}
                      </code>
                      {apiKey.isActive && (
                        <button
                          onClick={handleCopyKey}
                          className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded transition-colors"
                          title="Copy API key"
                        >
                          <Copy className={`h-4 w-4 ${copied ? 'text-green-400' : 'text-neutral-300'}`} />
                        </button>
                      )}
                    </div>
                    {copied && (
                      <p className="text-xs text-green-400 mt-2">Copied to clipboard!</p>
                    )}
                  </div>

                  {/* Activation Status */}
                  {!apiKey.isActive ? (
                    <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Shield className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-blue-300 mb-2">
                            Activate Your API Key
                          </h3>
                          <p className="text-sm text-blue-200 mb-4">
                            To activate your API key and access par Noir APIs, you need to complete identity verification.
                            This ensures compliance with AML/KYC requirements for API access.
                          </p>
                          <button
                            onClick={() => setShowLicenseModal(true)}
                            disabled={isLoadingApiKey}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                          >
                            Activate API Key
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="text-sm font-medium text-green-300 mb-2">
                            API Key Active
                          </h3>
                          <p className="text-sm text-green-200 mb-4">
                            Your API key is active and ready to use. Use it to authenticate API requests.
                          </p>
                          <div className="flex items-center space-x-4">
                            <a
                              href="https://bymjmazzei.github.io/par-Noir/#authentication"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center text-sm text-green-300 hover:text-green-200"
                            >
                              View API Documentation
                              <ExternalLink className="h-4 w-4 ml-1" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Developer Resources Section */}
        <section>
          <div className="flex items-center space-x-3 mb-6">
            <BookOpen className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-bold text-text-primary">Developer Resources</h2>
          </div>

          {/* Quick Start Section */}
          <div className="mb-12">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Quick Start</h3>
              <p className="text-text-secondary">Get up and running with par Noir in 5 minutes.</p>
            </div>
            <div className="space-y-4">
              <div className="bg-secondary rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">1</div>
                <div className="flex-1 w-full">
                  <h4 className="text-lg font-semibold text-text-primary mb-4">Install the SDK</h4>
                  <div className="bg-bg-primary rounded-lg p-4 relative overflow-x-auto">
                    <pre className="text-sm text-text-primary whitespace-nowrap"><code>npm install @identity-protocol/identity-sdk</code></pre>
                    <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
                  </div>
                </div>
              </div>
              <div className="bg-secondary rounded-lg p-4 sm:p-6 flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
                <div className="w-12 h-12 bg-primary text-bg-primary rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0">2</div>
                <div className="flex-1 w-full">
                  <h4 className="text-lg font-semibold text-text-primary mb-4">Initialize the Client</h4>
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
                  <h4 className="text-lg font-semibold text-text-primary mb-4">Create an Identity</h4>
                  <div className="bg-bg-primary rounded-lg p-4 relative overflow-x-auto">
                    <pre className="text-sm text-text-primary"><code>{`const identity = await sdk.createIdentity({
  name: "User Name",
  email: "user@example.com"
});`}</code></pre>
                    <button onClick={copyCode} className="absolute top-2 right-2 text-primary hover:text-accent text-sm">Copy</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Documentation Section */}
          <div className="bg-secondary rounded-lg p-8 mb-8">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Documentation</h3>
              <p className="text-text-secondary">Everything you need to build with par Noir.</p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              <a href="https://bymjmazzei.github.io/par-Noir/#authentication" target="_blank" rel="noopener noreferrer" className="bg-bg-primary rounded-lg p-6 hover:bg-hover transition-colors">
                <div className="w-12 h-12 bg-primary bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-2">API Reference</h4>
                <p className="text-text-secondary mb-4 text-sm">Complete API documentation with examples.</p>
                <span className="text-primary hover:text-accent font-medium text-sm">View API Docs →</span>
              </a>
              <a href="https://bymjmazzei.github.io/par-Noir/#zero-knowledge-proofs" target="_blank" rel="noopener noreferrer" className="bg-bg-primary rounded-lg p-6 hover:bg-hover transition-colors">
                <div className="w-12 h-12 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-2">Zero-Knowledge Proofs</h4>
                <p className="text-text-secondary mb-4 text-sm">Learn how to implement privacy-preserving features.</p>
                <span className="text-primary hover:text-accent font-medium text-sm">ZKP Guide →</span>
              </a>
              <a href="https://bymjmazzei.github.io/par-Noir/#social-recovery" target="_blank" rel="noopener noreferrer" className="bg-bg-primary rounded-lg p-6 hover:bg-hover transition-colors">
                <div className="w-12 h-12 bg-purple-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                    <path d="M16 3.13a4 4 0 010 7.75"/>
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-2">Social Recovery</h4>
                <p className="text-text-secondary mb-4 text-sm">Implement secure identity recovery.</p>
                <span className="text-primary hover:text-accent font-medium text-sm">Recovery Guide →</span>
              </a>
            </div>
          </div>

          {/* Data Point Proposals Section */}
          <div className="bg-secondary rounded-lg p-8">
            <div className="text-center mb-8">
              <h3 className="text-xl font-semibold text-text-primary mb-2">Standard Data Points</h3>
              <p className="text-text-secondary">Propose new standard data points for the global library.</p>
            </div>
            
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-bg-primary rounded-lg p-6">
                <div className="w-16 h-16 bg-green-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-3">Propose New Data Point</h4>
                <p className="text-text-secondary mb-4 text-sm">
                  Suggest new standard data points that can be used by all developers.
                </p>
                <button
                  onClick={() => setShowProposalModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors text-sm"
                >
                  <span>Propose Data Point</span>
                  <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7"/>
                  </svg>
                </button>
              </div>

              <div className="bg-bg-primary rounded-lg p-6">
                <div className="w-16 h-16 bg-blue-500 bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                  </svg>
                </div>
                <h4 className="text-lg font-semibold text-text-primary mb-3">Pending Proposals</h4>
                <p className="text-text-secondary mb-4 text-sm">
                  Review and vote on data point proposals from the community.
                </p>
                <div className="text-center">
                  <div className="text-3xl font-bold text-text-primary mb-1">{pendingProposals.length}</div>
                  <div className="text-text-secondary text-sm">Pending Proposals</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* License Modal (API Key Activation) */}
      {showLicenseModal && authenticatedUser && (
        <LicenseModal
          isOpen={showLicenseModal}
          onClose={() => setShowLicenseModal(false)}
          authenticatedUser={authenticatedUser}
          onApiKeyActivated={handleApiKeyActivated}
        />
      )}

      {/* Feed Creator Modal */}
      {showFeedCreator && authenticatedUser && (
        <FeedCreator
          isOpen={showFeedCreator}
          onClose={() => setShowFeedCreator(false)}
          authenticatedUser={authenticatedUser}
          onFeedCreated={handleFeedCreated}
        />
      )}

      {/* Feed Delegation Modal */}
      {delegatingFeed && authenticatedUser && (
        <FeedDelegationModal
          feedId={delegatingFeed.feedId}
          feedName={delegatingFeed.feedName}
          isOpen={!!delegatingFeed}
          onClose={() => setDelegatingFeed(null)}
          authenticatedUser={authenticatedUser}
        />
      )}

      {/* Create Feed Post Modal */}
      {creatingPostForFeed && authenticatedUser && (
        <CreateFeedPostModal
          feed={creatingPostForFeed}
          isOpen={!!creatingPostForFeed}
          onClose={() => setCreatingPostForFeed(null)}
          authenticatedUser={authenticatedUser}
          onPostCreated={async () => {
            await loadFeeds(); // Reload feeds to update post count
            setCreatingPostForFeed(null);
          }}
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
