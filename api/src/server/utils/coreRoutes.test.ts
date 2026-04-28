/**
 * @jest-environment node
 */
import express from 'express';
import request from 'supertest';
import { registerCoreRoutes } from '../modules/coreRoutes';

describe('registerCoreRoutes', () => {
  it('serves /health with environment and status', async () => {
    const app = express();
    registerCoreRoutes(app, 'test');

    const response = await request(app).get('/health').expect(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.environment).toBe('test');
  });

  it('serves /api/status', async () => {
    const app = express();
    registerCoreRoutes(app, 'test');

    const response = await request(app).get('/api/status').expect(200);
    expect(response.body.status).toBe('operational');
    expect(response.body.service).toBe('Identity Protocol API');
  });
});

