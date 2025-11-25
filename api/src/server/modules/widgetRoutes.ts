/**
 * Widget Routes
 * Handles feed widgets and public index APIs for content portability
 */

import { Request, Response } from 'express';
import { FeedService } from './feedService';
import { getDatabasePool } from '../utils/database';

/**
 * Setup widget routes
 */
export function setupWidgetRoutes(app: any) {
  const db = getDatabasePool();

  /**
   * GET /api/widgets/feed/:feedId
   * Get feed widget HTML code
   */
  app.get('/api/widgets/feed/:feedId', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      
      // Get feed
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).json({ error: 'Feed not found' });
      }

      // Generate widget HTML
      const widgetUrl = `${process.env.API_BASE_URL || 'https://api.parnoir.com'}/api/widgets/feed/${feedId}/embed`;
      const widgetHtml = `
<div id="parnoir-feed-widget-${feedId}" style="width: 100%; min-height: 400px;"></div>
<script>
  (function() {
    var script = document.createElement('script');
    script.src = '${widgetUrl}?embed=true';
    script.async = true;
    document.getElementById('parnoir-feed-widget-${feedId}').appendChild(script);
  })();
</script>
      `.trim();

      return res.json({
        feedId,
        widgetHtml,
        widgetUrl,
        instructions: 'Copy and paste the widget HTML code into your website to embed this feed.'
      });
    } catch (error) {
      console.error('Widget generation error:', error);
      return res.status(500).json({ error: 'Failed to generate widget' });
    }
  });

  /**
   * GET /api/widgets/feed/:feedId/embed
   * Embeddable feed widget (returns JavaScript that renders the feed)
   */
  app.get('/api/widgets/feed/:feedId/embed', async (req: Request, res: Response) => {
    try {
      const { feedId } = req.params;
      const embed = req.query.embed === 'true';

      // Get feed
      const feed = await FeedService.getFeedById(feedId);
      if (!feed) {
        return res.status(404).send('Feed not found');
      }

      // Get feed posts
      const postsResult = await db.query(`
        SELECT * FROM feed_posts 
        WHERE feed_id = $1 AND is_top_post = false
        ORDER BY created_at DESC
        LIMIT 20
      `, [feedId]);

      const posts = postsResult.rows.map(row => ({
        id: row.post_id,
        feedId: row.feed_id,
        content: row.content,
        media: row.media ? JSON.parse(row.media) : [],
        buttons: row.buttons ? JSON.parse(row.buttons) : [],
        polls: row.polls ? JSON.parse(row.polls) : [],
        forms: row.forms ? JSON.parse(row.forms) : [],
        isTopPost: row.is_top_post,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      // Get top post
      const topPostResult = await db.query(`
        SELECT * FROM feed_posts 
        WHERE feed_id = $1 AND is_top_post = true
        LIMIT 1
      `, [feedId]);

      const topPost = topPostResult.rows.length > 0 ? {
        id: topPostResult.rows[0].post_id,
        feedId: topPostResult.rows[0].feed_id,
        content: topPostResult.rows[0].content,
        media: topPostResult.rows[0].media ? JSON.parse(topPostResult.rows[0].media) : [],
        buttons: topPostResult.rows[0].buttons ? JSON.parse(topPostResult.rows[0].buttons) : [],
        polls: topPostResult.rows[0].polls ? JSON.parse(topPostResult.rows[0].polls) : [],
        forms: topPostResult.rows[0].forms ? JSON.parse(topPostResult.rows[0].forms) : [],
        isTopPost: true,
        createdAt: topPostResult.rows[0].created_at,
        updatedAt: topPostResult.rows[0].updated_at
      } : null;

      // Generate JavaScript widget
      const widgetScript = `
(function() {
  var feedData = ${JSON.stringify({ feed, topPost, posts })};
  var containerId = 'parnoir-feed-widget-${feedId}';
  var container = document.getElementById(containerId) || document.currentScript.parentElement;
  
  if (!container) {
    console.error('par Noir feed widget: Container not found');
    return;
  }

  // Widget styles (non-customizable)
  var styles = \`
    .parnoir-widget { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0a0a0a;
      color: #ffffff;
      border-radius: 8px;
      padding: 20px;
      max-width: 600px;
      margin: 0 auto;
    }
    .parnoir-widget-header { 
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #262626;
    }
    .parnoir-widget-title { 
      font-size: 24px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }
    .parnoir-widget-description { 
      color: #a3a3a3;
      font-size: 14px;
      margin: 0;
    }
    .parnoir-widget-post { 
      margin-bottom: 24px;
      padding-bottom: 24px;
      border-bottom: 1px solid #262626;
    }
    .parnoir-widget-post:last-child { 
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    .parnoir-widget-post-content { 
      margin-bottom: 12px;
      line-height: 1.6;
    }
    .parnoir-widget-post-content img { 
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 8px 0;
    }
    .parnoir-widget-post-media { 
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
      margin: 12px 0;
    }
    .parnoir-widget-post-media img,
    .parnoir-widget-post-media video { 
      width: 100%;
      height: 150px;
      object-fit: cover;
      border-radius: 4px;
    }
    .parnoir-widget-buttons { 
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0;
    }
    .parnoir-widget-button { 
      padding: 8px 16px;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      transition: opacity 0.2s;
    }
    .parnoir-widget-button-primary { 
      background: #2563eb;
      color: #ffffff;
    }
    .parnoir-widget-button-secondary { 
      background: #404040;
      color: #ffffff;
    }
    .parnoir-widget-button-link { 
      color: #60a5fa;
      text-decoration: underline;
    }
    .parnoir-widget-button:hover { 
      opacity: 0.8;
    }
    .parnoir-widget-poll { 
      background: #171717;
      border-radius: 6px;
      padding: 16px;
      margin: 12px 0;
    }
    .parnoir-widget-poll-question { 
      font-weight: 600;
      margin-bottom: 12px;
    }
    .parnoir-widget-poll-option { 
      margin-bottom: 8px;
    }
    .parnoir-widget-poll-bar { 
      height: 8px;
      background: #262626;
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }
    .parnoir-widget-poll-fill { 
      height: 100%;
      background: #2563eb;
      transition: width 0.3s;
    }
    .parnoir-widget-form { 
      background: #171717;
      border-radius: 6px;
      padding: 16px;
      margin: 12px 0;
    }
    .parnoir-widget-form-title { 
      font-weight: 600;
      margin-bottom: 16px;
    }
    .parnoir-widget-form-field { 
      margin-bottom: 12px;
    }
    .parnoir-widget-form-label { 
      display: block;
      font-size: 14px;
      margin-bottom: 4px;
      color: #d4d4d4;
    }
    .parnoir-widget-form-input { 
      width: 100%;
      padding: 8px 12px;
      background: #262626;
      border: 1px solid #404040;
      border-radius: 4px;
      color: #ffffff;
      font-size: 14px;
    }
    .parnoir-widget-form-textarea { 
      min-height: 80px;
      resize: vertical;
    }
    .parnoir-widget-form-submit { 
      padding: 8px 16px;
      background: #2563eb;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
    }
  \`;
  
  // Inject styles
  if (!document.getElementById('parnoir-widget-styles')) {
    var styleSheet = document.createElement('style');
    styleSheet.id = 'parnoir-widget-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  // Render widget
  var widgetHtml = '<div class="parnoir-widget">';
  
  // Header
  widgetHtml += '<div class="parnoir-widget-header">';
  widgetHtml += '<h2 class="parnoir-widget-title">' + escapeHtml(feedData.feed.feedName) + '</h2>';
  if (feedData.feed.feedDescription) {
    widgetHtml += '<p class="parnoir-widget-description">' + escapeHtml(feedData.feed.feedDescription) + '</p>';
  }
  widgetHtml += '</div>';

  // Top Post (if exists)
  if (feedData.topPost) {
    widgetHtml += renderPost(feedData.topPost, true);
  }

  // Posts
  feedData.posts.forEach(function(post) {
    widgetHtml += renderPost(post, false);
  });

  widgetHtml += '</div>';
  
  container.innerHTML = widgetHtml;

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderPost(post, isTopPost) {
    var html = '<div class="parnoir-widget-post">';
    
    // Content
    if (post.content) {
      html += '<div class="parnoir-widget-post-content">' + post.content + '</div>';
    }

    // Media
    if (post.media && post.media.length > 0) {
      html += '<div class="parnoir-widget-post-media">';
      post.media.forEach(function(media) {
        if (media.type === 'image') {
          html += '<img src="' + escapeHtml(media.url) + '" alt="Post media" />';
        } else if (media.type === 'video') {
          html += '<video src="' + escapeHtml(media.url) + '" controls></video>';
        }
      });
      html += '</div>';
    }

    // Buttons
    if (post.buttons && post.buttons.length > 0) {
      html += '<div class="parnoir-widget-buttons">';
      post.buttons.forEach(function(button) {
        var styleClass = 'parnoir-widget-button-' + (button.style || 'primary');
        html += '<a href="' + escapeHtml(button.url) + '" class="parnoir-widget-button ' + styleClass + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(button.label) + '</a>';
      });
      html += '</div>';
    }

    // Polls
    if (post.polls && post.polls.length > 0) {
      post.polls.forEach(function(poll) {
        html += '<div class="parnoir-widget-poll">';
        html += '<div class="parnoir-widget-poll-question">' + escapeHtml(poll.question) + '</div>';
        var totalVotes = 0;
        if (poll.votes) {
          Object.values(poll.votes).forEach(function(v) { totalVotes += v; });
        }
        poll.options.forEach(function(option) {
          var votes = poll.votes && poll.votes[option] ? poll.votes[option] : 0;
          var percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;
          html += '<div class="parnoir-widget-poll-option">';
          html += '<div>' + escapeHtml(option) + ' (' + votes + ' votes)</div>';
          html += '<div class="parnoir-widget-poll-bar"><div class="parnoir-widget-poll-fill" style="width: ' + percentage + '%"></div></div>';
          html += '</div>';
        });
        html += '</div>';
      });
    }

    // Forms
    if (post.forms && post.forms.length > 0) {
      post.forms.forEach(function(form) {
        html += '<div class="parnoir-widget-form">';
        html += '<div class="parnoir-widget-form-title">' + escapeHtml(form.title) + '</div>';
        form.fields.forEach(function(field) {
          html += '<div class="parnoir-widget-form-field">';
          html += '<label class="parnoir-widget-form-label">' + escapeHtml(field.name) + (field.required ? ' *' : '') + '</label>';
          if (field.type === 'textarea') {
            html += '<textarea class="parnoir-widget-form-input parnoir-widget-form-textarea" name="' + escapeHtml(field.name) + '"></textarea>';
          } else if (field.type === 'select') {
            html += '<select class="parnoir-widget-form-input" name="' + escapeHtml(field.name) + '">';
            if (field.options) {
              field.options.forEach(function(opt) {
                html += '<option value="' + escapeHtml(opt) + '">' + escapeHtml(opt) + '</option>';
              });
            }
            html += '</select>';
          } else {
            html += '<input type="' + escapeHtml(field.type) + '" class="parnoir-widget-form-input" name="' + escapeHtml(field.name) + '"' + (field.required ? ' required' : '') + ' />';
          }
          html += '</div>';
        });
        html += '<button type="submit" class="parnoir-widget-form-submit">Submit</button>';
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }
})();
      `.trim();

      res.setHeader('Content-Type', 'application/javascript');
      return res.send(widgetScript);
    } catch (error) {
      console.error('Widget embed error:', error);
      return res.status(500).send('Failed to load widget');
    }
  });

  /**
   * GET /api/public-index/:identityId
   * Get user's public index (portable content)
   */
  app.get('/api/public-index/:identityId', async (req: Request, res: Response) => {
    try {
      const { identityId } = req.params;

      // Get public files from aggregator metadata service
      const { AggregatorMetadataServiceDB } = await import('./aggregatorMetadataServiceDB');
      const service = AggregatorMetadataServiceDB.getInstance();

      // Search for public files by creator DID
      const result = await service.searchMetadata('', {
        authorDid: identityId,
        limit: 1000,
        offset: 0
      });

      // Filter to only public files
      const publicFiles = result.files
        .filter((entry: any) => entry.metadata?.isPublic === true)
        .map((entry: any) => ({
          fileId: entry.metadata?.fileId,
          name: entry.metadata?.name,
          description: entry.metadata?.description,
          keywords: entry.metadata?.keywords,
          uploadDate: entry.metadata?.uploadDate,
          fileType: entry.metadata?.fileType,
          thumbnail: entry.metadata?.thumbnail,
          engagement: entry.metadata?.engagement,
          contentRating: entry.metadata?.contentRating
        }));

      return res.json({
        identityId,
        files: publicFiles,
        total: publicFiles.length,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Public index error:', error);
      return res.status(500).json({ error: 'Failed to retrieve public index' });
    }
  });
}

