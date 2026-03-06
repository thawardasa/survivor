/* ─── State ───────────────────────────────────────────────────────────── */
let state = null;

// Known slug overrides for Survivor 50 newcomers / players whose S49 Wikipedia pages may now exist
const WIKI_SLUG_OVERRIDES = {
  'Savannah Louie': 'Savannah_Louie',
  'Charlie Davis': 'Charlie_Davis_(Survivor)',
  'Tiffany Nicole Ervin': 'Tiffany_Ervin',
  'Jonathan Young': 'Jonathan_Young_(Survivor)',
  'Joe Hunter': 'Joe_Hunter_(Survivor)',
  'Kamilla Karthigesu': 'Kamilla_Karthigesu',
  'Genevieve Mushaluk': 'Genevieve_Mushaluk',
  'Rizo Velovic': 'Rizo_Velovic',
  'Kyle Fraser': 'Kyle_Fraser_(Survivor)',
};

/* ─── Boot ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadState();
});

/* ─── API Helpers ─────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ─── Load Game State ─────────────────────────────────────────────────── */
async function loadState() {
  try {
    const [gameState, season] = await Promise.all([
      api('/api/state'),
      api('/api/season'),
    ]);
    state = gameState;

    // Update header subtitle
    document.getElementById('seasonSubtitle').textContent = season.season_subtitle || 'Prediction Pool';
    document.title = season.season_name || 'Survivor Pool';

    renderPage();
    // Load Wikipedia images automatically after page renders
    loadWikipediaImages();
  } catch (err) {
    document.getElementById('mainContent').innerHTML =
      `<div class="alert alert-error">Failed to load game data: ${err.message}</div>`;
  }
}

