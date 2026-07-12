const express = require('express');
const router = express.Router();
const detikScrapingController = require('../controllers/detikScraping');
const requireApiKey = require('../middleware/apiKey');

router.use(requireApiKey);
router.post('/terpopuler', detikScrapingController.startTerpopulerJob);
router.get('/status/:jobId', detikScrapingController.getStatus);
router.get('/results/:jobId', detikScrapingController.getResults);

module.exports = router;
