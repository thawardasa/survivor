const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const https = require('https');

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
    age              INTEGER,
    hometown         TEXT    DEFAULT '',
    photo_url        TEXT    DEFAULT '',
    wikipedia_slug   TEXT    DEFAULT '',
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

// Migrate: add new columns to game_players
for (const sql of [
  'ALTER TABLE game_players ADD COLUMN photo_url TEXT DEFAULT ""',
  'ALTER TABLE game_players ADD COLUMN age INTEGER',
  'ALTER TABLE game_players ADD COLUMN hometown TEXT DEFAULT ""',
  'ALTER TABLE game_players ADD COLUMN super_survivor_cast_id INTEGER',
]) { try { db.exec(sql); } catch (_) {} }

// Migrate: add new columns to cast_members
for (const sql of [
  'ALTER TABLE cast_members ADD COLUMN age INTEGER',
  'ALTER TABLE cast_members ADD COLUMN hometown TEXT DEFAULT ""',
  'ALTER TABLE cast_members ADD COLUMN photo_url TEXT DEFAULT ""',
  'ALTER TABLE cast_members ADD COLUMN wikipedia_slug TEXT DEFAULT ""',
  'ALTER TABLE cast_members ADD COLUMN occupation TEXT DEFAULT ""',
]) { try { db.exec(sql); } catch (_) {} }

// ─── Seed Defaults ────────────────────────────────────────────────────────────
const setSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
setSetting.run('admin_password', 'survivor50');
setSetting.run('season_name', 'Survivor 50: In the Hands of the Fans');
setSetting.run('season_subtitle', 'Prediction Pool');

const insertWeek = db.prepare('INSERT OR IGNORE INTO weeks (week_number, picks_allowed, is_current) VALUES (?, ?, ?)');
insertWeek.run(1, 1, 0);
insertWeek.run(2, 2, 0);
insertWeek.run(3, 1, 1);

// ─── Seed Survivor 50 Cast ────────────────────────────────────────────────────
// Data from official CBS cast photo + Wikipedia. Updated through Ep 2 (Mar 4 2026).
// [name, tribe, age, hometown, wikipedia_slug, occupation, is_active, eliminated_week]
const castSeed = [
  // CILA TRIBE (Orange)
  ['Christian Hubicki',          'Cila', 39, 'Tallahassee, FL',     'Christian_Hubicki',         'Robotics professor',         1, null],
  ['Cirie Fields',               'Cila', 55, 'Jersey City, NJ',     'Cirie_Fields',              'Registered nurse',           1, null],
  ['Emily Flippen',              'Cila', 30, 'Laurel, MD',          'Emily_Flippen',             'Investment analyst',         1, null],
  ['Joe Hunter',                 'Cila', 46, 'West Sacramento, CA', 'Joe_Hunter_(Survivor)',      'Fire captain',               1, null],
  ['Ozzy Lusth',                 'Cila', 43, 'Guanajuato, Mexico',  'Oscar_Lusth',               'Restaurant owner',           1, null],
  ['Rick Devens',                'Cila', 41, 'Macon, GA',           'Rick_Devens',               'College professor',          1, null],
  ['Savannah Louie',             'Cila', 31, 'Atlanta, GA',         'Savannah_Louie',            'Marketing specialist',       0,    2],
  ['Jenna Lewis-Dougherty',      'Cila', 47, 'Woodland, CA',        'Jenna_Lewis_(Survivor)',    'Realtor',                    0,    1],
  // KALO TRIBE (Teal)
  ['Charlie Davis',              'Kalo', 27, 'Boston, MA',          'Charlie_Davis_(Survivor)',   'Attorney',                   1, null],
  ['Chrissy Hofbeck',            'Kalo', 54, 'The Villages, FL',    'Chrissy_Hofbeck',           'Actuary',                    1, null],
  ['Coach Wade',                 'Kalo', 53, 'Susanville, CA',      'Benjamin_Wade_(Survivor)',  'Music teacher and coach',    1, null],
  ['Dee Valladares',             'Kalo', 28, 'Miami, FL',           'Dee_Valladares',            'Entrepreneur',               1, null],
  ['Jonathan Young',             'Kalo', 32, 'Gulf Shores, AL',     'Jonathan_Young_(Survivor)', 'Beach service owner',        1, null],
  ['Kamilla Karthigesu',         'Kalo', 31, 'Foster City, CA',     'Kamilla_Karthigesu',        'Software engineer',          1, null],
  ['Mike White',                 'Kalo', 54, 'Hanalei, HI',         'Mike_White_(filmmaker)',    'Writer/director',            1, null],
  ['Tiffany Nicole Ervin',       'Kalo', 34, 'Los Angeles, CA',     'Tiffany_Ervin',             'Artist/Creative producer',   1, null],
  // VATU TRIBE (Pink/Magenta)
  ['Angelina Keeley',            'Vatu', 35, 'San Diego, CA',       'Angelina_Keeley',           'Entrepreneur',               1, null],
  ['Aubry Bracco',               'Vatu', 39, 'Hampton Falls, NH',   'Aubry_Bracco',              'Marketer',                   1, null],
  ['Colby Donaldson',            'Vatu', 51, 'Austin, TX',          'Colby_Donaldson',           'Rancher/Welder',             1, null],
  ['Genevieve Mushaluk',         'Vatu', 34, 'Winnipeg, MB',        'Genevieve_Mushaluk',        'Lawyer',                     1, null],
  ['Q Burdette',                 'Vatu', 31, 'Germantown, TN',      'Quintavius_Burdette',       'Real estate broker',         1, null],
  ['Rizo Velovic',               'Vatu', 26, 'Yonkers, NY',         'Rizo_Velovic',              'Tech sales',                 1, null],
  ['Stephenie LaGrossa Kendrick','Vatu', 45, 'Dunedin, FL',         'Stephenie_LaGrossa',        'Mom of three',               1, null],
  ['Kyle Fraser',                'Vatu', 31, 'Brooklyn, NY',        'Kyle_Fraser_(Survivor)',    'Defense attorney',           0,    1],
];

