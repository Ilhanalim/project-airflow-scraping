const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config.database);

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
