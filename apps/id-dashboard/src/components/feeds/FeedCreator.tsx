/**
 * Feed Creator Component
 * Create and configure a new paid feed with enhanced top post
 */

import React, { useState, useEffect } from 'react';
import { X, Plus, Image, Globe, DollarSign, Settings, Loader, CheckCircle } from 'lucide-react';
import { FeedService, Feed } from '../../services/feeds/FeedService';
import { EnhancedThoughtCreator, EnhancedPostContent } from './EnhancedThoughtCreator';
import { IdentityVerificationModal } from '../IdentityVerificationModal';
import { CoinbaseProxy, CheckoutRequest } from '../../utils/coinbaseProxy';
import type { FeedCategory } from '../../types/aggregator';
import { FEED_CATEGORY_LIST } from '../../constants/feedCategories';

interface FeedCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onFeedCreated?: (feed: Feed) => void;
  authenticatedUser: { id: string } | null;
}

export const FeedCreator: React.FC<FeedCreatorProps> = ({
  isOpen,
  onClose,
  onFeedCreated,
  authenticatedUser
}) => {
  const [step, setStep] = useState<'basic' | 'top-post' | 'pricing'>('basic');
  const [feedData, setFeedData] = useState<Partial<Feed>>({
    feedName: '',
    feedCategory: undefined,
    feedDescription: '',
    isPaid: true,
    monthlyPrice: 5.00,
    annualPrice: 50.00,
    subdomain: '',
    branding: {
      avatar: '',
      bannerImage: '',
      bio: '',
      links: [] as Array<{ label: string; url: string }>
    }
  });
  const [topPostContent, setTopPostContent] = useState<EnhancedPostContent | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Payment & Verification state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingFeedData, setPendingFeedData] = useState<{
    checkoutId: string;
    feedData: Partial<Feed>;
    topPostContent: EnhancedPostContent | null;
  } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'paid' | 'failed'>('idle');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleBasicInfoChange = (field: keyof Feed, value: any) => {
    setFeedData(prev => ({ ...prev, [field]: value }));
  };

  const handleBrandingChange = (field: string, value: any) => {
    setFeedData(prev => {
      const currentBranding = prev.branding || {
        avatar: '',
        bannerImage: '',
        bio: '',
        links: []
      };
      
      // Ensure links is always an array
      const updatedBranding = {
        ...currentBranding,
        [field]: field === 'links' && !Array.isArray(value) ? [] : value,
        links: field === 'links' 
          ? (Array.isArray(value) ? value : [])
          : (Array.isArray(currentBranding.links) ? currentBranding.links : [])
      };
      
      return {
        ...prev,
        branding: updatedBranding
      };
    });
  };

  const handleAddLink = () => {
    setFeedData(prev => {
      const currentLinks = Array.isArray(prev.branding?.links) ? prev.branding.links : [];
      return {
        ...prev,
        branding: {
          ...prev.branding,
          links: [
            ...currentLinks,
            { label: '', url: '' }
          ]
        }
      };
    });
  };

  const handleUpdateLink = (index: number, field: 'label' | 'url', value: string) => {
    setFeedData(prev => {
      const currentLinks = Array.isArray(prev.branding?.links) ? prev.branding.links : [];
      const links = [...currentLinks];
      links[index] = { ...(links[index] || { label: '', url: '' }), [field]: value };
      return {
        ...prev,
        branding: {
          ...prev.branding,
          links
        }
      };
    });
  };

  const handleRemoveLink = (index: number) => {
    setFeedData(prev => {
      const currentLinks = Array.isArray(prev.branding?.links) ? prev.branding.links : [];
      const links = [...currentLinks];
      links.splice(index, 1);
      return {
        ...prev,
        branding: {
          ...prev.branding,
          links
        }
      };
    });
  };

  // Poll for payment status after checkout is created
  useEffect(() => {
    if (!checkoutUrl || !pendingFeedData) return;

    const pollInterval = setInterval(async () => {
      try {
        // Check payment status via API
        const response = await fetch(`${import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com'}/api/feeds/payment-status/${pendingFeedData.checkoutId}`, {
          headers: {
            'Authorization': `Bearer ${JSON.parse(localStorage.getItem('authenticated_user') || '{}').accessToken || ''}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.status === 'confirmed' || data.status === 'resolved') {
            setPaymentStatus('paid');
            clearInterval(pollInterval);
            // Open verification modal
            setShowVerificationModal(true);
          } else if (data.status === 'failed') {
            setPaymentStatus('failed');
            setError('Payment failed. Please try again.');
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [checkoutUrl, pendingFeedData]);

  const handleCreateFeed = async () => {
    if (!authenticatedUser) {
      setError('User not authenticated');
      return;
    }

    if (!feedData.feedName) {
      setError('Feed name is required');
      return;
    }

    setIsCreating(true);
    setError(null);
    setPaymentStatus('processing');

    try {
      // Create Coinbase Commerce checkout for feed purchase
      const checkoutData: CheckoutRequest = {
        name: `Feed Creation: ${feedData.feedName}`,
        description: `Create and activate your paid feed "${feedData.feedName}"`,
        pricing_type: 'fixed_price',
        local_price: {
          amount: '5.00', // $5 one-time fee for feed creation
          currency: 'USD'
        },
        requested_info: ['email'],
        metadata: {
          licenseType: 'feed_creation',
          identityHash: authenticatedUser.id,
          licensePrice: '5.00',
          feedName: feedData.feedName,
          feedCategory: feedData.feedCategory || '',
          feedDescription: feedData.feedDescription || '',
          monthlyPrice: feedData.monthlyPrice?.toString() || '5.00',
          annualPrice: feedData.annualPrice?.toString() || '50.00',
          subdomain: feedData.subdomain || '',
          creatorDid: authenticatedUser.id
        }
      };

      const checkout = await CoinbaseProxy.createCheckout(checkoutData);
      
      // Store pending feed data
      setPendingFeedData({
        checkoutId: checkout.id,
        feedData: feedData,
        topPostContent: topPostContent
      });
      
      setCheckoutUrl(checkout.hosted_url || null);

      // Open payment window
      if (checkout.hosted_url) {
        window.open(checkout.hosted_url, '_blank');
      } else {
        throw new Error('Failed to get checkout URL');
      }
    } catch (err) {
      console.error('Feed creation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create payment checkout');
      setPaymentStatus('failed');
      setIsCreating(false);
    }
  };

  const handleVerificationComplete = async (verifiedData: any) => {
    if (!pendingFeedData || !authenticatedUser) {
      setError('Missing feed data or authentication');
      return;
    }

    setShowVerificationModal(false);
    setIsCreating(true);
    setError(null);

    try {
      // Create feed with verified identity
      const feed = await FeedService.createFeed({
        feedName: pendingFeedData.feedData.feedName!,
        feedCategory: pendingFeedData.feedData.feedCategory,
        feedDescription: pendingFeedData.feedData.feedDescription,
        branding: pendingFeedData.feedData.branding,
        isPaid: true,
        monthlyPrice: pendingFeedData.feedData.monthlyPrice,
        annualPrice: pendingFeedData.feedData.annualPrice,
        subdomain: pendingFeedData.feedData.subdomain
      });

      // Create top post if content provided
      if (pendingFeedData.topPostContent) {
        const content = pendingFeedData.topPostContent;
        await FeedService.createFeedPost(feed.feedId, {
          content: content.text || '',
          media: Array.isArray(content.media) ? content.media.map(m => ({
            type: m.type,
            url: m.url,
            thumbnail: m.thumbnail
          })) : [],
          buttons: Array.isArray(content.buttons) ? content.buttons.map(b => ({
            label: b.label,
            url: b.url,
            style: b.style
          })) : [],
          polls: Array.isArray(content.polls) ? content.polls.map(p => ({
            question: p.question,
            options: p.options
          })) : [],
          forms: Array.isArray(content.forms) ? content.forms.map(f => ({
            title: f.title,
            fields: Array.isArray(f.fields) ? f.fields.map(field => ({
              name: field.name,
              type: field.type,
              required: field.required,
              options: field.options
            })) : []
          })) : [],
          isTopPost: true
        });
      }

      // Activate feed (update status from pending to active)
      await FeedService.updateFeed(feed.feedId, {
        // Feed is now active
      });

      onFeedCreated?.(feed);
      onClose();
      
      // Reset form
      setFeedData({
        feedName: '',
        feedCategory: undefined,
        feedDescription: '',
        isPaid: true,
        monthlyPrice: 5.00,
        annualPrice: 50.00,
        subdomain: '',
        branding: {
          avatar: '',
          bannerImage: '',
          bio: '',
          links: []
        }
      });
      setTopPostContent(null);
      setStep('basic');
      setPendingFeedData(null);
      setPaymentStatus('idle');
      setCheckoutUrl(null);
    } catch (err) {
      console.error('Feed activation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to activate feed');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Create Paid Feed</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-6 space-x-4">
          {(['basic', 'top-post', 'pricing'] as const).map((s, index) => (
            <React.Fragment key={s}>
              <button
                onClick={() => setStep(s)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                  step === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-300'
                }`}
              >
                {index === 0 && <Settings className="h-4 w-4" />}
                {index === 1 && <Image className="h-4 w-4" />}
                {index === 2 && <DollarSign className="h-4 w-4" />}
                <span className="text-sm font-medium">
                  {s === 'basic' ? 'Basic Info' : s === 'top-post' ? 'Top Post' : 'Pricing'}
                </span>
              </button>
              {index < 2 && <div className="w-8 h-0.5 bg-neutral-700" />}
            </React.Fragment>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 'basic' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Feed Name *
              </label>
              <input
                type="text"
                value={feedData.feedName || ''}
                onChange={(e) => handleBasicInfoChange('feedName', e.target.value)}
                placeholder="My Awesome Feed"
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Category
              </label>
              <select
                value={feedData.feedCategory || ''}
                onChange={(e) => handleBasicInfoChange('feedCategory', e.target.value || undefined)}
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a category</option>
                {FEED_CATEGORY_LIST.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Description
              </label>
              <textarea
                value={feedData.feedDescription || ''}
                onChange={(e) => handleBasicInfoChange('feedDescription', e.target.value)}
                placeholder="Describe your feed..."
                rows={3}
                className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Subdomain (optional)
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={feedData.subdomain || ''}
                  onChange={(e) => handleBasicInfoChange('subdomain', e.target.value)}
                  placeholder="myfeed"
                  className="flex-1 px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-neutral-400">.parnoir.com</span>
              </div>
            </div>

            {/* Branding */}
            <div className="border-t border-neutral-700 pt-4">
              <h3 className="text-sm font-medium text-white mb-4">Branding</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Avatar URL
                  </label>
                  <input
                    type="url"
                    value={feedData.branding?.avatar || ''}
                    onChange={(e) => handleBrandingChange('avatar', e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Banner Image URL
                  </label>
                  <input
                    type="url"
                    value={feedData.branding?.bannerImage || ''}
                    onChange={(e) => handleBrandingChange('bannerImage', e.target.value)}
                    placeholder="https://..."
                    className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Bio
                  </label>
                  <textarea
                    value={feedData.branding?.bio || ''}
                    onChange={(e) => handleBrandingChange('bio', e.target.value)}
                    placeholder="Tell people about your feed..."
                    rows={3}
                    className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-neutral-300">
                      Links
                    </label>
                    <button
                      onClick={handleAddLink}
                      className="text-sm text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Link</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const branding = feedData.branding || { avatar: '', bannerImage: '', bio: '', links: [] };
                      const links = Array.isArray(branding.links) ? branding.links : [];
                      return links.map((link, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="text"
                            value={link?.label || ''}
                            onChange={(e) => handleUpdateLink(index, 'label', e.target.value)}
                            placeholder="Label"
                            className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white text-sm"
                          />
                          <input
                            type="url"
                            value={link?.url || ''}
                            onChange={(e) => handleUpdateLink(index, 'url', e.target.value)}
                            placeholder="https://..."
                            className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-white text-sm"
                          />
                          <button
                            onClick={() => handleRemoveLink(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep('top-post')}
                disabled={!feedData.feedName}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Top Post
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Top Post */}
        {step === 'top-post' && (
          <div className="space-y-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-white mb-2">Create Enhanced Top Post</h3>
              <p className="text-sm text-neutral-400">
                The top post acts as your feed's profile. It appears at the top of your feed and can include
                rich content, buttons, polls, and forms.
              </p>
            </div>

            <EnhancedThoughtCreator
              initialContent={topPostContent || undefined}
              onSubmit={async (content) => {
                setTopPostContent(content);
                setStep('pricing');
              }}
              onCancel={() => setStep('basic')}
              isTopPost={true}
            />
          </div>
        )}

        {/* Step 3: Pricing */}
        {step === 'pricing' && (
          <div className="space-y-4">
            <div className="mb-4">
              <h3 className="text-lg font-medium text-white mb-2">Subscription Pricing</h3>
              <p className="text-sm text-neutral-400">
                Set your feed's subscription prices. Users can subscribe monthly or annually.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Monthly Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feedData.monthlyPrice || 5.00}
                  onChange={(e) => handleBasicInfoChange('monthlyPrice', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-neutral-400 mt-1">Default: $5/month</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Annual Price ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feedData.annualPrice || 50.00}
                  onChange={(e) => handleBasicInfoChange('annualPrice', parseFloat(e.target.value) || 0)}
                  className="w-full px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-neutral-400 mt-1">Default: $50/year</p>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-neutral-700">
              <button
                onClick={() => setStep('top-post')}
                className="px-4 py-2 text-sm font-medium text-neutral-300 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleCreateFeed}
                disabled={isCreating || paymentStatus === 'processing'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {paymentStatus === 'processing' ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : paymentStatus === 'paid' ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>Payment Confirmed</span>
                  </>
                ) : isCreating ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create & Pay</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Verification Modal */}
      {showVerificationModal && authenticatedUser && (
        <IdentityVerificationModal
          isOpen={showVerificationModal}
          onClose={() => {
            setShowVerificationModal(false);
            // Don't reset payment status - user can retry verification
          }}
          onVerificationComplete={handleVerificationComplete}
          identityId={authenticatedUser.id}
        />
      )}
    </div>
  );
};

