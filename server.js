const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory exists
if (!fs.existsSync('./data')) fs.mkdirSync('./data');

const db = new Database('./data/survivor.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS cast_members (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL UNIQUE,
    tribe            TEXT    DEFAULT '',
    is_active        INTEGER DEFAULT 1,
    eliminated_week  INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS game_players (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL UNIQUE,
    is_active        INTEGER DEFAULT 1,
    eliminated_week  INTEGER,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS weeks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    week_number    INTEGER UNIQUE NOT NULL,
    picks_allowed  INTEGER DEFAULT 1,
    is_current     INTEGER DEFAULT 0,
    completed      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS picks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    game_player_id  INTEGER NOT NULL,
    cast_member_id  INTEGER NOT NULL,
    week_number     INTEGER NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_player_id, cast_member_id),
    FOREIGN KEY (game_player_id) REFERENCES game_players(id),
    FOREIGN KEY (cast_member_id) REFERENCES cast_members(id)
  );
`);

// Seed defaults
const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
setSetting.run('admin_password', 'survivor50');
setSetting.run('season_name', 'Survivor 50');
setSetting.run('season_subtitle', 'Prediction Pool');

const insertWeek = db.prepare('INSERT OR IGNORE INTO weeks (week_number, picks_allowed, is_current) VALUES (?, ?, ?)');
insertWeek.run(1, 1, 1);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCurrentWeek() {
  return db.prepare('SELECT * FROM weeks WHERE is_current = 1').get();
}

function getFullState() {
  const currentWeek = getCurrentWeek() || { week_number: 1, picks_allowed: 1 };

  const castMembers = db.prepare(`
    SELECT * FROM cast_members ORDER BY is_active DESC, name ASC
  `).all();

  const gamePlayers = db.prepare(`
    SELECT * FROM game_players ORDER BY is_active DESC, name ASC
  `).all();

  const allWeeks = db.prepare(`
    SELECT * FROM weeks ORDER BY week_number ASC
  `).all();

  // All picks with joined names
  const allPicks = db.prepare(`
    SELECT p.*, gp.name as player_name, cm.name as cast_name, cm.is_active as cast_is_active
    FROM picks p
    JOIN game_players gp ON p.game_player_id = gp.id
    JOIN cast_members cm ON p.cast_member_id = cm.id
    ORDER BY p.week_number ASC, gp.name ASC
  `).all();

  return { currentWeek, castMembers, gamePlayers, allWeeks, allPicks };
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Full state for the landing page
app.get('/api/state', (req, res) => {
  res.json(getFullState());
});

// Available picks for a specific game player (cast members not yet picked)
app.get('/api/available-picks/:gamePlayerId', (req, res) => {
  const { gamePlayerId } = req.params;
  const currentWeek = getCurrentWeek();
  if (!currentWeek) return res.status(400).json({ error: 'No current week set' });
  if (currentWeek.completed) return res.status(400).json({ error: 'Current week is already completed' });

  const player = db.prepare('SELECT * FROM game_players WHERE id = ?').get(gamePlayerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (!player.is_active) return res.status(400).json({ error: 'Player is eliminated from the pool' });

  // Check if player already has a pick this week
  const existingPick = db.prepare(
    'SELECT p.*, cm.name as cast_name FROM picks p JOIN cast_members cm ON p.cast_member_id = cm.id WHERE p.game_player_id = ? AND p.week_number = ?'
  ).get(gamePlayerId, currentWeek.week_number);

  // How many picks has this player made this week
  const picksThisWeek = db.prepare(
    'SELECT COUNT(*) as cnt FROM picks WHERE game_player_id = ? AND week_number = ?'
  ).get(gamePlayerId, currentWeek.week_number);

  const picksMadeThisWeek = picksThisWeek.cnt;
  const picksRemaining = currentWeek.picks_allowed - picksMadeThisWeek;

  // Cast members still active AND not yet picked by this player
  const available = db.prepare(`
    SELECT cm.* FROM cast_members cm
    WHERE cm.is_active = 1
      AND cm.id NOT IN (
        SELECT cast_member_id FROM picks WHERE game_player_id = ?
      )
    ORDER BY cm.name ASC
  `).all(gamePlayerId);

  res.json({
    player,
    currentWeek,
    available,
    picksThisWeek: picksMadeThisWeek,
    picksRemaining,
    existingPicks: db.prepare(`
      SELECT p.*, cm.name as cast_name FROM picks p
      JOIN cast_members cm ON p.cast_member_id = cm.id
      WHERE p.game_player_id = ? AND p.week_number = ?
    `).all(gamePlayerId, currentWeek.week_number)
  });
});

// Submit a pick
app.post('/api/picks', (req, res) => {
  const { gamePlayerId, castMemberId } = req.body;
  if (!gamePlayerId || !castMemberId) {
    return res.status(400).json({ error: 'Missing gamePlayerId or castMemberId' });
  }

  const currentWeek = getCurrentWeek();
  if (!currentWeek) return res.status(400).json({ error: 'No current week configured' });
  if (currentWeek.completed) return res.status(400).json({ error: 'This week is already closed' });

  const player = db.prepare('SELECT * FROM game_players WHERE id = ?').get(gamePlayerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (!player.is_active) return res.status(400).json({ error: 'You have been eliminated from the pool' });

  const castMember = db.prepare('SELECT * FROM cast_members WHERE id = ?').get(castMemberId);
  if (!castMember) return res.status(404).json({ error: 'Cast member not found' });
  if (!castMember.is_active) return res.status(400).json({ error: 'That Survivor has already been voted out' });

  // Check player hasn't already picked this cast member
  const alreadyPicked = db.prepare(
    'SELECT id FROM picks WHERE game_player_id = ? AND cast_member_id = ?'
  ).get(gamePlayerId, castMemberId);
  if (alreadyPicked) return res.status(400).json({ error: 'You already picked that Survivor in a previous week' });

  // Check picks allowed this week
  const picksThisWeek = db.prepare(
    'SELECT COUNT(*) as cnt FROM picks WHERE game_player_id = ? AND week_number = ?'
  ).get(gamePlayerId, currentWeek.week_number);

  if (picksThisWeek.cnt >= currentWeek.picks_allowed) {
    return res.status(400).json({ error: `You have already made your ${currentWeek.picks_allowed} pick(s) for this week` });
  }

  try {
    const insert = db.prepare(
      'INSERT INTO picks (game_player_id, cast_member_id, week_number) VALUES (?, ?, ?)'
    );
    const result = insert.run(gamePlayerId, castMemberId, currentWeek.week_number);
    res.json({ success: true, pickId: result.lastInsertRowid, message: `Pick submitted: ${player.name} → ${castMember.name}` });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Pick already exists' });
    }
    throw err;
  }
});

// ─── Admin API ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  const password = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get()?.value;
  const provided = req.headers['x-admin-password'] || req.body?.adminPassword;
  if (provided !== password) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Get settings
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

// Update settings (season name, subtitle, password)
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { season_name, season_subtitle, admin_password } = req.body;
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (season_name !== undefined) update.run('season_name', season_name);
  if (season_subtitle !== undefined) update.run('season_subtitle', season_subtitle);
  if (admin_password !== undefined && admin_password.length >= 4) update.run('admin_password', admin_password);
  res.json({ success: true });
});

// Add a cast member
app.post('/api/admin/cast', requireAdmin, (req, res) => {
  const { name, tribe } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const r = db.prepare('INSERT INTO cast_members (name, tribe) VALUES (?, ?)').run(name.trim(), tribe?.trim() || '');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Cast member already exists' });
    throw err;
  }
});

// Update a cast member
app.put('/api/admin/cast/:id', requireAdmin, (req, res) => {
  const { name, tribe } = req.body;
  const { id } = req.params;
  db.prepare('UPDATE cast_members SET name = COALESCE(?, name), tribe = COALESCE(?, tribe) WHERE id = ?')
    .run(name || null, tribe !== undefined ? tribe : null, id);
  res.json({ success: true });
});

// Delete a cast member (only if no picks reference them)
app.delete('/api/admin/cast/:id', requireAdmin, (req, res) => {
  const picks = db.prepare('SELECT COUNT(*) as cnt FROM picks WHERE cast_member_id = ?').get(req.params.id);
  if (picks.cnt > 0) return res.status(400).json({ error: 'Cannot delete — picks reference this cast member' });
  db.prepare('DELETE FROM cast_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Eliminate a cast member (vote them out)
app.post('/api/admin/cast/:id/eliminate', requireAdmin, (req, res) => {
  const { week } = req.body;
  const castMember = db.prepare('SELECT * FROM cast_members WHERE id = ?').get(req.params.id);
  if (!castMember) return res.status(404).json({ error: 'Cast member not found' });

  const eliminationWeek = week || getCurrentWeek()?.week_number || 1;

  db.prepare('UPDATE cast_members SET is_active = 0, eliminated_week = ? WHERE id = ?')
    .run(eliminationWeek, req.params.id);

  // Eliminate game players who picked this cast member this week
  const affectedPicks = db.prepare(`
    SELECT p.game_player_id, gp.name as player_name
    FROM picks p
    JOIN game_players gp ON p.game_player_id = gp.id
    WHERE p.cast_member_id = ? AND p.week_number = ? AND gp.is_active = 1
  `).all(req.params.id, eliminationWeek);

  const eliminatePlayer = db.prepare(
    'UPDATE game_players SET is_active = 0, eliminated_week = ? WHERE id = ?'
  );

  const eliminatedPlayers = [];
  for (const pick of affectedPicks) {
    eliminatePlayer.run(eliminationWeek, pick.game_player_id);
    eliminatedPlayers.push(pick.player_name);
  }

  res.json({
    success: true,
    castEliminated: castMember.name,
    poolPlayersEliminated: eliminatedPlayers
  });
});

// Restore a cast member (if voted out by mistake)
app.post('/api/admin/cast/:id/restore', requireAdmin, (req, res) => {
  db.prepare('UPDATE cast_members SET is_active = 1, eliminated_week = NULL WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Add a game player
app.post('/api/admin/players', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const r = db.prepare('INSERT INTO game_players (name) VALUES (?)').run(name.trim());
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Player already exists' });
    throw err;
  }
});

// Delete a game player (only if no picks)
app.delete('/api/admin/players/:id', requireAdmin, (req, res) => {
  const picks = db.prepare('SELECT COUNT(*) as cnt FROM picks WHERE game_player_id = ?').get(req.params.id);
  if (picks.cnt > 0) return res.status(400).json({ error: 'Cannot delete — this player has picks recorded' });
  db.prepare('DELETE FROM game_players WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Restore a game player
app.post('/api/admin/players/:id/restore', requireAdmin, (req, res) => {
  db.prepare('UPDATE game_players SET is_active = 1, eliminated_week = NULL WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Manage weeks
app.get('/api/admin/weeks', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM weeks ORDER BY week_number').all());
});

// Add or update a week
app.post('/api/admin/weeks', requireAdmin, (req, res) => {
  const { week_number, picks_allowed } = req.body;
  if (!week_number) return res.status(400).json({ error: 'week_number is required' });
  db.prepare(`
    INSERT INTO weeks (week_number, picks_allowed, is_current)
    VALUES (?, ?, 0)
    ON CONFLICT(week_number) DO UPDATE SET picks_allowed = excluded.picks_allowed
  `).run(week_number, picks_allowed || 1);
  res.json({ success: true });
});

// Set current week
app.post('/api/admin/weeks/:weekNumber/set-current', requireAdmin, (req, res) => {
  const wn = parseInt(req.params.weekNumber);
  // Ensure the week exists
  db.prepare('INSERT OR IGNORE INTO weeks (week_number, picks_allowed, is_current) VALUES (?, 1, 0)').run(wn);
  db.prepare('UPDATE weeks SET is_current = 0').run();
  db.prepare('UPDATE weeks SET is_current = 1 WHERE week_number = ?').run(wn);
  res.json({ success: true });
});

// Mark week as completed / open
app.post('/api/admin/weeks/:weekNumber/complete', requireAdmin, (req, res) => {
  const { completed } = req.body;
  db.prepare('UPDATE weeks SET completed = ? WHERE week_number = ?')
    .run(completed ? 1 : 0, req.params.weekNumber);
  res.json({ success: true });
});

// Delete a pick (admin correction)
app.delete('/api/admin/picks/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM picks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin: add a pick manually (for corrections)
app.post('/api/admin/picks', requireAdmin, (req, res) => {
  const { gamePlayerId, castMemberId, weekNumber } = req.body;
  try {
    const r = db.prepare(
      'INSERT INTO picks (game_player_id, cast_member_id, week_number) VALUES (?, ?, ?)'
    ).run(gamePlayerId, castMemberId, weekNumber);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Pick already exists' });
    throw err;
  }
});

// Get season settings (public, for page title etc.)
app.get('/api/season', (req, res) => {
  const rows = db.prepare("SELECT * FROM settings WHERE key IN ('season_name','season_subtitle')").all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

// Catch-all: serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Survivor Pool running at http://localhost:${PORT}`);
  console.log(`Admin password: ${db.prepare("SELECT value FROM settings WHERE key='admin_password'").get().value}`);
});
