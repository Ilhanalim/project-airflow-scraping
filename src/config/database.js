module.exports = {
  database: {
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'scraping_db',
    user: process.env.DB_USER || 'scraper',
    password: process.env.DB_PASSWORD || 'scraper_password'
  }
};
