const crypto = require('crypto');
const express = require('express');
const emailValidator = require('email-validator');
const parseCsv = require('csv-parse/lib/sync');

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
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

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
</head>
<body>
  <header><strong>Metagame admin</strong><nav>
    <a href="/admin/games">Games & scores</a>
    <a href="/admin/schedule">Schedule import</a>
    <a href="/admin/picks">Picks</a>
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

function validSeason(value) {
  const season = String(value ?? '').trim();
  if (!/^\d{4}$/.test(season)) throw new AdminInputError('Season must be a four-digit year.');
  return Number(season);
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
    const [game, teams] = await Promise.all([
      db('sports_games').where({ id }).first(),
      db('teams').select('*').orderBy('short_name')
    ]);
    if (!game) return res.status(404).send(page('Game not found', '<p>No game has that ID.</p>'));
    const content = gameForm(game, teams, `/admin/games/${id}`, 'Save game');
    res.send(page(`Edit game ${id}`, content, req.query.notice, req.query.notice_type));
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
      <div class="panel"><h2>Add an existing user</h2>${addForm}</div>
      <div class="table-wrap"><table><thead><tr><th>Display name</th><th>Email</th><th>Joined</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No members.</td></tr>'}</tbody></table></div>`;
    res.send(page('League members', content, req.query.notice, req.query.notice_type));
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
    const rows = users.map(user => `<tr><td>${escapeHtml(user.id)}</td><td>${escapeHtml(user.email)}</td></tr>`).join('');
    const content = `<div class="panel"><h2>Create user</h2><form class="form-grid" method="post" action="/admin/users">
      <label>Email<input name="email" type="email" required></label><button type="submit">Create user</button></form></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Email</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    res.send(page('Users', content, req.query.notice, req.query.notice_type));
  });

  router.post('/users', async (req, res) => {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (!emailValidator.validate(email)) throw new AdminInputError('Enter a valid email address.');
    await db('users').insert({ email });
    await pg.invalidateUserCache(email);
    redirectWithNotice(res, '/admin/users', 'User created.');
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

function gameForm(game, teams, action, submitLabel) {
  const season = game?.season ?? process.env.CURRENT_SEASON ?? '';
  const teamOptions = selected => teams.map(team => option(team.short_name, `${team.name} (${team.short_name})`, selected)).join('');
  return `<div class="panel"><form class="form-grid" method="post" action="${escapeHtml(action)}">
    <label>Season<input name="season" pattern="[0-9]{4}" required value="${escapeHtml(season)}"></label>
    <label>Week<input name="week" type="number" min="1" max="25" required value="${escapeHtml(game?.week ?? '')}"></label>
    <label>Start time with timezone<input name="start_time" size="32" required value="${escapeHtml(formatTimestamp(game?.start_time))}" placeholder="2026-09-10T20:20:00-04:00"></label>
    <label>Away team<select name="away_team_short_name" required>${teamOptions(game?.away_team_short_name)}</select></label>
    <label>Home team<select name="home_team_short_name" required>${teamOptions(game?.home_team_short_name)}</select></label>
    <label>Away score<input name="away_team_score" type="number" min="0" value="${escapeHtml(game?.away_team_score ?? '')}"></label>
    <label>Home score<input name="home_team_score" type="number" min="0" value="${escapeHtml(game?.home_team_score ?? '')}"></label>
    <button type="submit">${escapeHtml(submitLabel)}</button>
  </form></div><p><a href="/admin/games?season=${escapeHtml(season)}">Back to games</a></p>`;
}

function scheduleForm(season = process.env.CURRENT_SEASON ?? '', csv = '') {
  return `<div class="panel"><p>Paste CSV with four columns: <code>week,start_time,away_team_short_name,home_team_short_name</code>. A header row is optional.</p>
    <form method="post" action="/admin/schedule/preview"><label>Season<input name="season" pattern="[0-9]{4}" required value="${escapeHtml(season)}"></label>
      <label>CSV<textarea name="csv" required placeholder="1,2026-09-10T20:20:00-04:00,DAL,PHI">${escapeHtml(csv)}</textarea></label>
      <button type="submit">Preview schedule</button></form></div>`;
}

module.exports = {
  AdminInputError,
  adminAuthentication,
  createAdminRouter,
  parseScheduleCsv,
  parseBasicAuthorization
};
