const axios = require('axios');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const pool = require('../utils/db');

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

    const jobId = uuidv4();

    await pool.query(
      `INSERT INTO scraping_jobs (job_id, url, selector, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [jobId, url, selectedSelector, 'pending']
    );

    res.json({
      jobId,
      message: 'Scraping job initiated',
      status: 'pending',
      url
    });

    scrapeAsync(jobId, url, selectedSelector);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const scrapeAsync = async (jobId, url, selector = DEFAULT_SELECTOR) => {
  try {
    const response = await axios.get(url, { timeout: 30000 });
    const $ = cheerio.load(response.data);

    const data = $(selector).html();

    await pool.query(
      `UPDATE scraping_jobs
       SET status = $1,
           raw_data = $2,
           error_message = NULL,
           updated_at = NOW()
       WHERE job_id = $3`,
      ['completed', data, jobId]
    );
    console.log(`Job ${jobId} completed`);
  } catch (error) {
    try {
      await pool.query(
        `UPDATE scraping_jobs
         SET status = $1, error_message = $2, updated_at = NOW()
         WHERE job_id = $3`,
        ['failed', error.message, jobId]
      );
    } catch (dbError) {
      console.error(`Failed to update status for job ${jobId}:`, dbError.message);
    }

    console.error(`Job ${jobId} failed:`, error.message);
  }
};

const getStatus = async (req, res) => {
  try {
    const { jobId } = req.params;

    const result = await pool.query(
      'SELECT job_id, status, error_message, created_at, updated_at FROM scraping_jobs WHERE job_id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
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
      'SELECT job_id, url, status, raw_data, error_message FROM scraping_jobs WHERE job_id = $1',
      [jobId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  scrapeData,
  getStatus,
  getResults
};
