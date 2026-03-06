/* ─── Admin State ─────────────────────────────────────────────────────── */
let adminPw = '';
let adminData = null;

/* ─── Auth ────────────────────────────────────────────────────────────── */
async function adminLogin() {
  const pw = document.getElementById('adminPwInput').value;
  if (!pw) return;

  try {
    const res = await fetch('/api/admin/settings', {
      headers: { 'x-admin-password': pw }
    });
    if (!res.ok) throw new Error('Wrong password');
    adminPw = pw;
    document.getElementById('loginGate').classList.add('hidden');
    document.getElementById('adminContent').classList.remove('hidden');
    loadAdminData();
  } catch (err) {
    document.getElementById('loginStatus').innerHTML =
      `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

/* ─── API Helper ──────────────────────────────────────────────────────── */
async function adminApi(path, opts = {}) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': adminPw,
    },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

/* ─── Load All Admin Data ─────────────────────────────────────────────── */
async function loadAdminData() {
  try {
    const [state, settings] = await Promise.all([
      fetch('/api/state').then(r => r.json()),
      adminApi('/api/admin/settings'),
    ]);
    adminData = state;

    // Update page subtitle
    document.getElementById('adminSeasonName').textContent = settings.season_name || 'Survivor Pool';

    renderWeekTab();
    renderCastTab();
    renderPlayersTab();
    renderPicksTab();
    renderSettingsTab(settings);

  } catch (err) {
    showAdminAlert('error', 'Failed to load data: ' + err.message);
  }
}

/* ─── Tab Switching ───────────────────────────────────────────────────── */
function switchAdminTab(id, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('atab-' + id).classList.add('active');
  btn.classList.add('active');
}

/* ─── Week Tab ────────────────────────────────────────────────────────── */
function renderWeekTab() {
  const { currentWeek, allWeeks } = adminData;

  // Current week info
  const cwInfo = currentWeek
    ? `<strong>Week ${currentWeek.week_number}</strong> — ${currentWeek.picks_allowed} pick${currentWeek.picks_allowed > 1 ? 's' : ''} allowed — ${currentWeek.completed ? '🔒 Closed' : '🟢 Open for picks'}`
    : 'No current week set.';
  document.getElementById('currentWeekInfo').innerHTML = cwInfo;

  // Pre-fill inputs
  if (currentWeek) {
    document.getElementById('newWeekNumber').value = currentWeek.week_number;
    document.getElementById('newWeekPicks').value = currentWeek.picks_allowed;
    document.getElementById('eliminateWeekNum').placeholder = `Current (${currentWeek.week_number})`;
  }

  // All weeks table
  const weeksEl = document.getElementById('allWeeksList');
  if (!allWeeks.length) {
    weeksEl.innerHTML = '<div class="empty-state"><p>No weeks configured.</p></div>';
  } else {
    const rows = allWeeks.map(w => `
      <tr>
        <td><strong>Week ${w.week_number}</strong> ${w.is_current ? '<span class="count-badge" style="color:var(--accent)">CURRENT</span>' : ''}</td>
        <td>${w.picks_allowed} pick${w.picks_allowed > 1 ? 's' : ''}</td>
        <td>${w.completed ? '🔒 Closed' : '🟢 Open'}</td>
        <td style="display:flex;gap:6px;flex-wrap:wrap">
          ${!w.is_current ? `<button class="btn btn-secondary btn-sm" onclick="setWeekCurrent(${w.week_number})">Set Current</button>` : ''}
          ${!w.completed
            ? `<button class="btn btn-danger btn-sm" onclick="toggleWeekComplete(${w.week_number}, true)">Close Week</button>`
            : `<button class="btn btn-secondary btn-sm" onclick="toggleWeekComplete(${w.week_number}, false)">Re-open</button>`
          }
        </td>
      </tr>
    `).join('');
    weeksEl.innerHTML = `
      <div class="table-scroll">
        <table class="picks-table">
          <thead><tr><th>Week</th><th>Picks</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  // Populate cast select for eliminate
  const activeCast = adminData.castMembers.filter(c => c.is_active);
  const castSel = document.getElementById('eliminateCastSelect');
  castSel.innerHTML = `<option value="">— Select cast member —</option>` +
    activeCast.map(c => `<option value="${c.id}">${esc(c.name)}${c.tribe ? ' (' + esc(c.tribe) + ')' : ''}</option>`).join('');
}

async function setCurrentWeek() {
  const wn = parseInt(document.getElementById('newWeekNumber').value);
  const picks = parseInt(document.getElementById('newWeekPicks').value);
  if (!wn || wn < 1) return showAdminAlert('error', 'Enter a valid week number');

  try {
    await adminApi('/api/admin/weeks', { method: 'POST', body: { week_number: wn, picks_allowed: picks } });
    await adminApi(`/api/admin/weeks/${wn}/set-current`, { method: 'POST', body: {} });
    await loadAdminData();
    showAdminAlert('success', `Week ${wn} is now the current week.`);
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function setWeekCurrent(wn) {
  try {
    await adminApi(`/api/admin/weeks/${wn}/set-current`, { method: 'POST', body: {} });
    await loadAdminData();
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function toggleWeekComplete(wn, completed) {
  try {
    await adminApi(`/api/admin/weeks/${wn}/complete`, { method: 'POST', body: { completed } });
    await loadAdminData();
    showAdminAlert('success', completed ? `Week ${wn} closed.` : `Week ${wn} re-opened.`);
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function eliminateCastMember() {
  const castId = document.getElementById('eliminateCastSelect').value;
  const weekNum = document.getElementById('eliminateWeekNum').value;
  if (!castId) return;

  const resultEl = document.getElementById('eliminateResult');
  resultEl.innerHTML = '';

  try {
    const result = await adminApi(`/api/admin/cast/${castId}/eliminate`, {
      method: 'POST',
      body: { week: weekNum ? parseInt(weekNum) : undefined }
    });
    let msg = `✅ <strong>${esc(result.castEliminated)}</strong> marked as voted out.`;
    if (result.poolPlayersEliminated.length) {
      msg += ` Pool players eliminated: <strong>${result.poolPlayersEliminated.map(esc).join(', ')}</strong>`;
    } else {
      msg += ' No pool players were eliminated.';
    }
    resultEl.innerHTML = `<div class="alert alert-success">${msg}</div>`;
    await loadAdminData();
  } catch (err) {
    resultEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

/* ─── Cast Tab ────────────────────────────────────────────────────────── */
function renderCastTab() {
  const { castMembers } = adminData;
  const active = castMembers.filter(c => c.is_active);
  const eliminated = castMembers.filter(c => !c.is_active);

  const rows = [...active, ...eliminated].map(c => `
    <tr>
      <td><strong>${esc(c.name)}</strong></td>
      <td>${esc(c.tribe) || '<span style="color:var(--text-dim)">—</span>'}</td>
      <td>${c.is_active ? '✅ Active' : `🪦 Out (Wk ${c.eliminated_week || '?'})`}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${c.is_active
          ? `<button class="btn btn-danger btn-sm" onclick="quickEliminateCast(${c.id}, '${esc(c.name)}')">Vote Out</button>`
          : `<button class="btn btn-secondary btn-sm" onclick="restoreCast(${c.id})">Restore</button>`
        }
        <button class="btn btn-danger btn-sm" onclick="deleteCast(${c.id}, '${esc(c.name)}')">Delete</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('castRosterList').innerHTML = castMembers.length ? `
    <div class="table-scroll">
      <table class="picks-table">
        <thead><tr><th>Name</th><th>Tribe</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  ` : `<div class="empty-state"><div class="empty-icon">🌴</div><p>No cast members added yet.</p></div>`;
}

async function addCastMember() {
  const name = document.getElementById('newCastName').value.trim();
  const tribe = document.getElementById('newCastTribe').value.trim();
  const statusEl = document.getElementById('addCastStatus');

  if (!name) { statusEl.innerHTML = '<div class="alert alert-error">Name is required.</div>'; return; }

  try {
    await adminApi('/api/admin/cast', { method: 'POST', body: { name, tribe } });
    document.getElementById('newCastName').value = '';
    document.getElementById('newCastTribe').value = '';
    statusEl.innerHTML = `<div class="alert alert-success">✅ ${esc(name)} added.</div>`;
    await loadAdminData();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

async function quickEliminateCast(id, name) {
  const week = adminData.currentWeek?.week_number;
  if (!week) { showAdminAlert('error', 'Set a current week first.'); return; }
  if (!confirm(`Mark ${name} as voted out in Week ${week}? This will also eliminate any pool players who picked them this week.`)) return;
  try {
    const result = await adminApi(`/api/admin/cast/${id}/eliminate`, {
      method: 'POST', body: { week }
    });
    let msg = `✅ ${esc(result.castEliminated)} voted out.`;
    if (result.poolPlayersEliminated.length) msg += ` Pool eliminated: ${result.poolPlayersEliminated.join(', ')}`;
    showAdminAlert('success', msg);
    await loadAdminData();
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function restoreCast(id) {
  try {
    await adminApi(`/api/admin/cast/${id}/restore`, { method: 'POST', body: {} });
    await loadAdminData();
    showAdminAlert('success', 'Cast member restored to active.');
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function deleteCast(id, name) {
  if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
  try {
    await adminApi(`/api/admin/cast/${id}`, { method: 'DELETE' });
    await loadAdminData();
    showAdminAlert('success', `${name} deleted.`);
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

/* ─── Players Tab ─────────────────────────────────────────────────────── */
function renderPlayersTab() {
  const { gamePlayers } = adminData;
  const active = gamePlayers.filter(p => p.is_active);
  const eliminated = gamePlayers.filter(p => !p.is_active);

  const rows = [...active, ...eliminated].map(p => `
    <tr class="${p.is_active ? '' : 'eliminated-row'}">
      <td><strong>${esc(p.name)}</strong></td>
      <td>${p.is_active ? '🟢 In' : `💀 Out (Wk ${p.eliminated_week || '?'})`}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${!p.is_active
          ? `<button class="btn btn-secondary btn-sm" onclick="restorePlayer(${p.id})">Restore</button>`
          : ''
        }
        <button class="btn btn-danger btn-sm" onclick="deletePlayer(${p.id}, '${esc(p.name)}')">Delete</button>
      </td>
    </tr>
  `).join('');

  document.getElementById('playersRosterList').innerHTML = gamePlayers.length ? `
    <div class="table-scroll">
      <table class="picks-table">
        <thead><tr><th>Name</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  ` : `<div class="empty-state"><div class="empty-icon">👥</div><p>No pool players added yet.</p></div>`;
}

async function addPlayer() {
  const name = document.getElementById('newPlayerName').value.trim();
  const statusEl = document.getElementById('addPlayerStatus');
  if (!name) { statusEl.innerHTML = '<div class="alert alert-error">Name is required.</div>'; return; }
  try {
    await adminApi('/api/admin/players', { method: 'POST', body: { name } });
    document.getElementById('newPlayerName').value = '';
    statusEl.innerHTML = `<div class="alert alert-success">✅ ${esc(name)} added.</div>`;
    await loadAdminData();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

async function restorePlayer(id) {
  try {
    await adminApi(`/api/admin/players/${id}/restore`, { method: 'POST', body: {} });
    await loadAdminData();
    showAdminAlert('success', 'Player restored to active.');
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function deletePlayer(id, name) {
  if (!confirm(`Delete ${name}? If they have picks, this will fail.`)) return;
  try {
    await adminApi(`/api/admin/players/${id}`, { method: 'DELETE' });
    await loadAdminData();
    showAdminAlert('success', `${name} deleted.`);
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

/* ─── Picks Tab ───────────────────────────────────────────────────────── */
function renderPicksTab() {
  const { allPicks, gamePlayers, castMembers, allWeeks } = adminData;

  // Populate manual pick dropdowns
  document.getElementById('manualPickPlayer').innerHTML =
    `<option value="">— Player —</option>` +
    gamePlayers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  document.getElementById('manualPickCast').innerHTML =
    `<option value="">— Cast Member —</option>` +
    castMembers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (!document.getElementById('manualPickWeek').value && adminData.currentWeek) {
    document.getElementById('manualPickWeek').value = adminData.currentWeek.week_number;
  }

  const picksEl = document.getElementById('allPicksList');
  if (!allPicks.length) {
    picksEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No picks recorded yet.</p></div>';
    return;
  }

  const rows = allPicks.map(pk => `
    <tr>
      <td>${esc(pk.player_name)}</td>
      <td>Week ${pk.week_number}</td>
      <td>${esc(pk.cast_name)} ${pk.cast_is_active ? '' : '<span style="color:var(--red)">(voted out)</span>'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="deletePick(${pk.id})">Delete</button></td>
    </tr>
  `).join('');

  picksEl.innerHTML = `
    <div class="table-scroll">
      <table class="picks-table">
        <thead><tr><th>Player</th><th>Week</th><th>Pick</th><th>Action</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function deletePick(id) {
  if (!confirm('Delete this pick?')) return;
  try {
    await adminApi(`/api/admin/picks/${id}`, { method: 'DELETE' });
    await loadAdminData();
    showAdminAlert('success', 'Pick deleted.');
  } catch (err) {
    showAdminAlert('error', err.message);
  }
}

async function addManualPick() {
  const gp = document.getElementById('manualPickPlayer').value;
  const cm = document.getElementById('manualPickCast').value;
  const wk = document.getElementById('manualPickWeek').value;
  const statusEl = document.getElementById('manualPickStatus');

  if (!gp || !cm || !wk) {
    statusEl.innerHTML = '<div class="alert alert-error">All fields are required.</div>';
    return;
  }
  try {
    await adminApi('/api/admin/picks', {
      method: 'POST',
      body: { gamePlayerId: parseInt(gp), castMemberId: parseInt(cm), weekNumber: parseInt(wk) }
    });
    statusEl.innerHTML = '<div class="alert alert-success">✅ Pick added.</div>';
    await loadAdminData();
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

/* ─── Settings Tab ────────────────────────────────────────────────────── */
function renderSettingsTab(settings) {
  document.getElementById('settingSeasonName').value = settings.season_name || '';
  document.getElementById('settingSubtitle').value = settings.season_subtitle || '';
}

async function saveSettings() {
  const season_name = document.getElementById('settingSeasonName').value;
  const season_subtitle = document.getElementById('settingSubtitle').value;
  try {
    await adminApi('/api/admin/settings', { method: 'POST', body: { season_name, season_subtitle } });
    document.getElementById('settingsStatus').innerHTML = '<div class="alert alert-success">✅ Settings saved.</div>';
    document.getElementById('adminSeasonName').textContent = season_name;
  } catch (err) {
    document.getElementById('settingsStatus').innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

async function changePassword() {
  const newPw = document.getElementById('newAdminPw').value;
  const statusEl = document.getElementById('pwChangeStatus');
  if (!newPw) { statusEl.innerHTML = '<div class="alert alert-error">Enter a new password.</div>'; return; }
  try {
    await adminApi('/api/admin/settings', { method: 'POST', body: { admin_password: newPw } });
    adminPw = newPw;
    statusEl.innerHTML = '<div class="alert alert-success">✅ Password changed.</div>';
    document.getElementById('newAdminPw').value = '';
  } catch (err) {
    statusEl.innerHTML = `<div class="alert alert-error">❌ ${err.message}</div>`;
  }
}

/* ─── Alert Helper ────────────────────────────────────────────────────── */
function showAdminAlert(type, msg) {
  const el = document.getElementById('adminAlert');
  el.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

/* ─── Utility ─────────────────────────────────────────────────────────── */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
