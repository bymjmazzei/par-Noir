/**
 * Feed Creator — Buy Feed flow for verified users: name → monthly payment → activation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Loader, CheckCircle, DollarSign } from 'lucide-react';
import { SectionInfo } from '../common/SectionInfo';
import { FeedService, Feed } from '../../services/feeds/FeedService';
import { CoinbaseProxy, CheckoutRequest } from '../../utils/coinbaseProxy';
import { API_ENDPOINT } from '../../config/api';
import { resolveOwnerApiToken } from '../../services/ownerApiToken';

interface FeedCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onFeedCreated?: (feed: Feed) => void;
  authenticatedUser: { id: string } | null;
  pnIdentifier?: string | null;
}

export const FeedCreator: React.FC<FeedCreatorProps> = ({
  isOpen,
  onClose,
  onFeedCreated,
  authenticatedUser,
  pnIdentifier
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedName, setFeedName] = useState('');

  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'paid' | 'failed'>('idle');
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const activatingRef = useRef(false);

  useEffect(() => {
    if (!checkoutUrl || !pendingCheckoutId || !authenticatedUser) return;

    const pollInterval = setInterval(async () => {
      try {
        const ownerToken = resolveOwnerApiToken(pnIdentifier);
        if (!ownerToken) return;
        const response = await fetch(`${API_ENDPOINT}/api/feeds/payment-status/${pendingCheckoutId}`, {
          headers: {
            Authorization: `Bearer ${ownerToken}`
          }
        });

        if (!response.ok) return;
        const data = await response.json();
        // Webhook sets feed_payments.status = pending_verification after Coinbase confirm
        if (
          data.status === 'pending_verification' ||
          data.status === 'confirmed' ||
          data.status === 'resolved'
        ) {
          clearInterval(pollInterval);
          if (activatingRef.current) return;
          activatingRef.current = true;
          setPaymentStatus('paid');
          setIsCreating(true);
          setError(null);
          try {
            const feed = await FeedService.activateFeedAfterVerification(
              pendingCheckoutId,
              {
                verificationId: 'already-verified',
                verifiedZKPs: {}
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
            activatingRef.current = false;
          }
        } else if (data.status === 'failed') {
          setPaymentStatus('failed');
          setError('Payment failed. Please try again.');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Error checking payment status:', err);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [checkoutUrl, pendingCheckoutId, pnIdentifier, authenticatedUser, onClose, onFeedCreated]);

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
        name: 'Feed subscription',
        description: `Monthly feed sub-pN: ${name}`,
        pricing_type: 'fixed_price',
        local_price: {
          amount: '5.00',
          currency: 'USD'
        },
        requested_info: ['email'],
        metadata: {
          licenseType: 'feed_creation',
          creatorDid: authenticatedUser.id,
          feedName: name,
          monthlyPrice: '5.00'
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">Subscribe to Feed</h2>
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
              Feed sub-pN
              <SectionInfo title="Feed sub-pN" className="text-neutral-400 hover:text-white">
                <p>
                  Registers a feed sub-pN after payment. Use the browser to post and switch contexts.
                </p>
              </SectionInfo>
            </h3>
            <div className="bg-neutral-800 p-4 rounded-lg mb-4">
              <p className="text-2xl font-bold text-white">$5.00</p>
              <p className="text-xs text-neutral-400">per month</p>
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
                <span>Activating feed...</span>
              </>
            ) : isCreating ? (
              <>
                <Loader className="h-5 w-5 animate-spin" />
                <span>Creating...</span>
              </>
            ) : (
              <>
                <DollarSign className="h-5 w-5" />
                <span>Subscribe — $5.00 / month</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
