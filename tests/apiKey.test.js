jest.mock('axios');

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

describe('API key middleware', () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: '<html><body>ok</body></html>' });
  });

  it('rejects requests with no api key', async () => {
    const res = await request(app).post('/api/scrape').send({ url: 'https://example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects requests with a wrong api key', async () => {
    const res = await request(app)
      .post('/api/scrape')
      .set('x-api-key', 'wrong-key')
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(401);
  });

  it('accepts a valid key via x-api-key header', async () => {
    const res = await request(app)
      .post('/api/scrape')
      .set('x-api-key', process.env.API_KEY)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(200);
  });

  it('accepts a valid key via Bearer authorization header', async () => {
    const res = await request(app)
      .post('/api/scrape')
      .set('authorization', `Bearer ${process.env.API_KEY}`)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(200);
  });
});
