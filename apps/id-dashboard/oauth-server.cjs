const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3002;

// Enable CORS for OAuth flow
app.use(cors({
  origin: ['http://localhost:8000', 'http://localhost:3002'],
  credentials: true
}));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// OAuth endpoints
const oauthClients = {
  'developer-portal': {
    clientId: 'developer-portal',
    clientSecret: 'dev-secret',
    redirectUri: 'http://localhost:8000/developer-portal.html',
    scopes: ['openid', 'profile', 'email']
  }
};

const authCodes = new Map();
const accessTokens = new Map();

// OAuth Authorization endpoint
app.get('/oauth/authorize', (req, res) => {
  const { 
    client_id, 
    redirect_uri, 
    scope, 
    response_type, 
    state, 
    nonce 
  } = req.query;

  // Validate client
  const client = oauthClients[client_id];
  if (!client) {
    return res.redirect(`${redirect_uri}?error=invalid_client`);
  }

  // Validate redirect URI
  if (client.redirectUri !== redirect_uri) {
    return res.redirect(`${redirect_uri}?error=invalid_redirect_uri`);
  }

  // For demo purposes, auto-approve and generate auth code
  const authCode = Math.random().toString(36).substring(2);
  const expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes

  authCodes.set(authCode, {
    clientId,
    redirectUri,
    scope: scope.split(' '),
    state,
    nonce,
    expiresAt
  });

  // Redirect back with authorization code
  const redirectUrl = `${redirect_uri}?code=${authCode}&state=${state}`;
  res.redirect(redirectUrl);
});

// OAuth Token endpoint
app.post('/oauth/token', (req, res) => {
  const { 
    grant_type, 
    code, 
    redirect_uri, 
    client_id, 
    client_secret 
  } = req.body;

  if (grant_type !== 'authorization_code') {
    return res.status(400).json({ error: 'unsupported_grant_type' });
  }

  // Validate client
  const client = oauthClients[client_id];
  if (!client || client.clientSecret !== client_secret) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  // Validate authorization code
  const authData = authCodes.get(code);
  if (!authData || authData.expiresAt < Date.now()) {
    authCodes.delete(code);
    return res.status(400).json({ error: 'invalid_grant' });
  }

  // Generate access token
  const accessToken = Math.random().toString(36).substring(2);
  const refreshToken = Math.random().toString(36).substring(2);
  const expiresIn = 3600; // 1 hour

  accessTokens.set(accessToken, {
    clientId,
    scope: authData.scope,
    expiresAt: Date.now() + (expiresIn * 1000)
  });

  // Clean up auth code
  authCodes.delete(code);

  // Return tokens
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    refresh_token: refreshToken,
    scope: authData.scope.join(' ')
  });
});

// OAuth UserInfo endpoint
app.get('/oauth/userinfo', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  const accessToken = authHeader.substring(7);
  const tokenData = accessTokens.get(accessToken);

  if (!tokenData || tokenData.expiresAt < Date.now()) {
    accessTokens.delete(accessToken);
    return res.status(401).json({ error: 'invalid_token' });
  }

  // Return mock user info (in real implementation, this would come from the identity system)
  res.json({
    sub: 'user_123',
    name: 'Developer User',
    email: 'developer@example.com',
    email_verified: true,
    given_name: 'Developer',
    family_name: 'User',
    picture: null,
    locale: 'en',
    updated_at: new Date().toISOString()
  });
});

// OAuth Revocation endpoint
app.post('/oauth/revoke', (req, res) => {
  const { token, client_id, client_secret } = req.body;

  // Validate client
  const client = oauthClients[client_id];
  if (!client || client.clientSecret !== client_secret) {
    return res.status(401).json({ error: 'invalid_client' });
  }

  // Revoke token
  accessTokens.delete(token);

  res.status(200).json({});
});

// Serve the main app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OAuth server running on http://localhost:${PORT}`);
  console.log('OAuth endpoints:');
  console.log(`  Authorization: http://localhost:${PORT}/oauth/authorize`);
  console.log(`  Token: http://localhost:${PORT}/oauth/token`);
  console.log(`  UserInfo: http://localhost:${PORT}/oauth/userinfo`);
  console.log(`  Revocation: http://localhost:${PORT}/oauth/revoke`);
});
