/**
 * Feed Page Component
 * Dedicated feed view showing top post (enhanced profile) and feed posts
 */

import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { ArrowLeft, Users, Star, Calendar, Link as LinkIcon, Share2, Heart, MessageCircle, MoreVertical } from 'lucide-react';
import { FeedService, Feed, FeedPost } from '../services/feeds/FeedService';
import { FeedSubscriptionService } from '../services/feeds/FeedSubscriptionService';
import { EnhancedPostContent } from '../components/feeds/EnhancedThoughtCreator';
import { useParams, useNavigate } from 'react-router-dom';

export const FeedPage: React.FC = () => {
  const { feedId } = useParams<{ feedId: string }>();
  const navigate = useNavigate();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [topPost, setTopPost] = useState<FeedPost | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);

  useEffect(() => {
    if (feedId) {
      loadFeed();
      checkSubscription();
    }
  }, [feedId]);

  const loadFeed = async () => {
    if (!feedId) return;

    setLoading(true);
    try {
      const feedData = await FeedService.getFeed(feedId);
      if (!feedData) {
        // Feed not found
        return;
      }

      setFeed(feedData);

      // Load posts
      const feedPosts = await FeedService.getFeedPosts(feedId);
      const topPostData = feedPosts.find(p => p.isTopPost);
      const regularPosts = feedPosts.filter(p => !p.isTopPost);

      setTopPost(topPostData || null);
      setPosts(regularPosts);
    } catch (error) {
      console.error('Failed to load feed:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkSubscription = async () => {
    if (!feedId) return;
    const subscribed = await FeedSubscriptionService.isSubscribed(feedId);
    setIsSubscribed(subscribed);
  };

  const handleSubscribe = async () => {
    if (!feed) return;

    try {
      const result = await FeedSubscriptionService.subscribeToFeed(feed.feedId, 'monthly');
      if (result.success && result.checkoutUrl) {
        window.open(result.checkoutUrl, '_blank');
      }
    } catch (error) {
      console.error('Subscription error:', error);
    }
  };

  const renderPostContent = (post: FeedPost) => {
    return (
      <div className="space-y-4">
        {/* Rich Text Content */}
        {post.content && (
          <div 
            className="prose prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }}
          />
        )}

        {/* Media */}
        {post.media && post.media.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {post.media.map((media, index) => (
              <div key={index} className="relative">
                {media.type === 'image' ? (
                  <img
                    src={media.url}
                    alt={`Media ${index + 1}`}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                ) : (
                  <video
                    src={media.url}
                    className="w-full h-48 object-cover rounded-lg"
                    controls
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Buttons */}
        {post.buttons && post.buttons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.buttons.map((button, index) => (
              <a
                key={index}
                href={button.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  button.style === 'primary'
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : button.style === 'secondary'
                    ? 'bg-neutral-700 text-white hover:bg-neutral-600'
                    : 'text-blue-400 hover:text-blue-300 underline'
                }`}
              >
                {button.label}
              </a>
            ))}
          </div>
        )}

        {/* Polls */}
        {post.polls && post.polls.length > 0 && (
          <div className="space-y-4">
            {post.polls.map((poll, pollIndex) => (
              <div key={pollIndex} className="bg-neutral-800 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">{poll.question}</h4>
                <div className="space-y-2">
                  {poll.options.map((option, optionIndex) => {
                    const votes = poll.votes?.[option] || 0;
                    const totalVotes = Object.values(poll.votes || {}).reduce((a, b) => a + b, 0);
                    const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
                    
                    return (
                      <div key={optionIndex} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-neutral-300">{option}</span>
                          <span className="text-neutral-400">{votes} votes</span>
                        </div>
                        <div className="h-2 bg-neutral-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Forms */}
        {post.forms && post.forms.length > 0 && (
          <div className="space-y-4">
            {post.forms.map((form, formIndex) => (
              <div key={formIndex} className="bg-neutral-800 rounded-lg p-4">
                <h4 className="font-medium text-white mb-4">{form.title}</h4>
                <div className="space-y-3">
                  {form.fields.map((field, fieldIndex) => (
                    <div key={fieldIndex}>
                      <label className="block text-sm font-medium text-neutral-300 mb-1">
                        {field.name}
                        {field.required && <span className="text-red-400">*</span>}
                      </label>
                      {field.type === 'textarea' ? (
                        <textarea
                          className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
                          rows={3}
                        />
                      ) : field.type === 'select' ? (
                        <select className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm">
                          {field.options?.map((opt, optIndex) => (
                            <option key={optIndex} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'email' ? 'email' : 'text'}
                          className="w-full px-3 py-2 bg-neutral-700 border border-neutral-600 rounded text-white text-sm"
                        />
                      )}
                    </div>
                  ))}
                  <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
                    Submit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-neutral-400">Loading feed...</p>
        </div>
      </div>
    );
  }

  if (!feed) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400 mb-4">Feed not found</p>
          <button
            onClick={() => navigate('/discover')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Browse Feeds
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <div className="bg-neutral-900 border-b border-neutral-700">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-neutral-400 hover:text-white transition-colors mb-4"
          >
            <ArrowLeft className="h-5 w-5" />
            <span>Back</span>
          </button>
        </div>
      </div>

      {/* Banner */}
      {feed.branding?.bannerImage && (
        <div className="h-64 bg-neutral-800">
          <img
            src={feed.branding.bannerImage}
            alt={feed.feedName}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Feed Header */}
        <div className="mb-8">
          <div className="flex items-start space-x-4 mb-4">
            {feed.branding?.avatar && (
              <img
                src={feed.branding.avatar}
                alt={feed.feedName}
                className="w-20 h-20 rounded-full object-cover border-4 border-neutral-900"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{feed.feedName}</h1>
              {feed.branding?.bio && (
                <p className="text-neutral-400 mb-4">{feed.branding.bio}</p>
              )}
              
              {/* Links */}
              {feed.branding?.links && feed.branding.links.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {feed.branding.links.map((link, index) => (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm"
                    >
                      <LinkIcon className="h-4 w-4" />
                      <span>{link.label}</span>
                    </a>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center space-x-6 text-sm text-neutral-400">
                {feed.subscriberCount !== undefined && (
                  <div className="flex items-center space-x-1">
                    <Users className="h-4 w-4" />
                    <span>{feed.subscriberCount} subscribers</span>
                  </div>
                )}
                {feed.postCount !== undefined && (
                  <div className="flex items-center space-x-1">
                    <Star className="h-4 w-4" />
                    <span>{feed.postCount} posts</span>
                  </div>
                )}
              </div>
            </div>

            {/* Subscribe Button */}
            <div>
              {isSubscribed ? (
                <button
                  disabled
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium opacity-50 cursor-not-allowed"
                >
                  Subscribed
                </button>
              ) : (
                <button
                  onClick={handleSubscribe}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Subscribe ${feed.monthlyPrice?.toFixed(2) || '5.00'}/month
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Top Post (Enhanced Profile) */}
        {topPost && (
          <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 mb-8">
            {renderPostContent(topPost)}
          </div>
        )}

        {/* Feed Posts */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold mb-4">Posts</h2>
          {posts.length === 0 ? (
            <div className="text-center py-12 bg-neutral-900 border border-neutral-700 rounded-lg">
              <p className="text-neutral-400">No posts yet</p>
            </div>
          ) : (
            posts.map(post => (
              <div key={post.id} className="bg-neutral-900 border border-neutral-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2 text-sm text-neutral-400">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                  <button className="text-neutral-400 hover:text-white">
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
                {renderPostContent(post)}
                <div className="flex items-center space-x-6 mt-6 pt-4 border-t border-neutral-700">
                  <button className="flex items-center space-x-2 text-neutral-400 hover:text-red-400 transition-colors">
                    <Heart className="h-5 w-5" />
                    <span>Like</span>
                  </button>
                  <button className="flex items-center space-x-2 text-neutral-400 hover:text-blue-400 transition-colors">
                    <MessageCircle className="h-5 w-5" />
                    <span>Comment</span>
                  </button>
                  <button className="flex items-center space-x-2 text-neutral-400 hover:text-green-400 transition-colors">
                    <Share2 className="h-5 w-5" />
                    <span>Share</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