const insertCast = db.prepare(
  'INSERT OR IGNORE INTO cast_members (name, tribe, age, hometown, wikipedia_slug, occupation, is_active, eliminated_week) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
);
const updateCastInfo = db.prepare(`
  UPDATE cast_members
  SET tribe = ?,
      age = COALESCE(?, age),
      hometown = CASE WHEN ? != '' AND (hometown = '' OR hometown IS NULL) THEN ? ELSE hometown END,
      wikipedia_slug = CASE WHEN ? != '' AND (wikipedia_slug = '' OR wikipedia_slug IS NULL) THEN ? ELSE wikipedia_slug END,
      occupation = CASE WHEN ? != '' AND (occupation = '' OR occupation IS NULL) THEN ? ELSE occupation END
  WHERE name = ?
`);

for (const [name, tribe, age, hometown, wikipedia_slug, occupation, is_active, eliminated_week] of castSeed) {
  insertCast.run(name, tribe, age, hometown, wikipedia_slug, occupation, is_active, eliminated_week);
  updateCastInfo.run(tribe, age, hometown, hometown, wikipedia_slug, wikipedia_slug, occupation, occupation, name);
}

// ─── Seed Pool Players ────────────────────────────────────────────────────────
// Data from prediction pool spreadsheet
// [name, is_active, eliminated_week, age, hometown]
const playerSeed = [
  ['Jenna',    1, null,  40, 'Robbinsville, NJ'],
  ['Marissa',  1, null,  32, 'West Windsor, NJ'],
  ['Anna D',   1, null,  32, 'Bensalem, PA'],
  ['Greg',     1, null,  31, 'Huntingdon Valley, PA'],
  ['Jason',    1, null,  38, 'West Windsor, NJ'],
  ['Mason',    1, null,  31, 'St. Georges, DE'],
  ['Fish',     1, null,  31, 'Hartsdale, NY'],
  ['Emily',    1, null,  32, 'Allentown, PA'],
  ['AT',       1, null,  31, 'Brentwood, TN'],
  ['Anna F',   1, null,  31, 'Northfield, IL'],
  ['Michael',  1, null,  31, 'West Windsor, NJ'],
  ['Natalie',  0, 1,     32, 'Tacoma, WA'],  // Eliminated Ep1 — picked Kyle Fraser (med-evac)
];