/* ─── Wikipedia Image Auto-Loader ─────────────────────────────────────── */
async function loadWikipediaImages() {
  if (!state) return;
  const { castMembers } = state;

  // Build slug → cast member mapping
  const slugMap = {};
  for (const c of castMembers) {
    const slug = WIKI_SLUG_OVERRIDES[c.name] || c.wikipedia_slug;
    if (slug) slugMap[slug] = c;
  }

  const slugs = Object.keys(slugMap);
  if (!slugs.length) return;

  // Batch into groups of 30 to respect Wikipedia API limits
  const BATCH = 30;
  const results = {};

  for (let i = 0; i < slugs.length; i += BATCH) {
    const batch = slugs.slice(i, i + BATCH);
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${batch.map(encodeURIComponent).join('|')}&prop=pageimages&format=json&pithumbsize=400&origin=*`;
      const res = await fetch(url);
      const data = await res.json();
      const pages = data.query?.pages || {};

      // Build title→slug reverse map (Wikipedia normalizes underscores to spaces)
      const titleToSlug = {};
      for (const s of batch) titleToSlug[s.replace(/_/g, ' ')] = s;
      // Also incorporate normalized titles if provided
      for (const norm of (data.query?.normalized || [])) {
        titleToSlug[norm.to] = norm.from;
      }

      for (const page of Object.values(pages)) {
        if (page.thumbnail?.source) {
          const slug = titleToSlug[page.title];
          if (slug && slugMap[slug]) {
            results[slugMap[slug].id] = page.thumbnail.source;
          }
        }
      }
    } catch (e) {
      // Silently ignore wiki failures — initials fallback remains
    }
  }

  // Update all cast image elements on the page
  for (const [castId, imgUrl] of Object.entries(results)) {
    // Update all img elements with data-cast-id attribute
    document.querySelectorAll(`img[data-cast-id="${castId}"]`).forEach(img => {
      img.src = imgUrl;
      img.style.display = '';
      const sibling = img.nextElementSibling;
      if (sibling && (sibling.classList.contains('cast-avatar') || sibling.classList.contains('player-avatar-initial'))) {
        sibling.style.display = 'none';
      }
    });
  }
}

/* ─── Main Render ─────────────────────────────────────────────────────── */
function renderPage() {
  const { currentWeek, castMembers, gamePlayers, allWeeks, allPicks } = state;
  const activeCast = castMembers.filter(c => c.is_active);
  const eliminatedCast = castMembers.filter(c => !c.is_active);

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    ${renderStatusBar(currentWeek, gamePlayers, activeCast)}
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('standings', this)">🏆 Standings</button>
      <button class="tab-btn" onclick="switchTab('picks', this)">📋 All Picks</button>
      <button class="tab-btn" onclick="switchTab('cast', this)">🌴 Survivor Cast</button>
    </div>
    <div id="tab-standings" class="tab-panel active">
      ${renderStandingsTab(gamePlayers, castMembers, allPicks, allWeeks, currentWeek)}
    </div>
    <div id="tab-picks" class="tab-panel">
      ${renderPicksTable(gamePlayers, allWeeks, allPicks, castMembers)}
    </div>
    <div id="tab-cast" class="tab-panel">
      ${renderCastTab(activeCast, eliminatedCast)}
    </div>
  `;

  // Populate player dropdown in pick modal
  populatePlayerDropdown(gamePlayers);
}

/* ─── Status Bar ──────────────────────────────────────────────────────── */
function renderStatusBar(currentWeek, gamePlayers, activeCast) {
  const activePlayers = gamePlayers.filter(p => p.is_active);
  const eliminatedPlayers = gamePlayers.filter(p => !p.is_active);
  const weekStatus = currentWeek?.completed
    ? `<span style="color:var(--text-dim);font-size:.8rem">Results in</span>`
    : `<span style="color:var(--green);font-size:.8rem">Picks open</span>`;

  return `
    <div class="status-bar">
      <div class="status-card">
        <div class="label">Current Week</div>
        <div class="value">${currentWeek?.week_number ?? '—'}</div>
        <div class="sub">${weekStatus}</div>
      </div>
      <div class="status-card">
        <div class="label">Picks / Week</div>
        <div class="value">${currentWeek?.picks_allowed ?? '—'}</div>
        <div class="sub">per player</div>
      </div>
      <div class="status-card">
        <div class="label">Players In</div>
        <div class="value" style="color:var(--green)">${activePlayers.length}</div>
        <div class="sub">${eliminatedPlayers.length} eliminated</div>
      </div>
      <div class="status-card">
        <div class="label">Cast Remaining</div>
        <div class="value" style="color:var(--accent)">${activeCast.length}</div>
        <div class="sub">still in the game</div>
      </div>
    </div>
  `;
}

/* ─── Standings Tab ───────────────────────────────────────────────────── */
function renderStandingsTab(gamePlayers, castMembers, allPicks, allWeeks, currentWeek) {
  const castById = {};
  for (const c of castMembers) castById[c.id] = c;

  const completedWeeks = allWeeks.filter(w => w.completed).sort((a, b) => a.week_number - b.week_number);

  // Compute alive picks count for each player
  const playerStats = gamePlayers.map(player => {
    const picks = allPicks.filter(pk => pk.game_player_id === player.id);
    const alivePicks = picks.filter(pk => pk.cast_is_active);
    const ssCast = player.super_survivor_cast_id ? castById[player.super_survivor_cast_id] : null;
    const ssAlive = ssCast ? ssCast.is_active : false;
    const totalAlive = alivePicks.length + (ssAlive ? 1 : 0);
    const picksByWeek = {};
    for (const pk of picks) picksByWeek[pk.week_number] = pk;
    return { ...player, picks, alivePicks: alivePicks.length, ssAlive, totalAlive, picksByWeek, ssCast };
  });

  // Sort: active players first, then by totalAlive desc
  const sorted = [...playerStats].sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    return b.totalAlive - a.totalAlive;
  });

  const activeSorted = sorted.filter(p => p.is_active);
  const eliminatedSorted = sorted.filter(p => !p.is_active);

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">🏆 Standings</span>
        <span style="font-size:.78rem;color:var(--text-dim)">Ranked by active survivor picks remaining</span>
      </div>
      <div class="standings-grid">
        ${activeSorted.map((p, i) => renderStandingsCard(p, i + 1, completedWeeks, castById, false)).join('')}
      </div>
      ${eliminatedSorted.length ? `
        <div class="section-header" style="margin-top:28px">
          <span class="section-title">💀 Eliminated from Pool</span>
        </div>
        <div class="standings-grid">
          ${eliminatedSorted.map(p => renderStandingsCard(p, null, completedWeeks, castById, true)).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderStandingsCard(player, rank, completedWeeks, castById, isEliminated) {
  const initial = player.name.charAt(0).toUpperCase();

  // Player photo (game players don't have wiki photos — just show initials)
  const photoHtml = player.photo_url
    ? `<img class="player-photo" src="${esc(player.photo_url)}" alt="${esc(player.name)}" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
    : '';
  const avatarStyle = player.photo_url ? 'style="display:none"' : '';

  // Rank badge
  const rankBadge = rank ? `<div class="rank-badge">#${rank}</div>` : '';

  // Super Survivor
  const ssName = player.ssCast ? player.ssCast.name.split(' ')[0] : '—';
  const ssCls = player.ssCast ? (player.ssAlive ? 'ss-active' : 'ss-out') : 'ss-empty';
  const ssHtml = `<div class="pick-row">
    <span class="pick-label">Super Survivor</span>
    <span class="ss-pick ${ssCls}">${esc(ssName)}</span>
  </div>`;

  // Weekly picks
  const weekPicksHtml = completedWeeks.map(w => {
    const pick = player.picksByWeek[w.week_number];
    if (!pick) {
      return `<div class="pick-row">
        <span class="pick-label">Ep ${w.week_number}</span>
        <span style="color:var(--text-dim);font-size:.78rem">—</span>
      </div>`;
    }
    const alive = pick.cast_is_active;
    const cls = alive ? 'pick-alive' : 'pick-out';
    const firstName = pick.cast_name.split(' ')[0];
    return `<div class="pick-row">
      <span class="pick-label">Ep ${w.week_number}</span>
      <span class="weekly-pick ${cls}">${esc(firstName)}</span>
    </div>`;
  }).join('');

  // Score badge
  const scoreBadge = `<div class="score-badge" title="${player.totalAlive} active picks">
    <span class="score-num">${player.totalAlive}</span>
    <span class="score-label">alive</span>
  </div>`;

  const cardClass = `standings-card ${isEliminated ? 'eliminated' : 'active'}`;

  return `
    <div class="${cardClass}">
      ${rankBadge}
      ${scoreBadge}
      <div class="standings-avatar-wrap">
        ${photoHtml}
        <div class="player-avatar-initial" ${avatarStyle}>${initial}</div>
      </div>
      <div class="standings-name">${esc(player.name)}</div>
      <div class="standings-info">${[player.age ? player.age + ' yrs' : '', esc(player.hometown || '')].filter(Boolean).join(' · ')}</div>
      ${isEliminated ? `<div class="eliminated-badge">OUT Ep ${player.eliminated_week || '?'}</div>` : ''}
      <div class="picks-summary">
        ${ssHtml}
        ${weekPicksHtml}
      </div>
    </div>
  `;
}

