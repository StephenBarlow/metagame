const crypto = require('crypto');
const express = require('express');
const emailValidator = require('email-validator');
const parseCsv = require('csv-parse/lib/sync');
const path = require('path');
const { startAchievementEvaluationJob } = require('./render-one-off-jobs');

class AdminInputError extends Error {}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function constantTimeEqual(actual, expected) {
  const actualDigest = crypto.createHash('sha256').update(String(actual)).digest();
  const expectedDigest = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

function parseBasicAuthorization(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

function adminAuthentication(options = {}) {
  return function authenticate(req, res, next) {
    const expectedPassword = options.password ?? process.env.ADMIN_PASSWORD;
    const expectedUsername = options.username ?? process.env.ADMIN_USERNAME ?? 'admin';

    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src https://api.iconify.design; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

    if (!expectedPassword) {
      return res.status(503).send('Admin access is disabled because ADMIN_PASSWORD is not configured.');
    }

    const credentials = parseBasicAuthorization(req.get('authorization'));
    if (credentials &&
        constantTimeEqual(credentials.username, expectedUsername) &&
        constantTimeEqual(credentials.password, expectedPassword)) {
      return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Metagame admin", charset="UTF-8"');
    return res.status(401).send('Authentication required.');
  };
}

function page(title, content, notice, noticeType = 'success') {
  const noticeHtml = notice
    ? `<div class="notice ${noticeType === 'error' ? 'error' : ''}">${escapeHtml(notice)}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Metagame admin</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, sans-serif; color: #18212f; background: #f4f6f8; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    header { background: #172033; color: white; padding: 1rem max(1rem, calc((100% - 1180px) / 2)); }
    header strong { margin-right: 2rem; }
    nav { display: inline-flex; flex-wrap: wrap; gap: 1rem; }
    nav a { color: #d9e6ff; text-decoration: none; }
    main { max-width: 1180px; margin: 0 auto; padding: 1.5rem 1rem 4rem; }
    h1 { margin-top: 0; }
    h2 { margin-top: 2rem; }
    a { color: #1457b8; }
    .panel { background: white; border: 1px solid #d8dee8; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
    .notice { background: #e4f5e8; border: 1px solid #8dc99a; padding: .75rem; border-radius: 6px; margin-bottom: 1rem; }
    .notice.error { background: #ffebeb; border-color: #dd9999; }
    .warning { color: #8a3b00; }
    .muted { color: #647084; }
    .filters, .form-grid { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; }
    label { display: grid; gap: .25rem; font-weight: 600; }
    input, select, textarea, button { font: inherit; padding: .5rem .6rem; border: 1px solid #aeb8c7; border-radius: 5px; }
    textarea { width: 100%; min-height: 14rem; font-family: ui-monospace, monospace; }
    button, .button { background: #1457b8; border-color: #1457b8; color: white; cursor: pointer; text-decoration: none; display: inline-block; padding: .5rem .7rem; border-radius: 5px; }
    button.danger { background: #a22b2b; border-color: #a22b2b; }
    table { width: 100%; border-collapse: collapse; background: white; }
    th, td { text-align: left; padding: .55rem; border-bottom: 1px solid #dfe4eb; vertical-align: top; }
    th { background: #edf1f6; }
    tr.invalidated { opacity: .58; }
    .table-wrap { overflow-x: auto; border: 1px solid #d8dee8; border-radius: 8px; }
    code { background: #edf1f6; padding: .1rem .25rem; }
  </style>
  <script type="module" src="/admin/iconify-icon.js"></script>
</head>
<body>
  <header><strong>Metagame admin</strong><nav>
    <a href="/admin/games">Games & scores</a>
    <a href="/admin/teams">Teams & tags</a>
    <a href="/admin/schedule">Schedule import</a>
    <a href="/admin/picks">Picks</a>
    <a href="/admin/messages">Messages</a>
    <a href="/admin/achievements">Achievements</a>
    <a href="/admin/leagues">Leagues</a>
    <a href="/admin/users">Users</a>
  </nav></header>
  <main><h1>${escapeHtml(title)}</h1>${noticeHtml}${content}</main>
</body>
</html>`;
}

function option(value, label, selectedValue) {
  const selected = String(value) === String(selectedValue) ? ' selected' : '';
  return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(label)}</option>`;
}

function requiredInteger(value, label, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AdminInputError(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function nullableScore(value, label) {
  if (value === '' || value === undefined || value === null) return null;
  return requiredInteger(value, label, 0, 999);
}

function nullableWeek(value, label, minimum = 0) {
  if (value === '' || value === undefined || value === null) return null;
  return requiredInteger(value, label, minimum, 25);
}

function effectiveWeek(value, environmentVariable, fallback) {
  if (value === null || value === undefined || value === '') {
    const environmentValue = Number(process.env[environmentVariable]);
    return Number.isInteger(environmentValue) ? environmentValue : fallback;
  }
  return Number(value);
}

function achievementJobsForWeekSettings(previousCurrentWeek, previousRevealedWeek, nextCurrentWeek, nextRevealedWeek) {
  const jobs = [];
  if (nextRevealedWeek > previousRevealedWeek) {
    jobs.push({ mode: 'pick-locked', week: nextRevealedWeek });
  }
  if (nextCurrentWeek > previousCurrentWeek) {
    jobs.push({ mode: 'week-finalized', week: previousCurrentWeek });
  }
  return jobs;
}

function validSeason(value) {
  const season = String(value ?? '').trim();
  if (!/^\d{4}$/.test(season)) throw new AdminInputError('Season must be a four-digit year.');
  return Number(season);
}

function validTag(value) {
  const tag = String(value ?? '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(tag)) {
    throw new AdminInputError('Tags must start with a letter and contain only lowercase letters, numbers, and underscores.');
  }
  return tag;
}

function validIconID(value) {
  const iconID = String(value ?? '').trim();
  if (!iconID) return null;
  if (iconID.length > 255 || !/^[^:\s]+:[^:\s]+$/.test(iconID)) {
    throw new AdminInputError('Icon ID must use the Iconify prefix:name format.');
  }
  return iconID;
}

function validTimestamp(value) {
  const timestamp = String(value ?? '').trim();
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(timestamp)) {
    throw new AdminInputError('Start time must include a timezone (Z or ±HH:MM).');
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new AdminInputError('Start time must be a timestamp with a timezone.');
  return date;
}

function returnPath(value, fallback) {
  return typeof value === 'string' && value.startsWith('/admin/') && !value.startsWith('//')
    ? value
    : fallback;
}

function redirectWithNotice(res, path, notice, type = 'success') {
  const separator = path.includes('?') ? '&' : '?';
  res.redirect(`${path}${separator}notice=${encodeURIComponent(notice)}&notice_type=${type}`);
}

function formatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function isConcluded(league) {
  return String(league.season) !== String(process.env.CURRENT_SEASON);
}

function createAdminRouter({ pg, logger = console, auth = {} }) {
  const router = express.Router();
  const db = pg.knex;

  router.use(adminAuthentication(auth));
  router.use(express.urlencoded({ extended: false, limit: '2mb' }));
  router.get('/iconify-icon.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'node_modules/iconify-icon/dist/iconify-icon.mjs'));
  });
  router.use((req, res, next) => {
    if (req.method !== 'POST') return next();
    const origin = req.get('origin');
    if (!origin) return next();
    try {
      if (new URL(origin).host === req.get('host')) return next();
    } catch {}
    return res.status(403).send('Cross-origin admin form submissions are not allowed.');
  });

  router.get('/', (req, res) => res.redirect('/admin/games'));

  router.get('/games', async (req, res) => {
    const seasons = await db('sports_games').distinct('season').orderBy('season', 'desc');
    const season = req.query.season || process.env.CURRENT_SEASON || seasons[0]?.season;
    const week = req.query.week ? requiredInteger(req.query.week, 'Week', 1, 25) : null;
    let query = db('sports_games').select('*').orderBy(['week', 'start_time']);
    if (season) query = query.where('season', season);
    if (week) query = query.where('week', week);
    const games = await query;

    const rows = games.map(game => `<tr>
      <td>${escapeHtml(game.week)}</td><td>${escapeHtml(formatTimestamp(game.start_time))}</td>
      <td>${escapeHtml(game.away_team_short_name)} ${game.away_team_score ?? '—'}</td>
      <td>${escapeHtml(game.home_team_short_name)} ${game.home_team_score ?? '—'}</td>
      <td><a href="/admin/games/${game.id}/edit">Edit game</a></td>
    </tr>`).join('');

    const content = `<div class="panel"><form class="filters" method="get">
      <label>Season<select name="season">${seasons.map(row => option(row.season, row.season, season)).join('')}</select></label>
      <label>Week<input name="week" type="number" min="1" max="25" value="${escapeHtml(week ?? '')}" placeholder="All"></label>
      <button type="submit">Filter</button><a class="button" href="/admin/games/new">Add one game</a>
    </form></div>
    <div class="table-wrap"><table><thead><tr><th>Week</th><th>Starts</th><th>Away</th><th>Home</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5">No games found.</td></tr>'}</tbody></table></div>`;
    res.send(page('Games and scores', content, req.query.notice, req.query.notice_type));
  });