const insertPlayer = db.prepare(
  'INSERT OR IGNORE INTO game_players (name, is_active, eliminated_week, age, hometown) VALUES (?, ?, ?, ?, ?)'
);
const updatePlayerInfo = db.prepare(`
  UPDATE game_players
  SET age = COALESCE(age, ?),
      hometown = CASE WHEN hometown = '' OR hometown IS NULL THEN ? ELSE hometown END
  WHERE name = ?
`);
for (const [name, is_active, eliminated_week, age, hometown] of playerSeed) {
  insertPlayer.run(name, is_active, eliminated_week, age, hometown);
  updatePlayerInfo.run(age, hometown, name);
}

// Mark weeks 1 and 2 as completed (both episodes have aired)
db.prepare('UPDATE weeks SET completed = 1 WHERE week_number IN (1, 2)').run();

// ─── Seed Picks ───────────────────────────────────────────────────────────────
// Runs after cast + player seeding so IDs are available.
// Short name → full cast member name lookup
const CAST_ALIAS = {
  'Aubry':     'Aubry Bracco',
  'Charlie':   'Charlie Davis',
  'Christian': 'Christian Hubicki',
  'Cirie':     'Cirie Fields',
  'Coach':     'Coach Wade',
  'Colby':     'Colby Donaldson',
  'Dee':       'Dee Valladares',
  'Emily':     'Emily Flippen',
  'Genevieve': 'Genevieve Mushaluk',
  'Joe':       'Joe Hunter',
  'Jonathan':  'Jonathan Young',
  'Kamilla':   'Kamilla Karthigesu',
  'Kyle':      'Kyle Fraser',
  'Mike':      'Mike White',
  'Ozzy':      'Ozzy Lusth',
  'Q':         'Q Burdette',
  'Rick':      'Rick Devens',
  'Rizo':      'Rizo Velovic',
  'Stephenie': 'Stephenie LaGrossa Kendrick',
  'Tiffany':   'Tiffany Nicole Ervin',
};
function castId(alias) {
  const name = CAST_ALIAS[alias] || alias;
  return db.prepare('SELECT id FROM cast_members WHERE name = ?').get(name)?.id;
}
function playerId(name) {
  return db.prepare('SELECT id FROM game_players WHERE name = ?').get(name)?.id;
}

// Super Survivor picks — stored on game_players.super_survivor_cast_id
// (separate from weekly picks; players CAN pick same person as weekly pick too)
const superSurvivorData = [
  ['Jenna',   'Aubry'],
  ['Marissa', 'Tiffany'],
  ['Anna D',  'Charlie'],
  ['Greg',    'Q'],
  ['Jason',   'Joe'],
  ['Mason',   'Rizo'],
  ['Fish',    'Kamilla'],
  ['Emily',   'Cirie'],
  ['AT',      'Dee'],
  ['Anna F',  'Genevieve'],
  ['Michael', 'Jonathan'],
  ['Natalie', 'Emily'],
];
const setSuperSurvivor = db.prepare(
  'UPDATE game_players SET super_survivor_cast_id = ? WHERE id = ? AND (super_survivor_cast_id IS NULL)'
);
for (const [player, cast] of superSurvivorData) {
  const pid = playerId(player), cid = castId(cast);
  if (pid && cid) setSuperSurvivor.run(cid, pid);
}

