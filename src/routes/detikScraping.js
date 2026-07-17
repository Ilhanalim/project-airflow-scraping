const express = require('express');
const router = express.Router();
const detikScrapingController = require('../controllers/detikScraping');
const requireApiKey = require('../middleware/apiKey');

router.use(requireApiKey);
router.post('/terpopuler', detikScrapingController.startTerpopulerJob);

module.exports = router;