  router.get('/games/new', async (req, res) => {
    const teams = await db('teams').select('*').orderBy('short_name');
    const content = gameForm(null, teams, '/admin/games', 'Create game');
    res.send(page('Add one game', content, req.query.notice, req.query.notice_type));
  });

  router.get('/games/:id/edit', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Game ID');
    const [game, teams, tags] = await Promise.all([
      db('sports_games').where({ id }).first(),
      db('teams').select('*').orderBy('short_name'),
      db('sports_game_tags').where({ game_id: id }).orderBy('tag')
    ]);
    if (!game) return res.status(404).send(page('Game not found', '<p>No game has that ID.</p>'));
    const content = gameForm(game, teams, `/admin/games/${id}`, 'Save game', tags);
    res.send(page(`Edit game ${id}`, content, req.query.notice, req.query.notice_type));
  });

  router.post('/games/:id/tags', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Game ID');
    const tag = validTag(req.body.tag);
    if (!(await db('sports_games').where({ id }).first())) throw new AdminInputError('Game not found.');
    const existing = await db('sports_game_tags').where({ game_id: id, tag }).first();
    if (existing) throw new AdminInputError('That game already has this tag.');
    await db('sports_game_tags').insert({ game_id: id, tag });
    redirectWithNotice(res, `/admin/games/${id}/edit`, `Added ${tag} tag.`);
  });

  router.post('/games/:id/tags/:tag/remove', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Game ID');
    const tag = validTag(req.params.tag);
    if (!(await db('sports_games').where({ id }).first())) throw new AdminInputError('Game not found.');
    await db('sports_game_tags').where({ game_id: id, tag }).delete();
    redirectWithNotice(res, `/admin/games/${id}/edit`, `Removed ${tag} tag.`);
  });

  router.get('/teams', async (req, res) => {
    const [teams, tags] = await Promise.all([
      db('teams').select('*').orderBy('short_name'),
      db('sports_team_tags').select('*').orderBy(['team_id', 'tag'])
    ]);
    const tagsByTeam = new Map();
    for (const tag of tags) {
      if (!tagsByTeam.has(tag.team_id)) tagsByTeam.set(tag.team_id, []);
      tagsByTeam.get(tag.team_id).push(tag.tag);
    }
    const rows = teams.map(team => {
      const teamTags = tagsByTeam.get(team.id) || [];
      const tagHtml = teamTags.length
        ? teamTags.map(tag => `<form style="display:inline" method="post" action="/admin/teams/${team.id}/tags/${encodeURIComponent(tag)}/remove" onsubmit="return confirm('Remove this tag?')"><button type="submit">${escapeHtml(tag)} ×</button></form>`).join(' ')
        : '<span class="muted">No tags</span>';
      return `<tr><td>${escapeHtml(team.name)}</td><td><code>${escapeHtml(team.short_name)}</code></td><td>${tagHtml}</td><td>
        <form class="form-grid" method="post" action="/admin/teams/${team.id}/tags"><label>Add tag<input name="tag" pattern="[a-z][a-z0-9_]*" maxlength="64" required placeholder="bird"></label><button type="submit">Add</button></form>
      </td></tr>`;
    }).join('');
    const content = `<p class="muted">Tags use lowercase letters, numbers, and underscores. Each action adds or removes one tag from one team.</p>
      <div class="table-wrap"><table><thead><tr><th>Team</th><th>Short name</th><th>Tags</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">No teams found.</td></tr>'}</tbody></table></div>`;
    res.send(page('Teams and tags', content, req.query.notice, req.query.notice_type));
  });

  router.post('/teams/:id/tags', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Team ID');
    const tag = validTag(req.body.tag);
    if (!(await db('teams').where({ id }).first())) throw new AdminInputError('Team not found.');
    const existing = await db('sports_team_tags').where({ team_id: id, tag }).first();
    if (existing) throw new AdminInputError('That team already has this tag.');
    await db('sports_team_tags').insert({ team_id: id, tag });
    redirectWithNotice(res, '/admin/teams', `Added ${tag} tag.`);
  });

  router.post('/teams/:id/tags/:tag/remove', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Team ID');
    const tag = validTag(req.params.tag);
    if (!(await db('teams').where({ id }).first())) throw new AdminInputError('Team not found.');
    await db('sports_team_tags').where({ team_id: id, tag }).delete();
    redirectWithNotice(res, '/admin/teams', `Removed ${tag} tag.`);
  });

  router.post('/games', async (req, res) => {
    const game = await validateGamePayload(db, req.body);
    const [created] = await db('sports_games').insert(game).returning('*');
    await pg.invalidateSportsGameCache([created]);
    redirectWithNotice(res, `/admin/games/${created.id}/edit`, 'Game created.');
  });

  router.post('/games/:id', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Game ID');
    const existing = await db('sports_games').where({ id }).first();
    if (!existing) throw new AdminInputError('Game not found.');
    const updates = await validateGamePayload(db, req.body);
    const [updated] = await db('sports_games').where({ id }).update(updates).returning('*');
    await pg.invalidateSportsGameCache([existing, updated]);
    redirectWithNotice(res, `/admin/games/${id}/edit`, 'Game updated.');
  });

  router.get('/schedule', (req, res) => {
    res.send(page('Schedule import', scheduleForm(), req.query.notice, req.query.notice_type));
  });

  router.post('/schedule/preview', async (req, res) => {
    const parsed = await parseScheduleCsv(db, req.body.season, req.body.csv);
    const previews = parsed.rows.map((entry, index) => {
      if (entry.error) return `<tr><td>${index + 1}</td><td colspan="5" class="warning">${escapeHtml(entry.error)} — ${escapeHtml(entry.source.join(','))}</td></tr>`;
      const game = entry.game;
      return `<tr><td>${index + 1}</td><td>${escapeHtml(game.week)}</td><td>${escapeHtml(formatTimestamp(game.start_time))}</td><td>${escapeHtml(game.away_team_short_name)}</td><td>${escapeHtml(game.home_team_short_name)}</td><td>
        <form method="post" action="/admin/games">
          <input type="hidden" name="season" value="${parsed.season}"><input type="hidden" name="week" value="${escapeHtml(game.week)}">
          <input type="hidden" name="start_time" value="${escapeHtml(formatTimestamp(game.start_time))}"><input type="hidden" name="away_team_short_name" value="${escapeHtml(game.away_team_short_name)}">
          <input type="hidden" name="home_team_short_name" value="${escapeHtml(game.home_team_short_name)}">
          <input type="hidden" name="away_team_score" value=""><input type="hidden" name="home_team_score" value="">
          <button type="submit">Create this game</button>
        </form></td></tr>`;
    }).join('');

    const importAll = parsed.rows.length && parsed.rows.every(row => !row.error)
      ? `<form method="post" action="/admin/schedule/import"><input type="hidden" name="season" value="${parsed.season}"><textarea name="csv" hidden>${escapeHtml(parsed.csvText)}</textarea><button type="submit">Import all new games</button></form>`
      : '<p class="warning">Fix CSV errors before importing the full schedule.</p>';
    const content = `${scheduleForm(parsed.season, parsed.csvText)}<h2>Preview</h2>
      <p class="warning">The full import only adds games that are not already present; it never updates or deletes games. Each row also has an individual create action.</p>${importAll}
      <div class="table-wrap"><table><thead><tr><th>Row</th><th>Week</th><th>Starts</th><th>Away</th><th>Home</th><th></th></tr></thead><tbody>${previews}</tbody></table></div>`;
    res.send(page('Schedule import', content));
  });

  router.post('/schedule/import', async (req, res) => {
    const parsed = await parseScheduleCsv(db, req.body.season, req.body.csv);
    const invalid = parsed.rows.find(row => row.error);
    if (invalid) throw new AdminInputError(`CSV contains an invalid row: ${invalid.error}`);
    const existing = await db('sports_games').where({ season: parsed.season }).select('*');
    const seen = new Set(existing.map(gameKey));
    const games = [];
    for (const { game } of parsed.rows) {
      const key = gameKey(game);
      if (!seen.has(key)) {
        seen.add(key);
        games.push(game);
      }
    }
    if (!games.length) return redirectWithNotice(res, `/admin/games?season=${parsed.season}`, 'No new games were found in the CSV.');
    const created = await db.transaction(trx => trx('sports_games').insert(games).returning('*'));
    await pg.invalidateSportsGameCache(created);
    redirectWithNotice(res, `/admin/games?season=${parsed.season}`, `${created.length} games imported.`);
  });

  router.get('/picks', async (req, res) => {
    const leagues = await db('fantasy_leagues').select('*').orderBy('season', 'desc').orderBy('name');
    const leagueID = req.query.league_id ? requiredInteger(req.query.league_id, 'League ID') : null;
    const week = req.query.week ? requiredInteger(req.query.week, 'Week', 1, 25) : null;
    let picks = [];
    let members = [];
    let teams = [];
    if (leagueID && week) {
      [picks, members, teams] = await Promise.all([
        db('picks as p')
          .join('users as u', 'u.id', 'p.user_id')
          .leftJoin('memberships as m', function() {
            this.on('m.user_id', '=', 'p.user_id').andOn('m.league_id', '=', 'p.league_id');
            this.onNull('m.revoked_at');
          })
          .leftJoin('teams as t', 't.id', 'p.team_id')
          .where({ 'p.league_id': leagueID, 'p.week': week })
          .select('p.*', 'u.email', 'm.display_name', 't.name as team_name', 't.short_name')
          .orderBy(['m.display_name', 'p.created_at']),
        activeMembersQuery(db, leagueID),
        db('teams').select('*').orderBy('name')
      ]);
    }

    const rows = picks.map(pick => `<tr class="${pick.invalidated_at ? 'invalidated' : ''}">
      <td>${escapeHtml(pick.display_name || pick.email)}</td><td>${escapeHtml(pick.short_name || (pick.team_id === -1 ? 'BYE' : pick.team_id))}</td>
      <td>${escapeHtml(formatTimestamp(pick.created_at))}</td><td>${pick.invalidated_at ? `Invalidated ${escapeHtml(formatTimestamp(pick.invalidated_at))}` : 'Active'}</td>
      <td>${pick.invalidated_at ? '' : `<form method="post" action="/admin/picks/${pick.id}/invalidate" onsubmit="return confirm('Invalidate this pick?')">
        <input type="hidden" name="return_to" value="/admin/picks?league_id=${leagueID}&week=${week}"><button class="danger" type="submit">Invalidate</button></form>`}</td>
    </tr>`).join('');

    const memberOptions = members.map(member => option(member.user_id, `${member.display_name} (${member.email})`)).join('');
    const teamOptions = option(-1, 'BYE') + teams.map(team => option(team.id, `${team.name} (${team.short_name})`)).join('');
    const addPick = leagueID && week ? `<div class="panel"><h2>Submit one pick on behalf of a player</h2><form class="form-grid" method="post" action="/admin/picks">
      <input type="hidden" name="league_id" value="${leagueID}"><input type="hidden" name="week" value="${week}">
      <label>Player<select name="user_id" required>${memberOptions}</select></label><label>Team<select name="team_id" required>${teamOptions}</select></label>
      <button type="submit">Create pick</button></form><p class="muted">This does not invalidate any existing pick; use the individual invalidate action first if needed.</p></div>` : '';

    const content = `<div class="panel"><form class="filters" method="get">
      <label>League<select name="league_id" required><option value="">Choose…</option>${leagues.map(league => option(league.id, `${league.name} (${league.season})`, leagueID)).join('')}</select></label>
      <label>Week<input name="week" type="number" min="1" max="25" required value="${escapeHtml(week ?? '')}"></label><button type="submit">Show picks</button>
    </form></div>${addPick}${leagueID && week ? `<div class="table-wrap"><table><thead><tr><th>Player</th><th>Pick</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No picks found.</td></tr>'}</tbody></table></div>` : '<p>Select a league and week.</p>'}`;
    res.send(page('League picks', content, req.query.notice, req.query.notice_type));
  });

  router.post('/picks', async (req, res) => {
    const leagueID = requiredInteger(req.body.league_id, 'League ID');
    const userID = requiredInteger(req.body.user_id, 'User ID');
    const teamID = Number(req.body.team_id) === -1 ? -1 : requiredInteger(req.body.team_id, 'Team ID');
    const week = requiredInteger(req.body.week, 'Week', 1, 25);
    const membership = await activeMembersQuery(db, leagueID).where('memberships.user_id', userID).first();
    if (!membership) throw new AdminInputError('That user is not an active member of the league.');
    if (teamID !== -1 && !(await db('teams').where({ id: teamID }).first())) throw new AdminInputError('Team not found.');
    const [pick] = await db('picks').insert({ league_id: leagueID, user_id: userID, team_id: teamID, week }).returning('*');
    await pg.invalidatePickCache([pick]);
    redirectWithNotice(res, `/admin/picks?league_id=${leagueID}&week=${week}`, 'Pick created.');
  });

  router.post('/picks/:id/invalidate', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Pick ID');
    await pg.invalidatePicks([id]);
    redirectWithNotice(res, returnPath(req.body.return_to, '/admin/picks'), 'Pick invalidated.');
  });

  router.get('/messages', async (req, res) => {
    const leagueID = req.query.league_id ? requiredInteger(req.query.league_id, 'League ID') : null;
    const [leagues, messages] = await Promise.all([
      db('fantasy_leagues').select('*').orderBy('season', 'desc').orderBy('name'),
      (() => {
        const query = db('messages as messages')
          .innerJoin('fantasy_leagues as leagues', 'leagues.id', 'messages.league_id')
          .innerJoin('memberships as authors', 'authors.id', 'messages.author_membership_id')
          .innerJoin('users as users', 'users.id', 'authors.user_id')
          .leftJoin('message_templates as templates', 'templates.id', 'messages.template_id')
          .select([
            'messages.id',
            'messages.week',
            'messages.rendered_text',
            'messages.created_at',
            'messages.invalidated_at',
            'leagues.id as league_id',
            'leagues.name as league_name',
            'leagues.season as league_season',
            'authors.display_name as author_display_name',
            'users.email as author_email',
            'templates.key as template_key'
          ])
          .orderBy('messages.created_at', 'desc')
          .orderBy('messages.id', 'desc');
        if (leagueID) query.where('messages.league_id', leagueID);
        return query;
      })()
    ]);

    const rows = messages.map(message => `<tr class="${message.invalidated_at ? 'invalidated' : ''}">
      <td>${escapeHtml(message.league_name)} <span class="muted">(${escapeHtml(message.league_season)})</span></td>
      <td>${escapeHtml(message.week)}</td>
      <td>${escapeHtml(message.author_display_name || message.author_email)}</td>
      <td>${escapeHtml(message.rendered_text)}</td>
      <td><code>${escapeHtml(message.template_key || '—')}</code></td>
      <td>${escapeHtml(formatTimestamp(message.created_at))}</td>
      <td>${message.invalidated_at ? `Invalidated ${escapeHtml(formatTimestamp(message.invalidated_at))}` : 'Active'}</td>
      <td>${message.invalidated_at ? '' : `<form method="post" action="/admin/messages/${message.id}/invalidate" onsubmit="return confirm('Invalidate this message? It will no longer be served to players.')">
        <input type="hidden" name="return_to" value="/admin/messages${leagueID ? `?league_id=${leagueID}` : ''}"><button class="danger" type="submit">Invalidate</button></form>`}</td>
    </tr>`).join('');
    const content = `<div class="panel"><form class="filters" method="get">
      <label>League<select name="league_id"><option value="">All leagues</option>${leagues.map(league => option(league.id, `${league.name} (${league.season})`, leagueID)).join('')}</select></label>
      <button type="submit">Filter</button><a class="button" href="/admin/messages/templates">Edit template text</a><a class="button" href="/admin/messages/values">Manage values</a>
    </form></div>
    <p class="muted">Invalidating a message is permanent from the admin interface and hides only that individual message from the public API.</p>
    <div class="table-wrap"><table><thead><tr><th>League</th><th>Week</th><th>Author</th><th>Message</th><th>Template</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8">No messages found.</td></tr>'}</tbody></table></div>`;
    res.send(page('Messages', content, req.query.notice, req.query.notice_type));
  });

  router.post('/messages/:id/invalidate', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Message ID');
    const invalidated = await pg.invalidateMessages([id]);
    if (!invalidated.length) throw new AdminInputError('Message not found or is already invalidated.');
    redirectWithNotice(res, returnPath(req.body.return_to, '/admin/messages'), 'Message invalidated and will no longer be served.');
  });

  router.get('/messages/values', async (req, res) => {
    const values = await db('message_values').select('*').orderBy('kind').orderBy('text');
    const rows = values.map(value => `<tr class="${value.active ? '' : 'invalidated'}">
      <td>${value.kind === 'adjective' ? 'Adjective' : 'Catalog'}</td>
      <td>${escapeHtml(value.text)}</td>
      <td><code>${escapeHtml(value.key)}</code></td>
      <td>${value.active ? 'Active' : 'Removed'}</td>
      <td>${value.active
        ? `<form method="post" action="/admin/messages/values/${value.id}/remove" onsubmit="return confirm('Remove this value from future messages? Existing messages will keep it.')"><button class="danger" type="submit">Remove</button></form>`
        : `<form method="post" action="/admin/messages/values/${value.id}/restore"><button type="submit">Restore</button></form>`}</td>
    </tr>`).join('');
    const content = `<div class="panel"><h2>Add value</h2><form class="form-grid" method="post" action="/admin/messages/values">
      <label>List<select name="kind"><option value="catalog_value">Catalog</option><option value="adjective">Adjective</option></select></label>
      <label>Text<input name="text" maxlength="255" required></label>
      <button type="submit">Add value</button>
    </form></div>
    <p class="muted">Removing a value hides it from future message composition without altering old messages that used it. Values have generated internal keys and their text is not editable here.</p>
    <div class="table-wrap"><table><thead><tr><th>List</th><th>Text</th><th>Key</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No message values found.</td></tr>'}</tbody></table></div>
    <p><a href="/admin/messages">Back to messages</a></p>`;
    res.send(page('Message values', content, req.query.notice, req.query.notice_type));
  });

  router.post('/messages/values', async (req, res) => {
    const kind = validMessageValueKind(req.body.kind);
    const text = validMessageValueText(req.body.text);
    const existing = await db('message_values').where({ kind, text }).first();
    if (existing) {
      if (existing.active) throw new AdminInputError('That value is already active in this list.');
      await db('message_values').where({ id: existing.id }).update({
        active: true,
        updated_at: db.raw('CURRENT_TIMESTAMP')
      });
      await pg.invalidateMessageValueCache(existing.id);
      return redirectWithNotice(res, '/admin/messages/values', 'Existing value restored.');
    }
    const key = await nextMessageValueKey(db, text);
    const [created] = await db('message_values').insert({ key, kind, text }).returning('*');
    await pg.invalidateMessageValueCache(created.id);
    redirectWithNotice(res, '/admin/messages/values', 'Message value added.');
  });

  router.post('/messages/values/:id/remove', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Message value ID');
    const updated = await db('message_values').where({ id, active: true }).update({
      active: false,
      updated_at: db.raw('CURRENT_TIMESTAMP')
    }).returning(['id']);
    if (!updated.length) throw new AdminInputError('Message value not found or is already removed.');
    await pg.invalidateMessageValueCache(id);
    redirectWithNotice(res, '/admin/messages/values', 'Message value removed from future composition.');
  });

  router.post('/messages/values/:id/restore', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Message value ID');
    const updated = await db('message_values').where({ id, active: false }).update({
      active: true,
      updated_at: db.raw('CURRENT_TIMESTAMP')
    }).returning(['id']);
    if (!updated.length) throw new AdminInputError('Message value not found or is already active.');
    await pg.invalidateMessageValueCache(id);
    redirectWithNotice(res, '/admin/messages/values', 'Message value restored.');
  });

  router.get('/messages/templates', async (req, res) => {
    const templates = await db('message_templates').select('*').orderBy('key');
    const rows = templates.map(template => `<tr>
      <td><code>${escapeHtml(template.key)}</code></td>
      <td>${escapeHtml(template.format)}</td>
      <td>${template.active ? 'Active' : 'Inactive'}</td>
      <td><a href="/admin/messages/templates/${template.id}/edit">Edit text</a></td>
    </tr>`).join('');
    const content = `<p class="muted">Template slots and their allowed values are fixed here. Editing the format changes the wording of messages wherever they are rendered, including existing messages.</p>
      <div class="table-wrap"><table><thead><tr><th>Key</th><th>Format</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4">No message templates found.</td></tr>'}</tbody></table></div>
      <p><a href="/admin/messages">Back to messages</a> · <a href="/admin/messages/values">Manage values</a></p>`;
    res.send(page('Message template text', content, req.query.notice, req.query.notice_type));
  });

  router.get('/messages/templates/:id/edit', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Message template ID');
    const [template, slots] = await Promise.all([
      db('message_templates').where({ id }).first(),
      db('message_template_slots').where({ template_id: id }).orderBy('position')
    ]);
    if (!template) return res.status(404).send(page('Message template not found', '<p>No message template has that ID.</p>'));
    res.send(page(`Edit ${template.key} text`, messageTemplateForm(template, slots), req.query.notice, req.query.notice_type));
  });

  router.post('/messages/templates/:id', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Message template ID');
    const [template, slots] = await Promise.all([
      db('message_templates').where({ id }).first(),
      db('message_template_slots').where({ template_id: id }).orderBy('position')
    ]);
    if (!template) throw new AdminInputError('Message template not found.');
    const format = validMessageTemplateFormat(req.body.format, slots);
    await db('message_templates').where({ id }).update({
      format,
      updated_at: db.raw('CURRENT_TIMESTAMP')
    });
    await pg.invalidateMessageTemplateCache();
    redirectWithNotice(res, `/admin/messages/templates/${id}/edit`, 'Message template text updated.');
  });

  router.get('/leagues', async (req, res) => {
    const [leagues, users] = await Promise.all([
      db('fantasy_leagues').select('*').orderBy('season', 'desc').orderBy('name'),
      db('users').select('*').orderBy('email')
    ]);
    const rows = leagues.map(league => `<tr><td>${escapeHtml(league.name)}</td><td>${escapeHtml(league.season)}</td><td>${escapeHtml(league.game_mode)}</td><td>${isConcluded(league) ? 'Concluded' : 'Active'}</td><td><a href="/admin/leagues/${league.id}">View members</a></td></tr>`).join('');
    const content = `<div class="panel"><h2>Create league</h2><form class="form-grid" method="post" action="/admin/leagues">
      <label>Name<input name="name" required></label><label>Season<input name="season" value="${escapeHtml(process.env.CURRENT_SEASON || '')}" pattern="[0-9]{4}" required></label>
      <label>Owner<select name="owner_id" required>${users.map(user => option(user.id, user.email)).join('')}</select></label>
      <label>Owner display name<input name="owner_display_name" required maxlength="255"></label>
      <label>Game mode<select name="game_mode"><option value="PICK_TWO">PICK_TWO</option></select></label><button type="submit">Create league</button>
    </form><p class="muted">The owner is added as the league’s first member.</p></div>
    <div class="table-wrap"><table><thead><tr><th>Name</th><th>Season</th><th>Mode</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    res.send(page('Leagues', content, req.query.notice, req.query.notice_type));
  });

  router.post('/leagues', async (req, res) => {
    const name = String(req.body.name ?? '').trim();
    if (!name) throw new AdminInputError('League name is required.');
    const ownerID = requiredInteger(req.body.owner_id, 'Owner ID');
    const ownerDisplayName = String(req.body.owner_display_name ?? '').trim();
    if (!ownerDisplayName) throw new AdminInputError('Owner display name is required.');
    if (!(await db('users').where({ id: ownerID }).first())) throw new AdminInputError('Owner not found.');
    const gameMode = req.body.game_mode === 'PICK_TWO' ? 'PICK_TWO' : null;
    if (!gameMode) throw new AdminInputError('Unsupported game mode.');
    const league = await db.transaction(async trx => {
      const [created] = await trx('fantasy_leagues').insert({ owner_id: ownerID, name, game_mode: gameMode, sports_league: 'NFL', season: validSeason(req.body.season) }).returning('*');
      await trx('memberships').insert({ user_id: ownerID, league_id: created.id, display_name: ownerDisplayName });
      return created;
    });
    await pg.invalidateLeagueCache(league.id);
    await pg.invalidateMembershipCache(ownerID, league.id, ownerID);
    redirectWithNotice(res, `/admin/leagues/${league.id}`, 'League and owner membership created.');
  });

  router.get('/leagues/:id', async (req, res) => {
    const leagueID = requiredInteger(req.params.id, 'League ID');
    const [league, members, users] = await Promise.all([
      db('fantasy_leagues').where({ id: leagueID }).first(),
      activeMembersQuery(db, leagueID),
      db('users').select('*').orderBy('email')
    ]);
    if (!league) return res.status(404).send(page('League not found', '<p>No league has that ID.</p>'));
    const memberIDs = new Set(members.map(member => String(member.user_id)));
    const availableUsers = users.filter(user => !memberIDs.has(String(user.id)));
    const rows = members.map(member => `<tr><td>${escapeHtml(member.display_name)}</td><td>${escapeHtml(member.email)}</td><td>${escapeHtml(formatTimestamp(member.created_at))}</td></tr>`).join('');
    const addForm = isConcluded(league)
      ? '<p class="warning">This league is concluded; new members cannot be added.</p>'
      : `<form class="form-grid" method="post" action="/admin/leagues/${leagueID}/members">
          <label>User<select name="user_id" required>${availableUsers.map(user => option(user.id, user.email)).join('')}</select></label>
          <label>Display name<input name="display_name" required maxlength="255"></label><button type="submit" ${availableUsers.length ? '' : 'disabled'}>Add member</button>
        </form>`;
    const content = `<p><strong>${escapeHtml(league.name)}</strong> · ${escapeHtml(league.season)} · ${isConcluded(league) ? 'Concluded' : 'Active'}</p>
      <div class="panel"><h2>League week settings</h2><p class="muted">Leave either value blank to use the corresponding environment variable.</p>
        <form class="form-grid" method="post" action="/admin/leagues/${leagueID}/settings">
          <label>Current week<input name="current_week" type="number" min="1" max="25" value="${escapeHtml(league.current_week ?? '')}"></label>
          <label>Revealed week<input name="revealed_week" type="number" min="0" max="25" value="${escapeHtml(league.revealed_week ?? '')}"></label>
          <button type="submit">Save week settings</button>
        </form>
      </div>
      <div class="panel"><h2>Add an existing user</h2>${addForm}</div>
      <div class="table-wrap"><table><thead><tr><th>Display name</th><th>Email</th><th>Joined</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No members.</td></tr>'}</tbody></table></div>`;
    res.send(page('League members', content, req.query.notice, req.query.notice_type));
  });

  router.post('/leagues/:id/settings', async (req, res) => {
    const leagueID = requiredInteger(req.params.id, 'League ID');
    const currentWeek = nullableWeek(req.body.current_week, 'Current week', 1);
    const revealedWeek = nullableWeek(req.body.revealed_week, 'Revealed week', 0);
    const league = await db('fantasy_leagues').where({ id: leagueID }).first();
    if (!league) throw new AdminInputError('League not found.');
    const previousCurrentWeek = effectiveWeek(league.current_week, 'CURRENT_WEEK', 1);
    const previousRevealedWeek = effectiveWeek(league.revealed_week, 'REVEALED_WEEK', 0);
    const nextCurrentWeek = effectiveWeek(currentWeek, 'CURRENT_WEEK', 1);
    const nextRevealedWeek = effectiveWeek(revealedWeek, 'REVEALED_WEEK', 0);
    await db('fantasy_leagues').where({ id: leagueID }).update({
      current_week: currentWeek,
      revealed_week: revealedWeek
    });
    await pg.invalidateLeagueCache(leagueID);
    await pg.invalidateLeaguePicksCache(leagueID);

    const jobs = achievementJobsForWeekSettings(
      previousCurrentWeek,
      previousRevealedWeek,
      nextCurrentWeek,
      nextRevealedWeek
    );

    try {
      const startedJobs = (await Promise.all(jobs.map(job =>
        startAchievementEvaluationJob(job.mode, leagueID, job.week)
      ))).filter(Boolean);
      const jobNotice = startedJobs.length
        ? ` Started ${startedJobs.length} achievement evaluation job${startedJobs.length === 1 ? '' : 's'}.`
        : jobs.length
          ? ' Achievement evaluation was not started because Render job credentials are not configured.'
          : '';
      redirectWithNotice(res, `/admin/leagues/${leagueID}`, `League week settings updated.${jobNotice}`);
    } catch (error) {
      logger.error(error, 'Failed to start achievement evaluation job');
      redirectWithNotice(res, `/admin/leagues/${leagueID}`, 'League week settings updated, but starting the achievement evaluation job failed. Check the service logs.', 'error');
    }
  });

  router.post('/leagues/:id/members', async (req, res) => {
    const leagueID = requiredInteger(req.params.id, 'League ID');
    const userID = requiredInteger(req.body.user_id, 'User ID');
    const displayName = String(req.body.display_name ?? '').trim();
    if (!displayName) throw new AdminInputError('Display name is required.');
    const [league, user, existing] = await Promise.all([
      db('fantasy_leagues').where({ id: leagueID }).first(),
      db('users').where({ id: userID }).first(),
      activeMembersQuery(db, leagueID).where('memberships.user_id', userID).first()
    ]);
    if (!league) throw new AdminInputError('League not found.');
    if (isConcluded(league)) throw new AdminInputError('Users cannot be added to a concluded league.');
    if (!user) throw new AdminInputError('User not found.');
    if (existing) throw new AdminInputError('That user is already a member.');
    await db('memberships').insert({ user_id: userID, league_id: leagueID, display_name: displayName });
    await pg.invalidateMembershipCache(userID, leagueID, league.owner_id);
    redirectWithNotice(res, `/admin/leagues/${leagueID}`, 'Member added.');
  });

  router.get('/users', async (req, res) => {
    const users = await db('users').select('*').orderBy('email');
    const rows = users.map(user => `<tr><td>${escapeHtml(user.id)}</td><td>${escapeHtml(user.email)}</td><td>
      <form class="filters" method="post" action="/admin/users/${user.id}/limited">
        <label><input name="limited" type="checkbox"${user.limited ? ' checked' : ''}> Limited</label><button type="submit">Save</button>
      </form>
    </td></tr>`).join('');
    const content = `<div class="panel"><h2>Create user</h2><form class="form-grid" method="post" action="/admin/users">
      <label>Email<input name="email" type="email" required></label><label><input name="limited" type="checkbox"> Limited</label><button type="submit">Create user</button></form></div>
      <p class="muted">Limited users remain league members but are unavailable as people in message templates.</p>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Email</th><th>Message availability</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    res.send(page('Users', content, req.query.notice, req.query.notice_type));
  });

  router.post('/users', async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (!emailValidator.validate(email)) throw new AdminInputError('Enter a valid email address.');
    await db('users').insert({ email, limited: req.body.limited === 'on' });
    await pg.invalidateUserCache(email);
    redirectWithNotice(res, '/admin/users', 'User created.');
  });

  router.post('/users/:id/limited', async (req, res) => {
    const id = requiredInteger(req.params.id, 'User ID');
    const user = await db('users').where({ id }).first();
    if (!user) throw new AdminInputError('User not found.');
    await db('users').where({ id }).update({ limited: req.body.limited === 'on' });
    await pg.invalidateUserCache(user.email, id);
    redirectWithNotice(res, '/admin/users', 'User message availability updated.');
  });

  router.get('/achievements', async (req, res) => {
    const achievements = await db('achievements').select('*').orderBy('key');
    const rows = achievements.map(achievement => `<tr>
      <td><code>${escapeHtml(achievement.key)}</code></td>
      <td>${escapeHtml(achievement.name)}</td>
      <td>${achievement.icon_id ? `<iconify-icon icon="${escapeHtml(achievement.icon_id)}" mode="svg" width="1.5em" height="1.5em" aria-label="${escapeHtml(achievement.name)}"></iconify-icon> <code>${escapeHtml(achievement.icon_id)}</code>` : '<span class="muted">—</span>'}</td>
      <td>${achievement.active ? 'Active' : 'Inactive'}</td>
      <td><a href="/admin/achievements/${achievement.id}/edit">Edit</a></td>
    </tr>`).join('');
    const content = `<p class="muted">Achievement keys and evaluation settings are read-only here.</p>
      <div class="table-wrap"><table><thead><tr><th>Key</th><th>Name</th><th>Icon ID</th><th>Status</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No achievements found.</td></tr>'}</tbody></table></div>`;
    res.send(page('Achievements', content, req.query.notice, req.query.notice_type));
  });

  router.get('/achievements/:id/edit', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Achievement ID');
    const achievement = await db('achievements').where({ id }).first();
    if (!achievement) return res.status(404).send(page('Achievement not found', '<p>No achievement has that ID.</p>'));
    res.send(page(`Edit achievement ${achievement.name}`, achievementForm(achievement), req.query.notice, req.query.notice_type));
  });

  router.post('/achievements/:id', async (req, res) => {
    const id = requiredInteger(req.params.id, 'Achievement ID');
    if (!(await db('achievements').where({ id }).first())) throw new AdminInputError('Achievement not found.');
    const name = String(req.body.name ?? '').trim();
    const description = String(req.body.description ?? '').trim();
    const iconID = validIconID(req.body.icon_id);
    if (!name) throw new AdminInputError('Achievement name is required.');
    if (name.length > 255) throw new AdminInputError('Achievement name must be 255 characters or fewer.');
    if (!description) throw new AdminInputError('Achievement description is required.');
    if (description.length > 10000) throw new AdminInputError('Achievement description must be 10,000 characters or fewer.');
    await db('achievements').where({ id }).update({
      name,
      description,
      icon_id: iconID,
      active: req.body.active === 'on'
    });
    redirectWithNotice(res, `/admin/achievements/${id}/edit`, 'Achievement updated.');
  });

  router.use((err, req, res, next) => {
    logger.error?.(err);
    const knownDatabaseError = err.code === '23505' ? 'That record already exists.' : null;
    const message = err instanceof AdminInputError ? err.message : knownDatabaseError;
    const status = message ? 400 : 500;
    res.status(status).send(page('Admin error', `<div class="notice error">${escapeHtml(message || 'The operation failed. Check the server logs.')}</div><p><a href="${escapeHtml(req.get('referer') || '/admin')}">Go back</a></p>`));
  });

  return router;
}

