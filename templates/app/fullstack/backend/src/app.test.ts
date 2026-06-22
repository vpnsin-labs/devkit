import request from 'supertest';
import { createApp } from './app.js';

// The app factory is pure (no DB connection), so it can be exercised directly.
describe('GET /health', () => {
  it('returns ok with uptime and db state', async () => {
    const res = await request(createApp()).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('db');
  });
});

describe('unknown routes', () => {
  it('returns 404 JSON', async () => {
    const res = await request(createApp()).get('/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
