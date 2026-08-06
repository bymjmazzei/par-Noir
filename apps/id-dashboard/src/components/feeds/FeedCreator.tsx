/**
 * Feed Creator — Buy Feed flow: name → payment → verification → activation (owned-asset row).
 */

import React, { useState, useEffect } from 'react';
import { X, Loader, CheckCircle, DollarSign } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';
import { FeedService, Feed } from '../../services/feeds/FeedService';
import { IdentityVerificationModal } from '../IdentityVerificationModal';
import { CoinbaseProxy, CheckoutRequest } from '../../utils/coinbaseProxy';
import { API_ENDPOINT } from '../../config/api';
import type { EncryptedIdentity } from '../../types/crypto';
import type { VerifiedIdentityData } from '../../types/verifiedIdentity';
import { resolveOwnerApiToken } from '../../services/ownerApiToken';

interface FeedCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onFeedCreated?: (feed: Feed) => void;
  authenticatedUser: { id: string } | null;
  pnIdentifier?: string | null;
  encryptedIdentity?: EncryptedIdentity;
}

export const FeedCreator: React.FC<FeedCreatorProps> = ({
  isOpen,
  onClose,
  onFeedCreated,
  authenticatedUser,
  pnIdentifier,
  encryptedIdentity
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedName, setFeedName] = useState('');

  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'paid' | 'failed'>('idle');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!checkoutUrl || !pendingCheckoutId) return;

    const pollInterval = setInterval(async () => {
      try {
        const ownerToken = resolveOwnerApiToken(pnIdentifier);
        if (!ownerToken) return;
        const response = await fetch(`${API_ENDPOINT}/api/feeds/payment-status/${pendingCheckoutId}`, {
          headers: {
            Authorization: `Bearer ${ownerToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          // Webhook sets feed_payments.status = pending_verification after Coinbase confirm
          if (
            data.status === 'pending_verification' ||
            data.status === 'confirmed' ||
            data.status === 'resolved'
          ) {
            setPaymentStatus('paid');
            clearInterval(pollInterval);
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
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [checkoutUrl, pendingCheckoutId, pnIdentifier]);

  if (!isOpen) return null;

  const handleBuyFeed = async () => {
    if (!authenticatedUser) {
      setError('User not authenticated');
      return;
    }
    const name = feedName.trim();
    if (!name) {
      setError('Enter a feed name');
      return;
    }

    setIsCreating(true);
    setError(null);
    setPaymentStatus('processing');

    try {
      const checkoutData: CheckoutRequest = {
        name: 'Feed Purchase',
        description: `Purchase feed: ${name}`,
        pricing_type: 'fixed_price',
        local_price: {
          amount: '5.00',
          currency: 'USD'
        },
        requested_info: ['email'],
        metadata: {
          licenseType: 'feed_creation',
          creatorDid: authenticatedUser.id,
          feedName: name
        }
      };

      const checkout = await CoinbaseProxy.createCheckout(checkoutData);

      setPendingCheckoutId(checkout.id);
      setCheckoutUrl(checkout.hosted_url || null);

      if (checkout.hosted_url) {
        window.open(checkout.hosted_url, '_blank');
      } else {
        throw new Error('Failed to get checkout URL');
      }
    } catch (err) {
      console.error('Feed purchase error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create payment checkout');
      setPaymentStatus('failed');
      setIsCreating(false);
    }
  };

  const handleVerificationComplete = async (verifiedData: VerifiedIdentityData) => {
    if (!pendingCheckoutId || !authenticatedUser) {
      setError('Missing checkout ID or authentication');
      return;
    }

    setShowVerificationModal(false);
    setIsCreating(true);
    setError(null);

    try {
      const feed = await FeedService.activateFeedAfterVerification(
        pendingCheckoutId,
        {
          verificationId: verifiedData.verificationId || `veriff-${Date.now()}`,
          verifiedZKPs: verifiedData.dataPoints
        },
        pnIdentifier
      );

      onFeedCreated?.(feed);
      onClose();

      setPendingCheckoutId(null);
      setPaymentStatus('idle');
      setCheckoutUrl(null);
      setFeedName('');
    } catch (err) {
      console.error('Feed activation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to activate feed');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Buy Feed</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <div className="space-y-6">
          <div className="text-center">
            <DollarSign className="h-12 w-12 text-blue-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2 flex items-center justify-center gap-2">
              Purchase a Feed
              <SectionInfo title="Purchase a Feed" className="text-neutral-400 hover:text-white">
                <p>
                  Registers a feed sub-pN after payment and identity verification. Use the browser to post and
                  switch contexts.
                </p>
              </SectionInfo>
            </h3>
            <div className="bg-neutral-800 p-4 rounded-lg mb-4">
              <p className="text-2xl font-bold text-white">$5.00</p>
              <p className="text-xs text-neutral-400">One-time payment</p>
            </div>
          </div>

          <label className="block text-left text-sm">
            <span className="text-neutral-300">Feed name</span>
            <input
              type="text"
              className="mt-1 w-full rounded-md bg-neutral-800 border border-neutral-600 px-3 py-2 text-white"
              value={feedName}
              onChange={(e) => setFeedName(e.target.value)}
              placeholder="My feed"
              disabled={paymentStatus === 'processing' || paymentStatus === 'paid'}
            />
          </label>

          <button
            type="button"
            onClick={() => void handleBuyFeed()}
            disabled={
              isCreating ||
              paymentStatus === 'processing' ||
              paymentStatus === 'paid' ||
              !feedName.trim()
            }
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {paymentStatus === 'processing' ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                <span>Processing Payment...</span>
              </>
            ) : paymentStatus === 'paid' ? (
              <>
                <CheckCircle className="h-5 w-5" />
                <span>Payment Confirmed</span>
              </>
            ) : isCreating ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <DollarSign className="h-5 w-5" />
                <span>Buy Feed - $5.00</span>
              </>
            )}
          </button>

          {paymentStatus === 'paid' && (
            <p className="text-sm text-center text-neutral-400">
              Complete identity verification to activate your feed.
            </p>
          )}
        </div>
      </div>

      {showVerificationModal && authenticatedUser && (
        <IdentityVerificationModal
          isOpen={showVerificationModal}
          onClose={() => {
            setShowVerificationModal(false);
          }}
          onVerificationComplete={handleVerificationComplete}
          identityId={authenticatedUser.id}
          encryptedIdentity={encryptedIdentity}
        />
      )}
    </div>
  );
};