function activeMembersQuery(db, leagueID) {
  return db('memberships')
    .join('users', 'users.id', 'memberships.user_id')
    .where('memberships.league_id', leagueID)
    .whereNull('memberships.revoked_at')
    .select('memberships.*', 'users.email')
    .orderBy('memberships.display_name');
}

function validMessageTemplateFormat(value, slots) {
  const format = String(value ?? '');
  if (!format.trim()) throw new AdminInputError('Message template text is required.');
  if (format.length > 10000) throw new AdminInputError('Message template text must be 10,000 characters or fewer.');

  const placeholderPattern = /\{([A-Za-z0-9_]+)\}/g;
  const placeholders = [...format.matchAll(placeholderPattern)].map(match => match[1]);
  const staticText = format.replace(placeholderPattern, '');
  if (staticText.includes('{') || staticText.includes('}')) {
    throw new AdminInputError('Dynamic placeholders must use the form {slot_key}.');
  }

  const expected = slots.map(slot => slot.key).sort();
  const actual = [...placeholders].sort();
  if (expected.length !== actual.length || expected.some((key, index) => key !== actual[index])) {
    const requiredPlaceholders = expected.map(key => `{${key}}`).join(', ') || 'none';
    throw new AdminInputError(`Keep each dynamic placeholder exactly once: ${requiredPlaceholders}.`);
  }
  return format;
}