/* ─── Picks Table Tab ─────────────────────────────────────────────────── */
function renderPicksTable(gamePlayers, allWeeks, allPicks, castMembers) {
  if (!gamePlayers.length) {
    return `<div class="empty-state"><div class="empty-icon">📋</div><p>No players in the pool yet.</p></div>`;
  }

  const castById = {};
  for (const c of castMembers) castById[c.id] = c;

  const weeks = [...allWeeks].sort((a, b) => a.week_number - b.week_number);
  if (!weeks.length) {
    return `<div class="empty-state"><div class="empty-icon">📅</div><p>No weeks set up yet.</p></div>`;
  }

  // Sort by active first, then by most alive picks
  const playerStats = gamePlayers.map(player => {
    const picks = allPicks.filter(pk => pk.game_player_id === player.id);
    const alivePicks = picks.filter(pk => pk.cast_is_active);
    const ssCast = player.super_survivor_cast_id ? castById[player.super_survivor_cast_id] : null;
    const ssAlive = ssCast ? ssCast.is_active : false;
    const totalAlive = alivePicks.length + (ssAlive ? 1 : 0);
    return { ...player, totalAlive };
  });

  const sortedPlayers = [...playerStats].sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    return b.totalAlive - a.totalAlive;
  });

  const pickMap = {};
  for (const pk of allPicks) {
    if (!pickMap[pk.game_player_id]) pickMap[pk.game_player_id] = {};
    pickMap[pk.game_player_id][pk.week_number] = pk;
  }

  let thead = `<tr>
    <th>Player</th>
    <th class="ss-col">🏆 Super<br>Survivor</th>
    ${weeks.map(w => `<th>Ep ${w.week_number}${w.picks_allowed > 1 ? `<br><small style="font-weight:400;color:var(--text-dim)">×${w.picks_allowed}</small>` : ''}</th>`).join('')}
    <th>Score</th>
  </tr>`;

  let tbody = sortedPlayers.map((player, idx) => {
    const rowClass = player.is_active ? '' : 'eliminated-row';

    const photoThumb = player.photo_url
      ? `<img src="${esc(player.photo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;object-position:top;vertical-align:middle;margin-right:6px;flex-shrink:0" alt="${esc(player.name)}">`
      : `<span style="display:inline-flex;width:32px;height:32px;border-radius:50%;background:var(--surface2);align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:.8rem;margin-right:6px;vertical-align:middle;flex-shrink:0">${player.name.charAt(0)}</span>`;

    // Super Survivor cell
    const ssCast = player.super_survivor_cast_id ? castById[player.super_survivor_cast_id] : null;
    const ssName = ssCast ? ssCast.name.split(' ')[0] : '—';
    const ssActive = ssCast ? ssCast.is_active : null;
    const ssCls = ssCast ? (ssActive ? 'ss-active' : 'ss-out') : 'ss-empty';
    const ssCell = `<td class="ss-col"><span class="ss-pick ${ssCls}">${esc(ssName)}</span></td>`;

    const cells = weeks.map(w => {
      const pick = pickMap[player.id]?.[w.week_number];
      if (!pick) {
        return `<td><span class="pick-cell"><span class="dot empty"></span><span style="color:var(--text-dim)">—</span></span></td>`;
      }
      const isVotedOut = !pick.cast_is_active;
      const dotClass = w.completed ? (isVotedOut ? 'voted-out' : 'safe') : 'pending';
      const textClass = w.completed ? (isVotedOut ? 'voted-out' : 'safe') : 'pending';
      return `<td><span class="pick-cell">
        <span class="dot ${dotClass}"></span>
        <span class="pick-text ${textClass}">${esc(pick.cast_name.split(' ')[0])}</span>
      </span></td>`;
    }).join('');

    const rankNum = player.is_active ? `#${idx + 1}` : 'OUT';
    const scoreCell = `<td><span style="font-weight:700;color:${player.is_active ? 'var(--green)' : 'var(--text-dim)'}">${player.totalAlive}</span> alive</td>`;

    return `<tr class="${rowClass}">
      <td style="white-space:nowrap;min-width:130px">
        <div style="display:flex;align-items:center">${photoThumb}<div><strong>${esc(player.name)}</strong></div></div>
      </td>
      ${ssCell}
      ${cells}
      ${scoreCell}
    </tr>`;
  }).join('');

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">📋 Picks by Episode</span>
        <span style="font-size:.78rem;color:var(--text-dim)">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block;vertical-align:middle"></span> Safe &nbsp;
          <span style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block;vertical-align:middle"></span> Voted Out &nbsp;
          <span style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block;vertical-align:middle"></span> Pending
        </span>
      </div>
      <div class="table-scroll">
        <table class="picks-table">
          <thead>${thead}</thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>
  `;
}

/* ─── Cast Tab ────────────────────────────────────────────────────────── */
function castCardHtml(c, elim) {
  const initial = c.name.charAt(0).toUpperCase();
  const tribeClass = c.tribe ? `tribe-${c.tribe.toLowerCase()}` : '';
  const tribeHtml = c.tribe
    ? `<div class="cast-tribe tribe-badge ${tribeClass}">${esc(c.tribe)}</div>` : '';
  const infoHtml = (c.age || c.hometown)
    ? `<div class="cast-info">${[c.age ? c.age + ' yrs' : '', esc(c.hometown || '')].filter(Boolean).join(' · ')}</div>` : '';
  const occupHtml = c.occupation
    ? `<div class="cast-info" style="font-style:italic">${esc(c.occupation)}</div>` : '';
  const weekHtml = c.eliminated_week ? `<div class="cast-week">Ep ${c.eliminated_week}</div>` : '';

  // Always render img tag with data-cast-id so wiki loader can populate it
  const photoHtml = `<img class="cast-photo" data-cast-id="${c.id}" src="${esc(c.photo_url || '')}" alt="${esc(c.name)}" ${c.photo_url ? '' : 'style="display:none"'} onerror="this.style.display='none';this.nextSibling.style.display='flex'">`;
  const avatarStyle = c.photo_url ? 'style="display:none"' : '';

  return `
    <div class="cast-card ${elim ? 'eliminated' : 'active'}">
      <div class="cast-avatar-wrap">
        ${photoHtml}
        <div class="cast-avatar" ${avatarStyle}>${initial}</div>
      </div>
      <div class="cast-name">${esc(c.name)}</div>
      ${tribeHtml}
      ${infoHtml}
      ${occupHtml}
      <div class="cast-status">${elim ? '🪦 Voted Out' : '✅ Active'}</div>
      ${weekHtml}
    </div>
  `;
}

function renderCastTab(activeCast, eliminatedCast) {
  const tribes = ['Cila', 'Kalo', 'Vatu'];
  let activeHtml = '';
  for (const tribe of tribes) {
    const members = activeCast.filter(c => c.tribe === tribe);
    if (!members.length) continue;
    const tribeClass = `tribe-${tribe.toLowerCase()}`;
    activeHtml += `
      <div class="tribe-section">
        <div class="tribe-header">
          <span class="tribe-badge tribe-label ${tribeClass}">${tribe} Tribe</span>
          <span class="count-badge">${members.length} remaining</span>
        </div>
        <div class="cast-grid">${members.map(c => castCardHtml(c, false)).join('')}</div>
      </div>`;
  }
  const noTribe = activeCast.filter(c => !tribes.includes(c.tribe));
  if (noTribe.length) {
    activeHtml += `<div class="cast-grid">${noTribe.map(c => castCardHtml(c, false)).join('')}</div>`;
  }
  if (!activeCast.length) activeHtml = `<div class="empty-state"><p>No active castaways.</p></div>`;

  const eliminatedHtml = eliminatedCast.length
    ? `<div class="cast-grid">${eliminatedCast.map(c => castCardHtml(c, true)).join('')}</div>`
    : `<div class="empty-state"><p>Nobody voted out yet.</p></div>`;

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">✅ Still In the Game <span class="count-badge">${activeCast.length}</span></span>
      </div>
      ${activeHtml}
    </div>
    <div class="section">
      <div class="section-header">
        <span class="section-title">🪦 Voted Out <span class="count-badge">${eliminatedCast.length}</span></span>
      </div>
      ${eliminatedHtml}
    </div>
  `;
}

