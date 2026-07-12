const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const scrapingRoutes = require('./routes/scraping');
const detikScrapingRoutes = require('./routes/detikScraping');
const healthRoutes = require('./routes/health');

const app = express();

app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/scrape/detik', detikScrapingRoutes);
app.use('/api/scrape', scrapingRoutes);

module.exports = app;
