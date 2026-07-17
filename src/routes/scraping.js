const express = require('express');
const router = express.Router();
const scrapingController = require('../controllers/scraping');
const requireApiKey = require('../middleware/apiKey');

router.use(requireApiKey);
router.post('/', scrapingController.scrapeData);

module.exports = router;
