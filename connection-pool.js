const { Pool } = require('pg');
const { URL } = require('url');

let databaseURL = null;
if (process.env.DATABASE_URL) {
  databaseURL = new URL(process.env.DATABASE_URL);
}

let pool = null;

if (databaseURL) {
  pool = new Pool({
    user: databaseURL.username,
    host: databaseURL.hostname,
    database: databaseURL.pathname.split('/')[1],
    password: databaseURL.password,
    port: databaseURL.port,
  })
} else {
  pool = new Pool({
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 2000
  });
}

exports.connectionPool = pool;
