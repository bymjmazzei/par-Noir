import React, { useState, useEffect } from 'react';
import { FeedCreator } from '../components/feeds/FeedCreator';
import { CreateFeedPostModal } from '../components/feeds/CreateFeedPostModal';
import { FeedService, Feed } from '../services/feeds/FeedService';
import { Rss, Plus, Edit, Users, Settings, Loader, AlertCircle, UserPlus, ExternalLink } from 'lucide-react';
import { FeedDelegationModal } from '../components/feeds/FeedDelegationModal';
import { ContentNoticesSection } from '../components/ContentNoticesSection';
import { useApiToken } from '../hooks/useApiToken';
import { useDeviceAuthState } from '../hooks/useDeviceAuthState';
import { DEVICE_CAPABILITIES } from '@par-noir/device-auth';
import { DEVELOPER_PORTAL_URL } from '../config/developerPortal';

interface DeveloperPortalProps {
  authenticatedUser: { id: string; publicKey?: string; nickname?: string; accessToken?: string } | null;
}

export const DeveloperPortal: React.FC<DeveloperPortalProps> = ({ authenticatedUser }) => {
  const { apiToken } = useApiToken();
  const recoveryPnId = authenticatedUser?.id
    ? authenticatedUser.id.startsWith('pn-')
      ? authenticatedUser.id
      : `pn-${authenticatedUser.id}`
    : null;
  const deviceAuth = useDeviceAuthState({
    apiToken,
    userPnIdentifier: recoveryPnId,
  });
  const canProfileWrite = deviceAuth.can(DEVICE_CAPABILITIES.profileWrite);
  const [showFeedCreator, setShowFeedCreator] = useState(false);
  const [creatingPostForFeed, setCreatingPostForFeed] = useState<Feed | null>(null);
  const [ownedFeeds, setOwnedFeeds] = useState<Feed[]>([]);
  const [delegatedFeeds, setDelegatedFeeds] = useState<Feed[]>([]);
  const [isLoadingFeeds, setIsLoadingFeeds] = useState(false);
  const [delegatingFeed, setDelegatingFeed] = useState<Feed | null>(null);

  useEffect(() => {
    if (authenticatedUser?.id) {
      void loadFeeds();
    }
  }, [authenticatedUser?.id]);

  const loadFeeds = async () => {
    if (!authenticatedUser?.id) return;

    setIsLoadingFeeds(true);
    try {
      const ownedResult = await FeedService.listFeeds({
        creatorId: authenticatedUser.id,
        limit: 100
      });
      setOwnedFeeds(ownedResult.feeds);

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

  const handleFeedCreated = async () => {
    setShowFeedCreator(false);
    await loadFeeds();
  };

  return (
    <div className="min-h-screen text-text-primary bg-bg-primary">
      <div className="border-b border-border py-4 bg-bg-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold text-text-primary">Services</h1>
          <p className="text-sm text-text-secondary mt-1">Feeds and links to build on par Noir</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {authenticatedUser && <ContentNoticesSection accessToken={apiToken} />}

        <section className="mb-12 rounded-lg border border-border bg-secondary p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-2">Developer console</h2>
          <p className="text-sm text-text-secondary mb-4">
            Register OAuth clients, create backend API keys, browse standard data points, and read integration guides on
            the hosted developer console (same par Noir unlock flow as other third-party apps).
          </p>
          <a
            href={DEVELOPER_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors text-sm"
          >
            Open developer console
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>

        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Rss className="h-6 w-6 text-primary" />
              <h2 className="text-2xl font-bold text-text-primary">Feed Services</h2>
            </div>
            {authenticatedUser && canProfileWrite && (
              <button
                type="button"
                onClick={() => setShowFeedCreator(true)}
                className="inline-flex items-center px-4 py-2 bg-primary hover:bg-hover text-bg-primary rounded-lg font-medium transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Feed
              </button>
            )}
            {authenticatedUser && !canProfileWrite && deviceAuth.hasKeyedDevices && (
              <p className="text-sm text-text-secondary">{deviceAuth.deviceRequiredMessage}</p>
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
                              {feed.postCount !== undefined && <span>{feed.postCount} posts</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setCreatingPostForFeed(feed)}
                            className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                            title="Create post"
                          >
                            <Plus className="h-4 w-4 inline mr-1" />
                            Post
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDelegatingFeed(feed)}
                            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
                            title="Delegate access"
                          >
                            <UserPlus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded text-sm transition-colors"
                          >
                            <Settings className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              {ownedFeeds.length === 0 && delegatedFeeds.length === 0 && (
                <div className="bg-secondary rounded-lg p-12 text-center">
                  <Rss className="h-16 w-16 text-text-secondary mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-semibold text-text-primary mb-2">No feeds yet</h3>
                  <p className="text-text-secondary mb-6">Create your first feed to start curating content</p>
                  <button
                    type="button"
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
      </div>

      {showFeedCreator && authenticatedUser && (
        <FeedCreator
          isOpen={showFeedCreator}
          onClose={() => setShowFeedCreator(false)}
          authenticatedUser={authenticatedUser}
          onFeedCreated={handleFeedCreated}
        />
      )}

      {delegatingFeed && authenticatedUser && (
        <FeedDelegationModal
          feedId={delegatingFeed.feedId}
          feedName={delegatingFeed.feedName}
          isOpen={!!delegatingFeed}
          onClose={() => setDelegatingFeed(null)}
          authenticatedUser={authenticatedUser}
        />
      )}

      {creatingPostForFeed && authenticatedUser && (
        <CreateFeedPostModal
          feed={creatingPostForFeed}
          isOpen={!!creatingPostForFeed}
          onClose={() => setCreatingPostForFeed(null)}
          authenticatedUser={authenticatedUser}
          canCreatePost={canProfileWrite}
          blockedMessage={deviceAuth.deviceRequiredMessage}
          onPostCreated={async () => {
            await loadFeeds();
            setCreatingPostForFeed(null);
          }}
        />
      )}
    </div>
  );
};
