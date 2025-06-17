const request = require('supertest');
const app = require('../../src/server');

describe('Insights Routes', () => {
  test('GET /years should return HTML with Annual Summaries', async () => {
    const res = await request(app).get('/years');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Annual Summaries');
  });

  test('GET /years/2023 should return HTML for that year', async () => {
    const res = await request(app).get('/years/2023');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('2023 Summary');
  });

  test('GET /years/2023/insights should return HTML with Insights', async () => {
    const res = await request(app).get('/years/2023/insights');
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('2023 Insights');
  });
});
