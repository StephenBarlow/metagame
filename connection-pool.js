const { Pool } = require('pg')

const pool = new Pool({
  idleTimeoutMillis: 1000,
  connectionTimeoutMillis: 2000
});
exports.connectionPool = pool;
