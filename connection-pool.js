const { Pool } = require('pg')

const pool = new Pool();
exports.ConnectionPool = pool;
