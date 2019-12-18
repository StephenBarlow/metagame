const { Pool } = require('pg')

const pool = new Pool();
exports.connectionPool = pool;
