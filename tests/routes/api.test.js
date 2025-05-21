const request = require('supertest');
const app = require('../../src/server');
const path = require('path');
const fs = require('fs');

const summaryPath = path.resolve(__dirname, '../../data/summary.json');
let hadSummaryFile = false;
beforeAll(() => {
  if (fs.existsSync(summaryPath)) {
    hadSummaryFile = true;
  } else {
    const dataDir = path.dirname(summaryPath);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      summaryPath,
      JSON.stringify({ yearlySummary: [], monthlySpending: [] })
    );
  }
});
afterAll(() => {
  if (!hadSummaryFile) {
    try {
      fs.unlinkSync(summaryPath);
    } catch {}
  }
});

describe('API Routes', () => {
  test('GET /api/summary returns JSON with summary data', async () => {
    const res = await request(app).get('/api/summary');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toHaveProperty('yearlySummary');
    expect(res.body).toHaveProperty('monthlySpending');
  });
});