/* ─── Tab Switching ───────────────────────────────────────────────────── */
function switchTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
}

/* ─── Pick Modal ──────────────────────────────────────────────────────── */
function openPickModal() {
  document.getElementById('pickModal').classList.remove('hidden');
  document.getElementById('pickStep2').classList.add('hidden');
  document.getElementById('submitPickBtn').style.display = 'none';
  document.getElementById('pickStep1Status').innerHTML = '';
  document.getElementById('pickFormStatus').innerHTML = '';
  document.getElementById('pickPlayerSelect').value = '';
}

function closePickModal() {
  document.getElementById('pickModal').classList.add('hidden');
}

function populatePlayerDropdown(gamePlayers) {
  const sel = document.getElementById('pickPlayerSelect');
  const activePlayers = gamePlayers.filter(p => p.is_active);
  sel.innerHTML = `<option value="">— Select your name —</option>` +
    activePlayers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
}

let pickData = null;

async function loadAvailablePicks() {
  const playerId = document.getElementById('pickPlayerSelect').value;
  if (!playerId) {
    document.getElementById('pickStep2').classList.add('hidden');
    document.getElementById('submitPickBtn').style.display = 'none';
    return;
  }

  document.getElementById('pickStep1Status').innerHTML = '<div class="form-hint">Loading available picks…</div>';

  try {
    pickData = await api(`/api/available-picks/${playerId}`);
    document.getElementById('pickStep1Status').innerHTML = '';

    const { currentWeek, available, picksRemaining, existingPicks } = pickData;

    document.getElementById('pickWeekInfo').innerHTML =
      `📅 Week <strong>${currentWeek.week_number}</strong> — You can make <strong>${currentWeek.picks_allowed}</strong> pick${currentWeek.picks_allowed > 1 ? 's' : ''} this week.`;

    let existingHtml = '';
    if (existingPicks.length) {
      existingHtml = `
        <div class="alert alert-info" style="margin-bottom:12px">
          ✅ You've already picked this week: ${existingPicks.map(p => `<strong>${esc(p.cast_name)}</strong>`).join(', ')}
        </div>`;
    }
    document.getElementById('existingPicksArea').innerHTML = existingHtml;

    const castSel = document.getElementById('pickCastSelect');
    castSel.innerHTML = `<option value="">— Select a cast member —</option>` +
      available.map(c => `<option value="${c.id}">${esc(c.name)}${c.tribe ? ' (' + esc(c.tribe) + ')' : ''}</option>`).join('');

    const hint = picksRemaining <= 0
      ? `You have used all your picks for week ${currentWeek.week_number}.`
      : `${picksRemaining} pick${picksRemaining > 1 ? 's' : ''} remaining this week.`;
    document.getElementById('picksHint').textContent = hint;

    const canPick = picksRemaining > 0 && available.length > 0;
    document.getElementById('pickStep2').classList.remove('hidden');
    document.getElementById('submitPickBtn').style.display = canPick ? '' : 'none';

    if (!canPick && picksRemaining <= 0) {
      document.getElementById('pickFormStatus').innerHTML = '<div class="alert alert-info">You have already submitted all your picks for this week!</div>';
    } else if (available.length === 0) {
      document.getElementById('pickFormStatus').innerHTML = '<div class="alert alert-info">No available cast members to pick.</div>';
    } else {
      document.getElementById('pickFormStatus').innerHTML = '';
    }

  } catch (err) {
    document.getElementById('pickStep1Status').innerHTML = `<div class="alert alert-error">${err.message}</div>`;
    document.getElementById('pickStep2').classList.add('hidden');
    document.getElementById('submitPickBtn').style.display = 'none';
  }
}

async function submitPick() {
  const playerId = document.getElementById('pickPlayerSelect').value;
  const castId = document.getElementById('pickCastSelect').value;

  if (!castId) {
    document.getElementById('pickFormStatus').innerHTML = '<div class="alert alert-error">Please select a cast member.</div>';
    return;
  }

  const btn = document.getElementById('submitPickBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';

  try {
    const result = await api('/api/picks', {
      method: 'POST',
      body: { gamePlayerId: parseInt(playerId), castMemberId: parseInt(castId) },
    });

    document.getElementById('pickFormStatus').innerHTML =
      `<div class="alert alert-success">✅ ${result.message}</div>`;

    btn.style.display = 'none';
    await loadState();
    await loadAvailablePicks();

  } catch (err) {
    document.getElementById('pickFormStatus').innerHTML =
      `<div class="alert alert-error">❌ ${err.message}</div>`;
    btn.disabled = false;
    btn.textContent = 'Submit Pick ✓';
  }
}

/* ─── Utility ─────────────────────────────────────────────────────────── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Close modal on overlay click
document.getElementById('pickModal').addEventListener('click', function(e) {
  if (e.target === this) closePickModal();
});
