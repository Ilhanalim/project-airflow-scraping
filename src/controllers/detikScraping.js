const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');

const DEFAULT_TERPOPULER_URL = 'https://www.detik.com/terpopuler';
const CATEGORY_LIST_SELECTOR = 'body > div.container > div.grid-row.content__bg.mgt-16.mgb-16 > div.column-3';
const REQUEST_TIMEOUT_MS = 60000;

const isValidDetikUrl = (value) => {
  try {
    const parsedUrl = new URL(value);
    return ['http:', 'https:'].includes(parsedUrl.protocol) && parsedUrl.hostname.endsWith('detik.com');
  } catch (error) {
    return false;
  }
};

const normalizeUrl = (value, baseUrl) => {
  try {
    return new URL(value, baseUrl).toString();
  } catch (error) {
    return null;
  }
};

const fetchWithRetry = async (url, options = {}, retries = 3, retryDelayMs = 2000) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await axios.get(url, options);
    } catch (error) {
      const retriableError = error.code === 'EAI_AGAIN' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND';
      if (!retriableError || attempt === retries) {
        throw error;
      }
      console.warn(`Retry ${attempt}/${retries} for ${url} due to ${error.code || error.message}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

const getCategoryFromUrl = (url) => {
  const parsedUrl = new URL(url);
  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  return segments[0] || 'all';
};

const getSubCategoryFromUrl = (url) => {
  const parsedUrl = new URL(url);
  const segments = parsedUrl.pathname.split('/').filter(Boolean);
  return segments[1] || 'all';
};

const getRunIdFilter = `
  COALESCE(run_id, job_id) = (
    SELECT COALESCE(run_id, job_id)
    FROM base.detik_scraping_jobs
    WHERE job_id = $1 OR run_id = $1
    ORDER BY created_at ASC
    LIMIT 1
  )
`;

const extractTerpopulerCategories = (html, baseUrl) => {
  const $ = cheerio.load(html);
  const categoriesByUrl = new Map();
  const categoryContainer = $(CATEGORY_LIST_SELECTOR);
  const links = categoryContainer.length > 0 ? categoryContainer.find('a') : $('.column-3 a');

  links.each((index, element) => {
    const label = $(element).text().trim();
    const href = $(element).attr('href');
    const categoryUrl = normalizeUrl(href, baseUrl);

    if (!categoryUrl || !isValidDetikUrl(categoryUrl)) {
      return;
    }

    const parsedUrl = new URL(categoryUrl);
    if (!parsedUrl.pathname.startsWith('/terpopuler/')) {
      return;
    }

    categoriesByUrl.set(categoryUrl, {
      category: getCategoryFromUrl(categoryUrl),
      subCategory: getSubCategoryFromUrl(categoryUrl),
      url: categoryUrl
    });
  });

  return Array.from(categoriesByUrl.values());
};

const extractTerpopulerArticles = (html, source) => {
  const $ = cheerio.load(html);
  const articles = [];

  $('article').each((index, element) => {
    const titleElement = $(element).find('h3 a, h2 a').first();
    const title = titleElement.text().trim();
    const link = titleElement.attr('href');
    const image = $(element).find('img').first().attr('src') || $(element).find('img').first().attr('data-src');
    const dateText = $(element).find('.media__date').text().trim();
    const [category, time] = dateText.split(' | ').map((value) => value.trim());

    if (title && link) {
      articles.push({
        rank: index + 1,
        sourceCategory: source.category,
        sourceSubCategory: source.subCategory,
        sourceUrl: source.url,
        title,
        link,
        image: image || null,
        category: category || null,
        publishedText: time || dateText || null
      });
    }
  });

  return articles;
};

const insertArticleDetails = async (client, categoryRows) => {
  for (const row of categoryRows) {
    const [scrapingJobId, runId, sourceUrl, pageType, category, subCategory, status, articlesJson] = row;
    const articles = JSON.parse(articlesJson);

    if (status !== 'completed' || articles.length === 0) {
      continue;
    }

    for (const article of articles) {
      await client.query(
        `INSERT INTO base.detik_scraping_jobs_details (
           detail_id, scraping_job_id, run_id, source_url, page_type, category, sub_category,
           article_rank, title, link, image, article_category, published_text, raw_article, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
        [
          uuidv4(),
          scrapingJobId,
          runId,
          sourceUrl,
          pageType,
          category,
          subCategory,
          article.rank,
          article.title,
          article.link,
          article.image,
          article.category,
          article.publishedText,
          JSON.stringify(article)
        ]
      );
    }
  }
};

