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

function playerAvatarHtml(p) {
  const initial = p.name.charAt(0).toUpperCase();
  if (p.photo_url) {
    return `
      <div class="player-avatar-wrap">
        <img class="player-photo" src="${esc(p.photo_url)}" alt="${esc(p.name)}" loading="lazy"
             onerror="this.style.display='none';this.nextSibling.style.display='flex'">
        <div class="player-avatar-initial" style="display:none">${initial}</div>
      </div>`;
  }
  return `<div class="player-avatar-wrap"><div class="player-avatar-initial">${initial}</div></div>`;
}

function renderPlayerSection(title, players, allPicks, currentWeek, isEliminated) {
  if (!players.length) return '';

  const cards = players.map(p => {
    const currentPick = allPicks.find(pk =>
      pk.game_player_id === p.id && pk.week_number === currentWeek?.week_number
    );

    let pickHtml = '';
    if (currentWeek && !currentWeek.completed) {
      pickHtml = currentPick
        ? `<div class="player-pick">Ep ${currentWeek.week_number}: <span class="pick-name">${esc(currentPick.cast_name)}</span></div>`
        : `<div class="player-pick" style="color:var(--text-dim);font-style:italic">No pick yet</div>`;
    } else if (currentPick) {
      const cls = currentPick.cast_is_active ? 'safe' : 'bad-pick';
      pickHtml = `<div class="player-pick">Ep ${currentWeek.week_number}: <span class="${cls} pick-name">${esc(currentPick.cast_name)}</span></div>`;
    }

    const infoHtml = (p.age || p.hometown)
      ? `<div class="player-info">${[p.age ? p.age + ' yrs' : '', esc(p.hometown || '')].filter(Boolean).join(' · ')}</div>` : '';

    return `
      <div class="player-card ${isEliminated ? 'eliminated' : 'active'}">
        ${playerAvatarHtml(p)}
        <div class="player-name">${esc(p.name)}</div>
        ${infoHtml}
        ${pickHtml}
        ${isEliminated ? `<div class="eliminated-badge">OUT Ep ${p.eliminated_week || '?'}</div>` : ''}
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
  const photoHtml = c.photo_url
    ? `<img class="cast-photo" src="${esc(c.photo_url)}" alt="${esc(c.name)}" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='flex'">`
    : '';
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

function renderCastPreview(activeCast, eliminatedCast) {
  // Group active cast by tribe for the overview panel
  const tribes = ['Cila', 'Kalo', 'Vatu'];
  let castHtml = '';
  for (const tribe of tribes) {
    const members = activeCast.filter(c => c.tribe === tribe);
    if (!members.length) continue;
    const tribeClass = `tribe-${tribe.toLowerCase()}`;
    castHtml += `<div class="tribe-label tribe-badge ${tribeClass}">${tribe}</div>`;
    castHtml += `<div class="cast-grid" style="margin-bottom:10px">${members.map(c => castCardHtml(c, false)).join('')}</div>`;
  }
  // Any active without a tribe
  const noTribe = activeCast.filter(c => !tribes.includes(c.tribe));
  if (noTribe.length) castHtml += `<div class="cast-grid">${noTribe.map(c => castCardHtml(c, false)).join('')}</div>`;

  return `
    <div class="section">
      <div class="section-header">
        <span class="section-title">🌴 Survivor Cast <span class="count-badge">${activeCast.length} active</span></span>
      </div>
      ${castHtml}
      ${eliminatedCast.length ? `
        <div class="section-header" style="margin-top:20px">
          <span class="section-title">🪦 Voted Out <span class="count-badge">${eliminatedCast.length}</span></span>
        </div>
        <div class="cast-grid">${eliminatedCast.map(c => castCardHtml(c, true)).join('')}</div>
      ` : ''}
    </div>
  `;
}

/* ─── Picks Table Tab ─────────────────────────────────────────────────── */
function renderPicksTable(gamePlayers, allWeeks, allPicks, castMembers) {
  if (!gamePlayers.length) {
    return `<div class="empty-state"><div class="empty-icon">📋</div><p>No players in the pool yet.</p></div>`;
  }

  // Build cast lookup by id for super survivor resolution
  const castById = {};
  for (const c of castMembers) castById[c.id] = c;

  const weeks = [...allWeeks].sort((a, b) => a.week_number - b.week_number);
  if (!weeks.length) {
    return `<div class="empty-state"><div class="empty-icon">📅</div><p>No weeks set up yet.</p></div>`;
  }

  const sortedPlayers = [...gamePlayers].sort((a, b) => {
    if (a.is_active !== b.is_active) return b.is_active - a.is_active;
    return a.name.localeCompare(b.name);
  });

  // Build lookup: picks[playerId][week] = pick
  const pickMap = {};
  for (const pk of allPicks) {
    if (!pickMap[pk.game_player_id]) pickMap[pk.game_player_id] = {};
    pickMap[pk.game_player_id][pk.week_number] = pk;
  }

  let thead = `<tr>
    <th>Player</th>
    <th class="ss-col">🏆 Super<br>Survivor</th>
    ${weeks.map(w => `<th>Ep ${w.week_number}${w.picks_allowed > 1 ? `<br><small style="font-weight:400;color:var(--text-dim)">×${w.picks_allowed}</small>` : ''}</th>`).join('')}
    <th>Status</th>
  </tr>`;

  let tbody = sortedPlayers.map(player => {
    const rowClass = player.is_active ? '' : 'eliminated-row';
    const statusDot = `<span class="player-status-dot ${player.is_active ? 'active' : 'eliminated'}"></span>`;
    const status = player.is_active
      ? `${statusDot}In`
      : `${statusDot}Out Ep ${player.eliminated_week || '?'}`;

    const photoThumb = player.photo_url
      ? `<img src="${esc(player.photo_url)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;object-position:top;vertical-align:middle;margin-right:6px;flex-shrink:0" alt="${esc(player.name)}">`
      : `<span style="display:inline-flex;width:32px;height:32px;border-radius:50%;background:var(--surface2);align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:.8rem;margin-right:6px;vertical-align:middle;flex-shrink:0">${player.name.charAt(0)}</span>`;
    const playerInfo = (player.age || player.hometown)
      ? `<span style="font-size:.65rem;color:var(--text-dim);display:block;line-height:1.2">${[player.age ? player.age + ' yrs' : '', esc(player.hometown || '')].filter(Boolean).join(' · ')}</span>` : '';

    // Super Survivor cell
    const ssCast = player.super_survivor_cast_id ? castById[player.super_survivor_cast_id] : null;
    const ssName = ssCast ? ssCast.name.split(' ')[0] : '—'; // first name only
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

    return `<tr class="${rowClass}">
      <td style="white-space:nowrap;min-width:130px">
        <div style="display:flex;align-items:center">${photoThumb}<div><strong>${esc(player.name)}</strong>${playerInfo}</div></div>
      </td>
      ${ssCell}
      ${cells}
      <td>${status}</td>
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
