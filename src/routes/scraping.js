const express = require('express');
const router = express.Router();
const scrapingController = require('../controllers/scraping');
const requireApiKey = require('../middleware/apiKey');

router.use(requireApiKey);
router.post('/', scrapingController.scrapeData);
router.get('/status/:jobId', scrapingController.getStatus);
router.get('/results/:jobId', scrapingController.getResults);

module.exports = router;