// Weekly picks — [playerName, castAlias, weekNumber]
const picksData = [
  // ── Episode 1 ──
  ['Jenna',   'Tiffany',   1],
  ['Marissa', 'Mike',      1],
  ['Anna D',  'Joe',       1],
  ['Greg',    'Q',         1],
  ['Jason',   'Ozzy',      1],
  ['Mason',   'Ozzy',      1],
  ['Fish',    'Christian', 1],
  ['Emily',   'Cirie',     1],
  ['AT',      'Rick',      1],
  ['Anna F',  'Charlie',   1],
  ['Michael', 'Mike',      1],
  ['Natalie', 'Kyle',      1],  // Kyle med-evac'd → Natalie eliminated
  // ── Episode 2 ──
  ['Jenna',   'Charlie',   2],
  ['Marissa', 'Coach',     2],
  ['Anna D',  'Mike',      2],
  // Greg — no pick ep 2
  ['Jason',   'Mike',      2],
  ['Mason',   'Stephenie', 2],
  ['Fish',    'Mike',      2],
  ['Emily',   'Stephenie', 2],
  ['AT',      'Kamilla',   2],
  ['Anna F',  'Christian', 2],
  ['Michael', 'Jonathan',  2],
  // Natalie — eliminated, no ep 2 pick
];
const insertPick = db.prepare(
  'INSERT OR IGNORE INTO picks (game_player_id, cast_member_id, week_number) VALUES (?, ?, ?)'
);
for (const [player, cast, week] of picksData) {
  const pid = playerId(player), cid = castId(cast);
  if (pid && cid) insertPick.run(pid, cid, week);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCurrentWeek() {
  return db.prepare('SELECT * FROM weeks WHERE is_current = 1').get();
}

function getFullState() {
  const currentWeek = getCurrentWeek() || { week_number: 1, picks_allowed: 1 };

  const castMembers = db.prepare(`
    SELECT * FROM cast_members ORDER BY is_active DESC, tribe ASC, name ASC
  `).all();

  const gamePlayers = db.prepare(`
    SELECT * FROM game_players ORDER BY is_active DESC, name ASC
  `).all();

  const allWeeks = db.prepare(`
    SELECT * FROM weeks ORDER BY week_number ASC
  `).all();

  const allPicks = db.prepare(`
    SELECT p.*, gp.name as player_name, cm.name as cast_name, cm.is_active as cast_is_active
    FROM picks p
    JOIN game_players gp ON p.game_player_id = gp.id
    JOIN cast_members cm ON p.cast_member_id = cm.id
    ORDER BY p.week_number ASC, gp.name ASC
  `).all();

  return { currentWeek, castMembers, gamePlayers, allWeeks, allPicks };
}

// ─── Wikipedia / Photo Helpers ────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'SurvivorPredictionPool/1.0 (Node.js; open-source prediction pool app)',
        'Accept': 'application/json',
      },
    }, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        resolve(httpsGet(res.headers.location));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let body;
        try { body = JSON.parse(data); } catch (_) { body = data; }
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Request timed out')); });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

app.get('/api/state', (req, res) => {
  res.json(getFullState());
});

