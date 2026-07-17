jest.mock('axios');

const axios = require('axios');
const request = require('supertest');
const app = require('../src/app');

const FIXTURE_HTML = `
  <html>
    <body>
      <div class="column-3">
        <a href="https://www.detik.com/terpopuler/sport/bola">Sport</a>
      </div>
      <article>
        <h3><a href="/sport/bola/d-123/judul-berita">Judul Berita</a></h3>
        <img src="https://img.example/1.jpg" />
        <div class="media__date">Sport | 1 jam yang lalu</div>
      </article>
    </body>
  </html>
`;

describe('POST /api/scrape/detik/terpopuler', () => {
  const headers = { 'x-api-key': process.env.API_KEY };

  beforeEach(() => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: FIXTURE_HTML });
  });

  it('rejects urls that are not on detik.com', async () => {
    const res = await request(app)
      .post('/api/scrape/detik/terpopuler')
      .set(headers)
      .send({ url: 'https://example.com' });

    expect(res.status).toBe(400);
  });

  it('scrapes terpopuler categories and articles', async () => {
    const res = await request(app)
      .post('/api/scrape/detik/terpopuler')
      .set(headers)
      .send({ url: 'https://www.detik.com/terpopuler' });

    expect(res.status).toBe(200);
    expect(res.body.pageType).toBe('terpopuler');
    expect(res.body.sourceUrl).toBe('https://www.detik.com/terpopuler');
    expect(res.body.categories.length).toBeGreaterThan(0);
    expect(res.body.totalArticles).toBeGreaterThan(0);
    expect(res.body.categories[0].articles[0].title).toBe('Judul Berita');
  });

  it('fails loudly instead of returning empty data when selectors match nothing', async () => {
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: '<html><body>no articles here</body></html>' });

    const res = await request(app)
      .post('/api/scrape/detik/terpopuler')
      .set(headers)
      .send({ url: 'https://www.detik.com/terpopuler' });

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/No articles extracted/);
  });
});