function validMessageValueKind(value) {
  if (value === 'catalog_value' || value === 'adjective') return value;
  throw new AdminInputError('Choose either the catalog or adjective list.');
}

function validMessageValueText(value) {
  const text = String(value ?? '').trim();
  if (!text) throw new AdminInputError('Message value text is required.');
  if (text.length > 255) throw new AdminInputError('Message value text must be 255 characters or fewer.');
  return text;
}

async function nextMessageValueKey(db, text) {
  const base = text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!base) throw new AdminInputError('Message value text must include at least one letter or number.');

  for (let suffix = 1; suffix <= 1000; suffix += 1) {
    const key = suffix === 1 ? base : `${base}_${suffix}`;
    if (!(await db('message_values').where({ key }).first())) return key;
  }
  throw new AdminInputError('Could not generate a unique key for that message value.');
}

async function validateGamePayload(db, body) {
  const away = String(body.away_team_short_name ?? '').trim().toUpperCase();
  const home = String(body.home_team_short_name ?? '').trim().toUpperCase();
  if (!away || !home || away === home) throw new AdminInputError('Choose two different teams.');
  const teams = await db('teams').whereIn('short_name', [away, home]).select('short_name');
  if (new Set(teams.map(team => team.short_name)).size !== 2) throw new AdminInputError('One or both teams were not found.');
  const awayScore = nullableScore(body.away_team_score, 'Away score');
  const homeScore = nullableScore(body.home_team_score, 'Home score');
  if ((awayScore === null) !== (homeScore === null)) {
    throw new AdminInputError('Enter both scores or leave both scores blank.');
  }
  return {
    season: validSeason(body.season),
    week: requiredInteger(body.week, 'Week', 1, 25),
    start_time: validTimestamp(body.start_time),
    away_team_short_name: away,
    home_team_short_name: home,
    away_team_score: awayScore,
    home_team_score: homeScore,
    sports_league: 'NFL'
  };
}

