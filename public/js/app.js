/* ─── State ───────────────────────────────────────────────────────────── */
let state = null;

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

    // Update header
    document.getElementById('seasonName').textContent = '🔥 ' + (season.season_name || 'Survivor Pool');
    document.getElementById('seasonSubtitle').textContent = season.season_subtitle || 'Prediction Pool';
    document.title = season.season_name || 'Survivor Pool';

    renderPage();
  } catch (err) {
    document.getElementById('mainContent').innerHTML =
      `<div class="alert alert-error">Failed to load game data: ${err.message}</div>`;
  }
}

/* ─── Main Render ─────────────────────────────────────────────────────── */
function renderPage() {
  const { currentWeek, castMembers, gamePlayers, allWeeks, allPicks } = state;
  const activeCast = castMembers.filter(c => c.is_active);
  const eliminatedCast = castMembers.filter(c => !c.is_active);
  const activePlayers = gamePlayers.filter(p => p.is_active);
  const eliminatedPlayers = gamePlayers.filter(p => !p.is_active);

  const main = document.getElementById('mainContent');
  main.innerHTML = `
    ${renderStatusBar(currentWeek, activePlayers, eliminatedPlayers, activeCast)}
    <div class="tab-bar">
      <button class="tab-btn active" onclick="switchTab('overview', this)">Overview</button>
      <button class="tab-btn" onclick="switchTab('picks', this)">Weekly Picks</button>
      <button class="tab-btn" onclick="switchTab('cast', this)">Survivor Cast</button>
    </div>
    <div id="tab-overview" class="tab-panel active">
      ${renderOverviewTab(activePlayers, eliminatedPlayers, activeCast, eliminatedCast, allPicks, currentWeek)}
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
function renderStatusBar(currentWeek, activePlayers, eliminatedPlayers, activeCast) {
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

/* ─── Overview Tab ────────────────────────────────────────────────────── */
function renderOverviewTab(activePlayers, eliminatedPlayers, activeCast, eliminatedCast, allPicks, currentWeek) {
  return `
    <div class="two-col">
      <div>
        ${renderPlayerSection('🟢 Pool Players Still In', activePlayers, allPicks, currentWeek, false)}
        ${eliminatedPlayers.length ? renderPlayerSection('💀 Eliminated from Pool', eliminatedPlayers, allPicks, currentWeek, true) : ''}
      </div>
      <div>
        ${renderCastPreview(activeCast, eliminatedCast)}
      </div>
    </div>
  `;
}

function renderPlayerSection(title, players, allPicks, currentWeek, isEliminated) {
  if (!players.length) return '';

  const cards = players.map(p => {
    const currentPick = allPicks.find(pk =>
      pk.game_player_id === p.id && pk.week_number === currentWeek?.week_number
    );
    const elimWeek = p.eliminated_week ? `Eliminated week ${p.eliminated_week}` : '';

    let pickHtml = '';
    if (currentWeek && !currentWeek.completed) {
      pickHtml = currentPick
        ? `<div class="player-pick">Week ${currentWeek.week_number}: <span class="pick-name">${esc(currentPick.cast_name)}</span></div>`
        : `<div class="player-pick" style="color:var(--text-dim);font-style:italic">No pick yet</div>`;
    } else if (currentPick) {
      const cls = currentPick.cast_is_active ? 'safe' : 'bad-pick';
      pickHtml = `<div class="player-pick">Week ${currentWeek.week_number}: <span class="${cls} pick-name">${esc(currentPick.cast_name)}</span></div>`;
    }

    return `
      <div class="player-card ${isEliminated ? 'eliminated' : 'active'}">
        <span class="survivor-badge">${isEliminated ? 'OUT' : 'IN'}</span>
        <div class="player-name">${esc(p.name)}</div>
        ${pickHtml}
        ${isEliminated ? `<div class="eliminated-badge">ELIMINATED</div>` : ''}
        ${elimWeek ? `<div class="week-badge">${elimWeek}</div>` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">${title} <span class="count-badge">${players.length}</span></span>
      </div>
      <div class="player-grid">${cards}</div>
    </div>
  `;
}

function renderCastPreview(activeCast, eliminatedCast) {
  const renderCards = (list, elim) => list.map(c => {
    const initial = c.name.charAt(0).toUpperCase();
    const tribeHtml = c.tribe ? `<div class="cast-tribe">${esc(c.tribe)}</div>` : '';
    const weekHtml = c.eliminated_week ? `<div class="cast-week">Wk ${c.eliminated_week}</div>` : '';
    return `
      <div class="cast-card ${elim ? 'eliminated' : 'active'}">
        <div class="cast-avatar">${initial}</div>
        <div class="cast-name">${esc(c.name)}</div>
        ${tribeHtml}
        <div class="cast-status">${elim ? '🪦 Voted Out' : '✅ Active'}</div>
        ${weekHtml}
      </div>
    `;
  }).join('');

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">🌴 Survivor Cast <span class="count-badge">${activeCast.length} active</span></span>
      </div>
      <div class="cast-grid">${renderCards(activeCast, false)}</div>
      ${eliminatedCast.length ? `
        <div class="section-header" style="margin-top:20px">
          <span class="section-title">🪦 Voted Out <span class="count-badge">${eliminatedCast.length}</span></span>
        </div>
        <div class="cast-grid">${renderCards(eliminatedCast, true)}</div>
      ` : ''}
    </div>
  `;
}

/* ─── Picks Table Tab ─────────────────────────────────────────────────── */
function renderPicksTable(gamePlayers, allWeeks, allPicks, castMembers) {
  if (!gamePlayers.length) {
    return `<div class="empty-state"><div class="empty-icon">📋</div><p>No players in the pool yet.</p></div>`;
  }

  // Sort weeks
  const weeks = [...allWeeks].sort((a, b) => a.week_number - b.week_number);
  if (!weeks.length) {
    return `<div class="empty-state"><div class="empty-icon">📅</div><p>No weeks have been set up yet.</p></div>`;
  }

  // Sort players: active first, then by name
  const sortedPlayers = [...gamePlayers].sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    return a.name.localeCompare(b.name);
  });

  // Build a lookup: picks[playerId][week] = pick
  const pickMap = {};
  for (const pk of allPicks) {
    if (!pickMap[pk.game_player_id]) pickMap[pk.game_player_id] = {};
    pickMap[pk.game_player_id][pk.week_number] = pk;
  }

  const colSpan = weeks.length;

  let thead = `<tr>
    <th>Player</th>
    ${weeks.map(w => `<th>Wk ${w.week_number}${w.picks_allowed > 1 ? ` <small>(×${w.picks_allowed})</small>` : ''}</th>`).join('')}
    <th>Status</th>
  </tr>`;

  let tbody = sortedPlayers.map(player => {
    const rowClass = player.is_active ? '' : 'eliminated-row';
    const statusDot = `<span class="player-status-dot ${player.is_active ? 'active' : 'eliminated'}"></span>`;
    const status = player.is_active
      ? `${statusDot}In`
      : `${statusDot}Out Wk ${player.eliminated_week || '?'}`;

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
        <span class="pick-text ${textClass}">${esc(pick.cast_name)}</span>
      </span></td>`;
    }).join('');

    return `<tr class="${rowClass}">
      <td><strong>${esc(player.name)}</strong></td>
      ${cells}
      <td>${status}</td>
    </tr>`;
  }).join('');

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">📋 Picks by Week</span>
        <span style="font-size:.78rem;color:var(--text-dim)">
          <span class="dot safe" style="width:8px;height:8px;border-radius:50%;background:var(--green);display:inline-block"></span> Safe &nbsp;
          <span class="dot voted-out" style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></span> Voted Out &nbsp;
          <span class="dot pending" style="width:8px;height:8px;border-radius:50%;background:var(--accent);display:inline-block"></span> Pending
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
function renderCastTab(activeCast, eliminatedCast) {
  const renderCards = (list, elim) => {
    if (!list.length) return `<div class="empty-state"><p>None yet.</p></div>`;
    return `<div class="cast-grid">${list.map(c => {
      const initial = c.name.charAt(0).toUpperCase();
      const tribeHtml = c.tribe ? `<div class="cast-tribe">${esc(c.tribe)}</div>` : '';
      const weekHtml = c.eliminated_week ? `<div class="cast-week">Voted out week ${c.eliminated_week}</div>` : '';
      return `
        <div class="cast-card ${elim ? 'eliminated' : 'active'}">
          <div class="cast-avatar">${initial}</div>
          <div class="cast-name">${esc(c.name)}</div>
          ${tribeHtml}
          <div class="cast-status">${elim ? '🪦 Voted Out' : '✅ Still In'}</div>
          ${weekHtml}
        </div>
      `;
    }).join('')}</div>`;
  };

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">✅ Still In the Game <span class="count-badge">${activeCast.length}</span></span>
      </div>
      ${renderCards(activeCast, false)}
    </div>
    <div class="section">
      <div class="section-header">
        <span class="section-title">🪦 Voted Out <span class="count-badge">${eliminatedCast.length}</span></span>
      </div>
      ${renderCards(eliminatedCast, true)}
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

    // Show existing picks
    let existingHtml = '';
    if (existingPicks.length) {
      existingHtml = `
        <div class="alert alert-info" style="margin-bottom:12px">
          ✅ You've already picked this week: ${existingPicks.map(p => `<strong>${esc(p.cast_name)}</strong>`).join(', ')}
        </div>`;
    }
    document.getElementById('existingPicksArea').innerHTML = existingHtml;

    // Populate cast select
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
      document.getElementById('pickFormStatus').innerHTML = '<div class="alert alert-info">No available cast members to pick (you\'ve already picked everyone still active).</div>';
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

    // Refresh state so table updates
    await loadState();

    // Reload the available picks info to reflect the new pick
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
