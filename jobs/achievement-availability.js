#!/usr/bin/env bun
'use strict';

require('dotenv').config();

const knex = require('knex');
const { knexConfig } = require('./evaluate-achievements');
const { runAvailabilityReport } = require('../achievements/availability');

function usage() {
  return `Usage:
  bun run achievements:availability -- --league-id <id> --user-id <id>
  bun run achievements:availability -- --league-id <id> --all-players

Read-only badge availability report for one active league member, or use
--all-players to list badges that no active member can still earn.
Availability checks use remaining legal picks, season history, and the schedule.
Estimates are conservative where future results or player choices are unknown.
Already-earned non-repeatable badges are reported as EARNED.`;
}

function parseArguments(argv) {
  if (!argv.length || argv.includes('--help') || argv.includes('-h')) return { help: true };
  const options = {};
  const flags = { '--league-id': 'leagueId', '--user-id': 'userId' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--all-players') {
      options.allPlayers = true;
      continue;
    }
    const [flag] = argument.split('=');
    const option = flags[flag];
    if (!option) throw new Error(`Unknown argument: ${argument}`);
    const value = argument.includes('=') ? argument.slice(flag.length + 1) : argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    options[option] = value;
  }
  if (options.allPlayers && options.userId !== undefined) throw new Error('Use either --all-players or --user-id, not both.');
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const db = knex(knexConfig());
  try {
    console.log(JSON.stringify(await runAvailabilityReport(db, options), null, 2));
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

module.exports = { parseArguments, usage };
