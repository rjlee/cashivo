const request = require('supertest');
const app = require('../../src/server');

describe('API Routes', () => {
  test('GET /api/summary returns JSON with summary data', async () => {
    const res = await request(app).get('/api/summary');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('yearlySummary');
    expect(res.body).toHaveProperty('monthlySpending');
  });
});
