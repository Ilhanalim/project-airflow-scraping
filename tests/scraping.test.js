jest.mock('axios');

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

describe('POST /api/scrape', () => {
  const headers = { 'x-api-key': process.env.API_KEY };

  beforeEach(() => {
    axios.get.mockReset();
  });

  it('rejects missing url', async () => {
    const res = await request(app).post('/api/scrape').set(headers).send({});
    expect(res.status).toBe(400);
  });

  it('rejects an invalid url', async () => {
    const res = await request(app).post('/api/scrape').set(headers).send({ url: 'not-a-url' });
    expect(res.status).toBe(400);
  });

  it('returns rawHtml for the requested selector', async () => {
    axios.get.mockResolvedValueOnce({ data: '<html><body><p>hello world</p></body></html>' });

    const res = await request(app)
      .post('/api/scrape')
      .set(headers)
      .send({ url: 'https://example.com', selector: 'p' });

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://example.com');
    expect(res.body.selector).toBe('p');
    expect(res.body.rawHtml).toBe('hello world');
  });

  it('returns 500 when the fetch fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('boom'));

    const res = await request(app)
      .post('/api/scrape')
      .set(headers)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('boom');
  });
});
