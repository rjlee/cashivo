const path = require('path');
process.env.DATA_DIR = path.resolve(__dirname, '../tmp_data');
const request = require('supertest');
const cheerio = require('cheerio');
const fs = require('fs');
// Ensure test data directory exists
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const app = require('../../src/server');

const DATA_FILE = path.resolve(
  process.env.DATA_DIR || path.resolve(__dirname, '../tmp_data'),
  'transactions_categorized.json'
);
let originalData;

beforeAll(() => {
  if (fs.existsSync(DATA_FILE)) {
    originalData = fs.readFileSync(DATA_FILE, 'utf8');
  }
});

afterAll(() => {
  if (originalData != null) fs.writeFileSync(DATA_FILE, originalData);
});

beforeEach(() => {
  // Seed test data: 4 known records
  const sample = [
    {
      date: '2025-07-01',
      amount: 30,
      description: 'C',
      originalCategory: 'o',
      category: 'cat1',
    },
    {
      date: '2025-06-15',
      amount: 20,
      description: 'B',
      originalCategory: 'o',
      category: 'cat2',
    },
    {
      date: '2025-06-01',
      amount: 10,
      description: 'A',
      originalCategory: 'o',
      category: 'cat1',
    },
    {
      date: '2024-12-31',
      amount: 40,
      description: 'D',
      originalCategory: 'o',
      category: 'cat2',
    },
  ];
  fs.writeFileSync(DATA_FILE, JSON.stringify(sample, null, 2));
});

describe('GET /transactions (filtering)', () => {
  it('shows all sorted by date desc', async () => {
    const res = await request(app).get('/transactions');
    expect(res.status).toBe(200);
    const $ = cheerio.load(res.text);
    const dates = $('.tx-table tbody tr td:nth-child(2)')
      .map((i, el) => $(el).text())
      .get();
    expect(dates).toEqual([
      '2025-07-01',
      '2025-06-15',
      '2025-06-01',
      '2024-12-31',
    ]);
  });

  it('filters by year', async () => {
    const res = await request(app).get('/transactions?year=2025');
    const $ = cheerio.load(res.text);
    const dates = $('.tx-table tbody tr td:nth-child(2)')
      .get()
      .map((td) => $(td).text());
    expect(dates).toEqual(['2025-07-01', '2025-06-15', '2025-06-01']);
  });

  it('filters by category', async () => {
    const res = await request(app).get('/transactions?category=cat1');
    const $ = cheerio.load(res.text);
    const desc = $('.tx-table tbody tr td:nth-child(3)')
      .map((i, el) => $(el).text())
      .get();
    expect(desc).toEqual(['C', 'A']);
  });

  it('filters by date range', async () => {
    const res = await request(app).get(
      '/transactions?dateFrom=2025-06-10&dateTo=2025-07-01'
    );
    const $ = cheerio.load(res.text);
    const dates = $('.tx-table tbody tr td:nth-child(2)')
      .map((i, el) => $(el).text())
      .get();
    expect(dates).toEqual(['2025-07-01', '2025-06-15']);
  });

  it('filters by amount range', async () => {
    const res = await request(app).get(
      '/transactions?amountMin=15&amountMax=35'
    );
    const $ = cheerio.load(res.text);
    const amounts = $('.tx-table tbody tr td:nth-child(4)')
      .map((i, el) =>
        parseFloat(
          $(el)
            .text()
            .replace(/[^\d.-]/g, '')
        )
      )
      .get();
    expect(amounts).toEqual([30, 20]);
  });

  it('paginates correctly and shows partial last page', async () => {
    // seed 60 transactions with dates decreasing
    const many = Array.from({ length: 60 }, (_, i) => ({
      date: `2025-07-${String((i % 30) + 1).padStart(2, '0')}`,
      amount: i,
      description: `D${i}`,
      originalCategory: 'o',
      category: 'cat1',
    }));
    fs.writeFileSync(DATA_FILE, JSON.stringify(many, null, 2));
    const res1 = await request(app).get('/transactions?page=1');
    expect(res1.status).toBe(200);
    let $ = cheerio.load(res1.text);
    expect($('.tx-table tbody tr').length).toBe(50);
    const res2 = await request(app).get('/transactions?page=2');
    expect(res2.status).toBe(200);
    $ = cheerio.load(res2.text);
    expect($('.tx-table tbody tr').length).toBe(10);
  });
});

describe('POST /transactions/bulk (delete and setCategory)', () => {
  it('deletes selected transactions', async () => {
    // select first and third (indexes 0 and 2): C and A
    const res = await request(app)
      .post('/transactions/bulk')
      .send('selected=0')
      .send('selected=2')
      .send('action=delete');
    expect(res.header.location).toBe('/transactions');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const dates = data.map((tx) => tx.date);
    expect(dates).toEqual(['2025-06-15', '2024-12-31']);
  });

  it('sets category of selected transactions', async () => {
    const res = await request(app)
      .post('/transactions/bulk')
      .send('selected=1')
      .send('action=setCategory')
      .send('category=foo');
    expect(res.header.location).toBe('/transactions');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    expect(data[1].category).toBe('foo');
  });

  it('with no selection, does not modify data', async () => {
    const before = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const res = await request(app)
      .post('/transactions/bulk')
      .send('action=delete');
    expect(res.header.location).toBe('/transactions');
    const after = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    expect(after).toEqual(before);
  });
});
