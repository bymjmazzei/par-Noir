/**
 * Subdomain Service
 * Handles subdomain detection and routing for feeds
 */

export class SubdomainService {
  /**
   * Get current subdomain
   */
  static getCurrentSubdomain(): string | null {
    if (typeof window === 'undefined') return null;
    
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    
    // Check if we're on a subdomain (e.g., feedname.parnoir.com)
    if (parts.length >= 3) {
      const subdomain = parts[0];
      // Exclude common non-feed subdomains
      if (subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'browse') {
        return subdomain;
      }
    }
    
    return null;
  }

  /**
   * Check if current page is on a feed subdomain
   */
  static isFeedSubdomain(): boolean {
    return this.getCurrentSubdomain() !== null;
  }

  /**
   * Get feed ID from subdomain
   * Note: This requires a lookup - subdomain to feedId mapping
   */
  static async getFeedIdFromSubdomain(subdomain: string): Promise<string | null> {
    try {
      const apiBase = import.meta.env.VITE_API_ENDPOINT || 'https://api.parnoir.com';
      const response = await fetch(`${apiBase}/api/feeds/by-subdomain/${subdomain}`);
      
      if (response.ok) {
        const feed = await response.json();
        return feed.feedId || null;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get feed from subdomain:', error);
      return null;
    }
  }

  /**
   * Generate subdomain URL for a feed
   */
  static getFeedSubdomainUrl(subdomain: string): string {
    const baseDomain = import.meta.env.VITE_SUBDOMAIN_DOMAIN || 'parnoir.com';
    return `https://${subdomain}.${baseDomain}`;
  }
}