async function parseScheduleCsv(db, seasonValue, csvValue) {
  const season = validSeason(seasonValue);
  const csvText = String(csvValue ?? '');
  let sourceRows;
  try {
    sourceRows = parseCsv(csvText, { trim: true, skip_empty_lines: true });
  } catch (err) {
    throw new AdminInputError(`CSV could not be parsed: ${err.message}`);
  }
  if (sourceRows.length > 400) throw new AdminInputError('A schedule import is limited to 400 CSV rows.');
  if (sourceRows[0] && String(sourceRows[0][0]).toLowerCase() === 'week') sourceRows = sourceRows.slice(1);
  const teamNames = new Set((await db('teams').select('short_name')).map(row => row.short_name));
  const rows = sourceRows.map(source => {
    let error;
    if (source.length !== 4) error = 'Expected four columns.';
    const [weekValue, startTime, awayValue, homeValue] = source;
    const away = String(awayValue ?? '').toUpperCase();
    const home = String(homeValue ?? '').toUpperCase();
    let week;
    let start;
    try {
      week = requiredInteger(weekValue, 'Week', 1, 25);
      start = validTimestamp(startTime);
      if (away === home) throw new AdminInputError('Away and home teams must differ.');
      if (!teamNames.has(away) || !teamNames.has(home)) throw new AdminInputError('Unknown team abbreviation.');
    } catch (err) {
      error = error || err.message;
    }
    return {
      source,
      error,
      game: error ? null : {
        season,
        week,
        start_time: start,
        away_team_short_name: away,
        home_team_short_name: home,
        away_team_score: null,
        home_team_score: null,
        sports_league: 'NFL'
      }
    };
  });
  return { season, csvText, rows };
}

