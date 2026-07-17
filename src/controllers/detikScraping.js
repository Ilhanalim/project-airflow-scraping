const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

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
      const retriableError = ['EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(error.code);
      const message = `Retry ${attempt}/${retries} for ${url} due to ${error.code || error.message}`;
      console.warn(message);

      if (!retriableError || attempt === retries) {
        throw error;
      }

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

const extractTerpopulerCategories = (html, baseUrl) => {
  const $ = cheerio.load(html);
  const categoriesByUrl = new Map();
  const categoryContainer = $(CATEGORY_LIST_SELECTOR);
  const links = categoryContainer.length > 0 ? categoryContainer.find('a') : $('.column-3 a');

  links.each((index, element) => {
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

const fetchTerpopulerData = async (url) => {
  const response = await fetchWithRetry(url, { timeout: REQUEST_TIMEOUT_MS });
  const categories = extractTerpopulerCategories(response.data, url);
  const targets = [
    { category: 'terpopuler', subCategory: 'all', url },
    ...categories.filter((category) => category.subCategory !== 'all')
  ];

  const categoryResults = [];
  let totalArticles = 0;

  for (const target of targets) {
    const targetResponse = target.url === url ? response : await fetchWithRetry(target.url, { timeout: REQUEST_TIMEOUT_MS });
    const articles = extractTerpopulerArticles(targetResponse.data, target);

    categoryResults.push({
      category: target.category,
      subCategory: target.subCategory,
      url: target.url,
      articleCount: articles.length,
      articles
    });

    totalArticles += articles.length;
  }

  return {
    jobId: uuidv4(),
    sourceUrl: url,
    pageType: 'terpopuler',
    categories: categoryResults,
    totalArticles,
    eventDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  };
};

const startTerpopulerJob = async (req, res) => {
  try {
    const url = req.body.url || DEFAULT_TERPOPULER_URL;

    if (typeof url !== 'string' || !isValidDetikUrl(url)) {
      return res.status(400).json({ error: 'URL must be a valid detik.com URL' });
    }

    const result = await fetchTerpopulerData(url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  startTerpopulerJob
};
