#!/usr/bin/env bun
'use strict';

require('dotenv').config();

const knex = require('knex');
const { runAchievementJob } = require('../achievements/engine');

function usage() {
  return `Usage:
  bun jobs/evaluate-achievements.js pick-locked --league-id <id> [--week <week>] [--dry-run]
  bun jobs/evaluate-achievements.js week-finalized --league-id <id> [--week <week>] [--dry-run]

If --week is omitted, pick-locked uses the effective revealed week and
week-finalized uses the week immediately before the effective current week.`;
}

function parseArguments(argv) {
  const [mode, ...args] = argv;
  if (!mode || mode === '--help' || mode === '-h') return { help: true };
  const options = { mode };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--dry-run') {
      options.dryRun = true;
    } else if (argument === '--league-id') {
      options.leagueId = args[++index];
    } else if (argument.startsWith('--league-id=')) {
      options.leagueId = argument.slice('--league-id='.length);
    } else if (argument === '--week') {
      options.week = args[++index];
    } else if (argument.startsWith('--week=')) {
      options.week = argument.slice('--week='.length);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function knexConfig() {
  if (process.env.DATABASE_URL) {
    const separator = process.env.DATABASE_URL.includes('?') ? '&' : '?';
    return {
      client: 'pg',
      connection: {
        connectionString: `${process.env.DATABASE_URL}${separator}application_name=metagame-achievements`,
        ssl: { rejectUnauthorized: false }
      },
      pool: { min: 0, max: 2 }
    };
  }
  return {
    client: 'pg',
    connection: {
      user: process.env.PGUSER,
      host: process.env.PGHOST,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT,
      password: process.env.PGPASSWORD || ''
    },
    pool: { min: 0, max: 2 }
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const db = knex(knexConfig());
  try {
    const result = await runAchievementJob(db, options);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await db.destroy();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  knexConfig,
  parseArguments,
  usage
};