const startTerpopulerJob = async (req, res) => {
  try {
    const url = req.body.url || DEFAULT_TERPOPULER_URL;

    if (typeof url !== 'string' || !isValidDetikUrl(url)) {
      return res.status(400).json({ error: 'URL must be a valid detik.com URL' });
    }

    const jobId = uuidv4();

    await pool.query(
      `INSERT INTO base.detik_scraping_jobs (
         job_id, run_id, source_url, page_type, category, sub_category, status, created_at, updated_at
       )
       VALUES ($1, $1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [jobId, url, 'terpopuler', 'terpopuler', 'all', 'pending']
    );

    res.json({
      jobId,
      message: 'Detik terpopuler scraping job initiated',
      status: 'pending',
      url
    });

    scrapeTerpopulerAsync(jobId, url);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const scrapeTerpopulerAsync = async (jobId, url) => {
  const client = await pool.connect();

  try {
    const response = await fetchWithRetry(url, { timeout: REQUEST_TIMEOUT_MS });
    const categories = extractTerpopulerCategories(response.data, url);
    const targets = [
      { category: 'terpopuler', subCategory: 'all', url },
      ...categories.filter((category) => category.subCategory !== 'all')
    ];
    const categoryRows = [];
    let totalArticles = 0;

    for (const target of targets) {
      const targetResponse = target.url === url ? response : await fetchWithRetry(target.url, { timeout: REQUEST_TIMEOUT_MS });
      const articles = extractTerpopulerArticles(targetResponse.data, target);
      const categoryJobId = target.subCategory === 'all' ? jobId : uuidv4();

      categoryRows.push([
        categoryJobId,
        jobId,
        target.url,
        'terpopuler',
        target.category,
        target.subCategory,
        'completed',
        JSON.stringify(articles),
        articles.length
      ]);

      totalArticles += articles.length;
    }

    await client.query('BEGIN');
    await client.query('DELETE FROM base.detik_scraping_jobs_details WHERE run_id = $1', [jobId]);

    await client.query(
      `UPDATE base.detik_scraping_jobs
       SET status = category_rows.status,
           source_url = category_rows.source_url,
           page_type = category_rows.page_type,
           category = category_rows.category,
           sub_category = category_rows.sub_category,
           articles = category_rows.articles,
           article_count = category_rows.article_count,
           error_message = NULL,
           updated_at = NOW()
       FROM (
         VALUES ($1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text, $7::text, $8::jsonb, $9::integer)
       ) AS category_rows(job_id, run_id, source_url, page_type, category, sub_category, status, articles, article_count)
       WHERE base.detik_scraping_jobs.job_id = category_rows.job_id`,
      categoryRows[0]
    );

    for (const row of categoryRows.slice(1)) {
      await client.query(
        `INSERT INTO base.detik_scraping_jobs (
           job_id, run_id, source_url, page_type, category, sub_category, status, articles, article_count, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
        row
      );
    }

    await insertArticleDetails(client, categoryRows);
    await client.query('COMMIT');

    console.log(`Detik job ${jobId} completed with ${totalArticles} articles from ${categoryRows.length} categories`);
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(`Failed to rollback Detik job ${jobId}:`, rollbackError.message);
    }

    try {
      await pool.query(
        `UPDATE base.detik_scraping_jobs
         SET status = $1, error_message = $2, updated_at = NOW()
         WHERE job_id = $3`,
        ['failed', error.message, jobId]
      );
    } catch (dbError) {
      console.error(`Failed to update Detik job ${jobId}:`, dbError.message);
    }

    console.error(`Detik job ${jobId} failed:`, error.message);
  } finally {
    client.release();
  }
};

const getStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT
         COALESCE(
           MIN(job_id::text) FILTER (WHERE sub_category = 'all'),
           MIN(job_id::text)
         )::uuid AS job_id,
         MIN(source_url) FILTER (WHERE sub_category = 'all') AS source_url,
         MIN(page_type) AS page_type,
         MIN(category) AS category,
         CASE
           WHEN COUNT(*) FILTER (WHERE status = 'failed') > 0 THEN 'failed'
           WHEN COUNT(*) FILTER (WHERE status = 'pending') > 0 THEN 'pending'
           ELSE 'completed'
         END AS status,
         COALESCE(SUM(article_count), 0)::integer AS article_count,
         COUNT(*)::integer AS category_count,
         STRING_AGG(error_message, '; ') FILTER (WHERE error_message IS NOT NULL) AS error_message,
         MIN(created_at) AS created_at,
         MAX(updated_at) AS updated_at
       FROM base.detik_scraping_jobs
       WHERE ${getRunIdFilter}`,
      [jobId]
    );

    if (result.rows.length === 0 || !result.rows[0].job_id) {
      return res.status(404).json({ error: 'Detik job not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getResults = async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      `SELECT job_id, run_id, source_url, page_type, category,
              sub_category, status, articles, article_count, error_message, created_at, updated_at
       FROM base.detik_scraping_jobs
       WHERE ${getRunIdFilter}
       ORDER BY
         CASE WHEN sub_category = 'all' THEN 0 ELSE 1 END,
         sub_category`,
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Detik job not found' });
    }

    const allCategory = result.rows.find((row) => row.sub_category === 'all');
    const categories = result.rows.filter((row) => row.sub_category !== 'all');

    res.json({
      ...(allCategory || result.rows[0]),
      categories
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  startTerpopulerJob,
  getStatus,
  getResults
};