function gameKey(game) {
  return [
    String(game.season),
    String(game.week),
    formatTimestamp(game.start_time),
    game.away_team_short_name,
    game.home_team_short_name
  ].join('|');
}

function gameForm(game, teams, action, submitLabel, tags = []) {
  const season = game?.season ?? process.env.CURRENT_SEASON ?? '';
  const teamOptions = selected => teams.map(team => option(team.short_name, `${team.name} (${team.short_name})`, selected)).join('');
  const tagHtml = game
    ? `<div class="panel"><h2>Game tags</h2><p class="muted">Each action adds or removes one tag.</p>
        <p>${tags.length ? tags.map(row => `<form style="display:inline" method="post" action="/admin/games/${game.id}/tags/${encodeURIComponent(row.tag)}/remove" onsubmit="return confirm('Remove this tag?')"><button type="submit">${escapeHtml(row.tag)} ×</button></form>`).join(' ') : '<span class="muted">No tags</span>'}</p>
        <form class="form-grid" method="post" action="/admin/games/${game.id}/tags"><label>Add tag<input name="tag" pattern="[a-z][a-z0-9_]*" maxlength="64" required placeholder="thanksgiving"></label><button type="submit">Add tag</button></form>
      </div>`
    : '';
  return `<div class="panel"><form class="form-grid" method="post" action="${escapeHtml(action)}">
    <label>Season<input name="season" pattern="[0-9]{4}" required value="${escapeHtml(season)}"></label>
    <label>Week<input name="week" type="number" min="1" max="25" required value="${escapeHtml(game?.week ?? '')}"></label>
    <label>Start time with timezone<input name="start_time" size="32" required value="${escapeHtml(formatTimestamp(game?.start_time))}" placeholder="2026-09-10T20:20:00-04:00"></label>
    <label>Away team<select name="away_team_short_name" required>${teamOptions(game?.away_team_short_name)}</select></label>
    <label>Home team<select name="home_team_short_name" required>${teamOptions(game?.home_team_short_name)}</select></label>
    <label>Away score<input name="away_team_score" type="number" min="0" value="${escapeHtml(game?.away_team_score ?? '')}"></label>
    <label>Home score<input name="home_team_score" type="number" min="0" value="${escapeHtml(game?.home_team_score ?? '')}"></label>
    <button type="submit">${escapeHtml(submitLabel)}</button>
  </form></div>${tagHtml}<p><a href="/admin/games?season=${escapeHtml(season)}">Back to games</a></p>`;
}