app.get('/api/available-picks/:gamePlayerId', (req, res) => {
  const { gamePlayerId } = req.params;
  const currentWeek = getCurrentWeek();
  if (!currentWeek) return res.status(400).json({ error: 'No current week set' });
  if (currentWeek.completed) return res.status(400).json({ error: 'Current week is already completed' });

  const player = db.prepare('SELECT * FROM game_players WHERE id = ?').get(gamePlayerId);
  if (!player) return res.status(404).json({ error: 'Player not found' });
  if (!player.is_active) return res.status(400).json({ error: 'Player is eliminated from the pool' });

  const picksThisWeek = db.prepare(
    'SELECT COUNT(*) as cnt FROM picks WHERE game_player_id = ? AND week_number = ?'
  ).get(gamePlayerId, currentWeek.week_number);

  const picksMadeThisWeek = picksThisWeek.cnt;
  const picksRemaining = currentWeek.picks_allowed - picksMadeThisWeek;

  const available = db.prepare(`
    SELECT cm.* FROM cast_members cm
    WHERE cm.is_active = 1
      AND cm.id NOT IN (
        SELECT cast_member_id FROM picks WHERE game_player_id = ?
      )
    ORDER BY cm.tribe ASC, cm.name ASC
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

  const alreadyPicked = db.prepare(
    'SELECT id FROM picks WHERE game_player_id = ? AND cast_member_id = ?'
  ).get(gamePlayerId, castMemberId);
  if (alreadyPicked) return res.status(400).json({ error: 'You already picked that Survivor in a previous week' });

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

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const { season_name, season_subtitle, admin_password } = req.body;
  const update = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  if (season_name !== undefined) update.run('season_name', season_name);
  if (season_subtitle !== undefined) update.run('season_subtitle', season_subtitle);
  if (admin_password !== undefined && admin_password.length >= 4) update.run('admin_password', admin_password);
  res.json({ success: true });
});

app.post('/api/admin/cast', requireAdmin, (req, res) => {
  const { name, tribe, age, hometown, wikipedia_slug } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const r = db.prepare(
      'INSERT INTO cast_members (name, tribe, age, hometown, wikipedia_slug) VALUES (?, ?, ?, ?, ?)'
    ).run(name.trim(), tribe?.trim() || '', age || null, hometown?.trim() || '', wikipedia_slug?.trim() || '');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Cast member already exists' });
    throw err;
  }
});

app.put('/api/admin/cast/:id', requireAdmin, (req, res) => {
  const { name, tribe, age, hometown, wikipedia_slug, photo_url } = req.body;
  const { id } = req.params;
  db.prepare(`
    UPDATE cast_members SET
      name = COALESCE(?, name),
      tribe = COALESCE(?, tribe),
      age = COALESCE(?, age),
      hometown = COALESCE(?, hometown),
      wikipedia_slug = COALESCE(?, wikipedia_slug),
      photo_url = COALESCE(?, photo_url)
    WHERE id = ?
  `).run(name || null, tribe !== undefined ? tribe : null, age || null,
         hometown || null, wikipedia_slug || null, photo_url || null, id);
  res.json({ success: true });
});

app.delete('/api/admin/cast/:id', requireAdmin, (req, res) => {
  const picks = db.prepare('SELECT COUNT(*) as cnt FROM picks WHERE cast_member_id = ?').get(req.params.id);
  if (picks.cnt > 0) return res.status(400).json({ error: 'Cannot delete — picks reference this cast member' });
  db.prepare('DELETE FROM cast_members WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/cast/:id/eliminate', requireAdmin, (req, res) => {
  const { week } = req.body;
  const castMember = db.prepare('SELECT * FROM cast_members WHERE id = ?').get(req.params.id);
  if (!castMember) return res.status(404).json({ error: 'Cast member not found' });

  const eliminationWeek = week || getCurrentWeek()?.week_number || 1;

  db.prepare('UPDATE cast_members SET is_active = 0, eliminated_week = ? WHERE id = ?')
    .run(eliminationWeek, req.params.id);

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

app.post('/api/admin/cast/:id/restore', requireAdmin, (req, res) => {
  db.prepare('UPDATE cast_members SET is_active = 1, eliminated_week = NULL WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Upload a photo for a cast member (base64 → static file)
app.post('/api/admin/cast/:id/photo', requireAdmin, (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No image data provided' });
  const match = data.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Invalid format — must be JPEG, PNG, GIF or WebP.' });
  const [, mime, b64] = match;
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const filename = `cast_${req.params.id}.${ext}`;
  const filePath = path.join(__dirname, 'public', 'images', 'players', filename);
  try {
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
    const photoUrl = `/images/players/${filename}`;
    db.prepare('UPDATE cast_members SET photo_url = ? WHERE id = ?').run(photoUrl, req.params.id);
    res.json({ success: true, photo_url: photoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wikipedia Sync — Standalone Functions (run automatically) ────────────────

// Fetch Wikipedia photos for all cast members that don't have one yet
async function runPhotoSync() {
  const members = db.prepare(
    "SELECT * FROM cast_members WHERE photo_url = '' OR photo_url IS NULL"
  ).all();
  if (!members.length) return { results: [] };

  const results = [];
  for (const member of members) {
    const slug = member.wikipedia_slug || member.name.replace(/\s+/g, '_');
    try {
      const result = await httpsGet(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
      );
      const photoUrl = result.body?.thumbnail?.source;
      if (photoUrl) {
        db.prepare('UPDATE cast_members SET photo_url = ? WHERE id = ?').run(photoUrl, member.id);
        results.push({ name: member.name, status: 'ok', photo_url: photoUrl });
        console.log(`[photos] Fetched photo for ${member.name}`);
      } else {
        results.push({ name: member.name, status: 'no_photo' });
      }
    } catch (err) {
      results.push({ name: member.name, status: 'error', message: err.message });
    }
    await new Promise(r => setTimeout(r, 350)); // be polite to Wikipedia API
  }
  return { results };
}

// Parse Wikipedia article to find newly eliminated castaways
async function runWikipediaSync() {
  const apiUrl = 'https://en.wikipedia.org/w/api.php?' + [
    'action=query',
    'titles=Survivor_50%3A_In_the_Hands_of_the_Fans',
    'prop=revisions',
    'rvprop=content',
    'rvslots=main',
    'format=json',
    'formatversion=2',
  ].join('&');

  const result = await httpsGet(apiUrl);
  if (result.statusCode !== 200) throw new Error(`Wikipedia API returned HTTP ${result.statusCode}`);

  const wikitext = result.body?.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!wikitext) throw new Error('Could not retrieve Wikipedia article content');

  const castMembers = db.prepare('SELECT * FROM cast_members').all();
  const updates = [];
  const tableRows = wikitext.split(/\n\|\-/);

  for (const member of castMembers) {
    const escapedName = member.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    const namePattern = new RegExp(escapedName.replace(/\s+/g, '[\\s_]+'), 'i');
    const matchingRow = tableRows.find(row => namePattern.test(row));
    if (!matchingRow) continue;

    const isVotedOut = /voted.?out|medically.?evacuated|eliminated/i.test(matchingRow);

    if (isVotedOut && member.is_active) {
      const epMatch = matchingRow.match(/[Ee]pisode\s*(\d+)|[Ee]p\.?\s*(\d+)|[Ww]eek\s*(\d+)/);
      const weekNum = epMatch ? parseInt(epMatch[1] || epMatch[2] || epMatch[3]) : null;

      db.prepare('UPDATE cast_members SET is_active = 0, eliminated_week = ? WHERE id = ?')
        .run(weekNum || getCurrentWeek()?.week_number || 1, member.id);

      if (weekNum) {
        const affected = db.prepare(`
          SELECT p.game_player_id FROM picks p
          JOIN game_players gp ON p.game_player_id = gp.id
          WHERE p.cast_member_id = ? AND p.week_number = ? AND gp.is_active = 1
        `).all(member.id, weekNum);
        for (const a of affected) {
          db.prepare('UPDATE game_players SET is_active = 0, eliminated_week = ? WHERE id = ?')
            .run(weekNum, a.game_player_id);
        }
      }

      console.log(`[wiki-sync] Eliminated: ${member.name} (Ep ${weekNum || '?'})`);
      updates.push({ name: member.name, action: 'eliminated', week: weekNum });
    }
  }
  return { wikitextLength: wikitext.length, updates };
}

// ─── Admin API endpoints (manual trigger) ─────────────────────────────────────

app.post('/api/admin/cast/:id/fetch-photo', requireAdmin, async (req, res) => {
  const castMember = db.prepare('SELECT * FROM cast_members WHERE id = ?').get(req.params.id);
  if (!castMember) return res.status(404).json({ error: 'Cast member not found' });
  const slug = castMember.wikipedia_slug || castMember.name.replace(/\s+/g, '_');
  try {
    const result = await httpsGet(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
    );
    const photoUrl = result.body?.thumbnail?.source || result.body?.originalimage?.source;
    if (photoUrl) {
      db.prepare('UPDATE cast_members SET photo_url = ? WHERE id = ?').run(photoUrl, castMember.id);
      res.json({ success: true, photo_url: photoUrl });
    } else {
      res.json({ success: false, message: 'No photo found on Wikipedia for this person' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sync-photos', requireAdmin, async (req, res) => {
  try {
    const data = await runPhotoSync();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/sync-wikipedia', requireAdmin, async (req, res) => {
  try {
    const data = await runWikipediaSync();
    res.json({
      success: true,
      ...data,
      message: data.updates.filter(u => u.action === 'eliminated').length
        ? `Found ${data.updates.filter(u => u.action === 'eliminated').length} new elimination(s)`
        : 'No new eliminations detected — cast status is up to date',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Player Management ────────────────────────────────────────────────────────
app.post('/api/admin/players', requireAdmin, (req, res) => {
  const { name, age, hometown } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  try {
    const r = db.prepare('INSERT INTO game_players (name, age, hometown) VALUES (?, ?, ?)')
      .run(name.trim(), age || null, hometown?.trim() || '');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Player already exists' });
    throw err;
  }
});

app.delete('/api/admin/players/:id', requireAdmin, (req, res) => {
  const picks = db.prepare('SELECT COUNT(*) as cnt FROM picks WHERE game_player_id = ?').get(req.params.id);
  if (picks.cnt > 0) return res.status(400).json({ error: 'Cannot delete — this player has picks recorded' });
  db.prepare('DELETE FROM game_players WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/players/:id/restore', requireAdmin, (req, res) => {
  db.prepare('UPDATE game_players SET is_active = 1, eliminated_week = NULL WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Upload a photo for a pool player (base64 data URL → saved as static file)
app.post('/api/admin/players/:id/photo', requireAdmin, (req, res) => {
  const { data } = req.body; // expects "data:image/jpeg;base64,..."
  if (!data) return res.status(400).json({ error: 'No image data provided' });

  const match = data.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Invalid image format. Must be JPEG, PNG, GIF or WebP.' });

  const [, mime, b64] = match;
  const ext = mime.split('/')[1].replace('jpeg', 'jpg');
  const filename = `player_${req.params.id}.${ext}`;
  const filePath = path.join(__dirname, 'public', 'images', 'players', filename);

  try {
    fs.writeFileSync(filePath, Buffer.from(b64, 'base64'));
    const photoUrl = `/images/players/${filename}`;
    db.prepare('UPDATE game_players SET photo_url = ? WHERE id = ?').run(photoUrl, req.params.id);
    res.json({ success: true, photo_url: photoUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Week Management ──────────────────────────────────────────────────────────
app.get('/api/admin/weeks', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM weeks ORDER BY week_number').all());
});

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

app.post('/api/admin/weeks/:weekNumber/set-current', requireAdmin, (req, res) => {
  const wn = parseInt(req.params.weekNumber);
  db.prepare('INSERT OR IGNORE INTO weeks (week_number, picks_allowed, is_current) VALUES (?, 1, 0)').run(wn);
  db.prepare('UPDATE weeks SET is_current = 0').run();
  db.prepare('UPDATE weeks SET is_current = 1 WHERE week_number = ?').run(wn);
  res.json({ success: true });
});

app.post('/api/admin/weeks/:weekNumber/complete', requireAdmin, (req, res) => {
  const { completed } = req.body;
  db.prepare('UPDATE weeks SET completed = ? WHERE week_number = ?')
    .run(completed ? 1 : 0, req.params.weekNumber);
  res.json({ success: true });
});

// ─── Pick Management ──────────────────────────────────────────────────────────
app.delete('/api/admin/picks/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM picks WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

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

// ─── Season Settings (public) ─────────────────────────────────────────────────
app.get('/api/season', (req, res) => {
  const rows = db.prepare("SELECT * FROM settings WHERE key IN ('season_name','season_subtitle')").all();
  const s = {};
  rows.forEach(r => s[r.key] = r.value);
  res.json(s);
});

// Catch-all: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Survivor Pool running at http://localhost:${PORT}`);
  console.log(`Admin password: ${db.prepare("SELECT value FROM settings WHERE key='admin_password'").get().value}`);

  // Auto-sync Wikipedia on startup (after a short delay so the server is ready)
  setTimeout(async () => {
    console.log('[auto-sync] Fetching cast photos from Wikipedia…');
    try {
      const { results } = await runPhotoSync();
      const found = results.filter(r => r.status === 'ok').length;
      if (found) console.log(`[auto-sync] Photos fetched: ${found}`);
      else console.log('[auto-sync] No new photos needed.');
    } catch (err) {
      console.warn('[auto-sync] Photo sync failed:', err.message);
    }

    console.log('[auto-sync] Checking Wikipedia for new eliminations…');
    try {
      const { updates } = await runWikipediaSync();
      const elims = updates.filter(u => u.action === 'eliminated');
      if (elims.length) console.log(`[auto-sync] New eliminations: ${elims.map(u => u.name).join(', ')}`);
      else console.log('[auto-sync] Cast status up to date.');
    } catch (err) {
      console.warn('[auto-sync] Wikipedia sync failed:', err.message);
    }
  }, 3000);

  // Re-sync every 30 minutes while the server is running
  setInterval(async () => {
    try {
      await runPhotoSync();
      const { updates } = await runWikipediaSync();
      const elims = updates.filter(u => u.action === 'eliminated');
      if (elims.length) console.log(`[hourly-sync] New eliminations: ${elims.map(u => u.name).join(', ')}`);
    } catch (err) {
      console.warn('[hourly-sync] Sync error:', err.message);
    }
  }, 30 * 60 * 1000);
});
