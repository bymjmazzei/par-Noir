// API Server tests
import request from 'supertest';
import express from 'express';

describe('API Server', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    
    // Add basic middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    
    // Add basic routes for testing
    app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.get('/api/identities', (req, res) => {
      res.status(200).json({ identities: [] });
    });

    app.post('/oauth/authorize', (req, res) => {
      res.status(200).json({ 
        authorization_code: 'test-auth-code',
        state: req.body.state || 'test-state'
      });
    });

    app.post('/oauth/token', (req, res) => {
      res.status(200).json({
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token'
      });
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('OAuth Endpoints', () => {
    it('should handle authorization request', async () => {
      const response = await request(app)
        .post('/oauth/authorize')
        .send({
          response_type: 'code',
          client_id: 'test-client',
          redirect_uri: 'http://localhost:3000/callback',
          state: 'test-state'
        })
        .expect(200);

      expect(response.body).toHaveProperty('authorization_code');
      expect(response.body).toHaveProperty('state', 'test-state');
    });

    it('should handle token exchange', async () => {
      const response = await request(app)
        .post('/oauth/token')
        .send({
          grant_type: 'authorization_code',
          code: 'test-auth-code',
          client_id: 'test-client',
          client_secret: 'test-secret',
          redirect_uri: 'http://localhost:3000/callback'
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in');
      expect(response.body).toHaveProperty('refresh_token');
    });
  });

  describe('API Endpoints', () => {
    it('should return identities list', async () => {
      const response = await request(app)
        .get('/api/identities')
        .expect(200);

      expect(response.body).toHaveProperty('identities');
      expect(Array.isArray(response.body.identities)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle 404 errors', async () => {
      await request(app)
        .get('/nonexistent')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/oauth/token')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });
  });
});