function achievementForm(achievement) {
  return `<div class="panel"><form method="post" action="/admin/achievements/${achievement.id}">
    <p><strong>Key:</strong> <code>${escapeHtml(achievement.key)}</code></p>
    <p><strong>Evaluator:</strong> <code>${escapeHtml(achievement.evaluator)}</code> · <strong>Phase:</strong> <code>${escapeHtml(achievement.evaluation_phase)}</code> · <strong>Scope:</strong> <code>${escapeHtml(achievement.scope)}</code></p>
    <label>Name<input name="name" maxlength="255" required value="${escapeHtml(achievement.name)}"></label>
    <label>Description<textarea name="description" maxlength="10000" required>${escapeHtml(achievement.description)}</textarea></label>
    <label>Iconify ID<input name="icon_id" maxlength="255" value="${escapeHtml(achievement.icon_id ?? '')}" placeholder="tabler:number-33-small"></label>
    <label><input name="active" type="checkbox"${achievement.active ? ' checked' : ''}> Active</label>
    <button type="submit">Save achievement</button>
  </form></div><p><a href="/admin/achievements">Back to achievements</a></p>`;
}

function messageTemplateForm(template, slots) {
  const placeholders = slots.map(slot => `<code>{${escapeHtml(slot.key)}}</code> (${escapeHtml(slot.prompt || slot.key)})`).join(', ');
  return `<div class="panel"><form method="post" action="/admin/messages/templates/${template.id}">
    <p><strong>Template key:</strong> <code>${escapeHtml(template.key)}</code></p>
    <p class="muted">Keep each dynamic placeholder exactly once. You can change any surrounding wording and punctuation.</p>
    <p><strong>Required placeholders:</strong> ${placeholders || '<span class="muted">None</span>'}</p>
    <label>Template text<textarea name="format" maxlength="10000" required>${escapeHtml(template.format)}</textarea></label>
    <button type="submit">Save template text</button>
  </form></div><p><a href="/admin/messages/templates">Back to message templates</a></p>`;
}

function scheduleForm(season = process.env.CURRENT_SEASON ?? '', csv = '') {
  return `<div class="panel"><p>Paste CSV with four columns: <code>week,start_time,away_team_short_name,home_team_short_name</code>. A header row is optional.</p>
    <form method="post" action="/admin/schedule/preview"><label>Season<input name="season" pattern="[0-9]{4}" required value="${escapeHtml(season)}"></label>
      <label>CSV<textarea name="csv" required placeholder="1,2026-09-10T20:20:00-04:00,DAL,PHI">${escapeHtml(csv)}</textarea></label>
      <button type="submit">Preview schedule</button></form></div>`;
}

module.exports = {
  AdminInputError,
  achievementJobsForWeekSettings,
  adminAuthentication,
  createAdminRouter,
  parseScheduleCsv,
  parseBasicAuthorization,
  validMessageTemplateFormat,
  validMessageValueKind,
  validMessageValueText
};
