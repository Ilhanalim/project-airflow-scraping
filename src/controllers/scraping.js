const axios = require('axios');
const cheerio = require('cheerio');

const DEFAULT_SELECTOR = 'body';

const isValidHttpUrl = (value) => {
  try {
    const parsedUrl = new URL(value);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch (error) {
    return false;
  }
};

const scrapeData = async (req, res) => {
  try {
    const { url, selector } = req.body;
    const selectedSelector = selector || DEFAULT_SELECTOR;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    if (typeof selectedSelector !== 'string') {
      return res.status(400).json({ error: 'Selector must be a string' });
    }

    if (!isValidHttpUrl(url)) {
      return res.status(400).json({ error: 'URL must be a valid http or https URL' });
    }

    const response = await axios.get(url, { timeout: 30000 });
    const $ = cheerio.load(response.data);
    const rawHtml = $(selectedSelector).html();

    res.json({
      url,
      selector: selectedSelector,
      rawHtml,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  scrapeData
};
