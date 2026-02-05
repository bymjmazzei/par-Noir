/**
 * OAuth Client Registration Service
 * Manages registered OAuth clients for third-party applications
 */

export interface OAuthClient {
  clientId: string;
  clientSecret?: string; // Optional - some clients may use public key auth
  name: string;
  description?: string;
  redirectUris: string[]; // Allowed redirect URIs
  scopes?: string[]; // Allowed scopes (if empty, all scopes allowed)
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

// In-memory storage (in production, use database)
const clients = new Map<string, OAuthClient>();

// Initialize with browser-app client (default)
// This is the official par Noir browser application
clients.set('browser-app', {
  clientId: 'browser-app',
  name: 'par Noir Browser',
  description: 'Official par Noir browser application for browsing and discovering encrypted content',
  redirectUris: [
    'https://browse.parnoir.com/oauth-callback.html',
    'https://browse.parnoir.com/',
    'http://localhost:3000/oauth-callback.html',
    'http://localhost:3000/',
    'http://localhost:5173/oauth-callback.html', // Vite dev server
    'http://localhost:5173/'
  ],
  scopes: ['openid', 'profile'], // Browser app can request these scopes
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isActive: true
});

// Prism auditor app
clients.set('prism-app', {
  clientId: 'prism-app',
  name: 'par Noir Prism',
  description: 'Prism auditor program for DMCA content review',
  redirectUris: [
    'https://prism.parnoir.com/oauth-callback.html',
    'https://prism.parnoir.com/',
    'http://localhost:5174/oauth-callback.html',
    'http://localhost:5174/'
  ],
  scopes: ['openid', 'profile'],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  isActive: true
});

export class ClientRegistrationService {
  /**
   * Register a new OAuth client
   */
  static registerClient(client: Omit<OAuthClient, 'createdAt' | 'updatedAt'>): OAuthClient {
    const now = Date.now();
    const newClient: OAuthClient = {
      ...client,
      createdAt: now,
      updatedAt: now,
      isActive: client.isActive !== false
    };

    clients.set(client.clientId, newClient);
    return newClient;
  }

  /**
   * Get client by ID
   */
  static getClient(clientId: string): OAuthClient | null {
    return clients.get(clientId) || null;
  }

  /**
   * Validate client ID and redirect URI
   */
  static validateClient(clientId: string, redirectUri: string): boolean {
    const client = clients.get(clientId);
    
    if (!client || !client.isActive) {
      return false;
    }

    // Check if redirect URI is allowed
    return client.redirectUris.some(allowedUri => {
      // Exact match
      if (allowedUri === redirectUri) {
        return true;
      }
      
      // Pattern matching for wildcards (e.g., https://*.example.com/callback)
      if (allowedUri.includes('*')) {
        const pattern = allowedUri
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special chars
          .replace(/\*/g, '.*'); // Convert * to .*
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(redirectUri);
      }
      
      return false;
    });
  }

  /**
   * Validate client secret (if required)
   */
  static validateClientSecret(clientId: string, clientSecret: string): boolean {
    const client = clients.get(clientId);
    
    if (!client) {
      return false;
    }

    // If client has no secret, don't require one
    if (!client.clientSecret) {
      return true;
    }

    return client.clientSecret === clientSecret;
  }

  /**
   * Check if client is allowed to request specific scopes
   */
  static validateScopes(clientId: string, requestedScopes: string[]): boolean {
    const client = clients.get(clientId);
    
    if (!client || !client.isActive) {
      return false;
    }

    // If no scopes specified for client, allow all
    if (!client.scopes || client.scopes.length === 0) {
      return true;
    }

    // Check if all requested scopes are allowed
    return requestedScopes.every(scope => client.scopes!.includes(scope));
  }

  /**
   * Update client
   */
  static updateClient(clientId: string, updates: Partial<Omit<OAuthClient, 'clientId' | 'createdAt'>>): OAuthClient | null {
    const client = clients.get(clientId);
    
    if (!client) {
      return null;
    }

    const updatedClient: OAuthClient = {
      ...client,
      ...updates,
      updatedAt: Date.now()
    };

    clients.set(clientId, updatedClient);
    return updatedClient;
  }

  /**
   * Delete client
   */
  static deleteClient(clientId: string): boolean {
    return clients.delete(clientId);
  }

  /**
   * List all clients (for admin purposes)
   */
  static listClients(): OAuthClient[] {
    return Array.from(clients.values());
  }

  /**
   * Check if client exists
   */
  static clientExists(clientId: string): boolean {
    return clients.has(clientId);
  }
}

