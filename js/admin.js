// ============================================
// ADMIN.JS — Cairo UTC+2 fixed
// ============================================

let adminSession = null;
let roundsCache  = [];
let matchesCache = [];
let db           = null;

// ============================================
// TIMEZONE HELPERS
// Egypt does NOT use DST — always UTC+2
// ============================================

function formatCairoDate(isoString) {
  if (!isoString) return 'No date set';
  return new Date(isoString).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday:  'short',
    day:      'numeric',
    month:    'short',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false
  }) + ' 🇪🇬';
}

// Convert Cairo local input → UTC
// Egypt is always UTC+2, no DST since 2011
function cairoInputToUTC(localDatetimeStr) {
  if (!localDatetimeStr) return null;

  const CAIRO_OFFSET_HOURS = 2;
  const [datePart, timePart] = localDatetimeStr.split('T');
  const [year, month, day]   = datePart.split('-').map(Number);
  const [hour, minute]       = timePart.split(':').map(Number);

  // Subtract Cairo offset to get UTC
  const utcDate = new Date(Date.UTC(
    year,
    month - 1,
    day,
    hour - CAIRO_OFFSET_HOURS,
    minute
  ));

  return utcDate.toISOString();
}

// Live preview of saved time
function previewCairoTime(val) {
  const preview = document.getElementById('cairo-preview');
  if (!val) { preview.style.display = 'none'; return; }

  const utcString = cairoInputToUTC(val);
  if (!utcString) { preview.style.display = 'none'; return; }

  const displayBack = new Date(utcString).toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    weekday:  'long',
    day:      'numeric',
    month:    'long',
    year:     'numeric',
    hour:     '2-digit',
    minute:   '2-digit',
    hour12:   false
  });

  preview.style.display = 'block';
  preview.innerHTML = `
    ✅ Saves as: <strong>${displayBack} (Cairo)</strong><br>
    <span style="color:var(--text-muted); font-size:0.78rem">
      UTC stored: ${utcString}
    </span>`;
}

// ============================================
// INIT
// ============================================
async function init() {
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase not loaded');
    return;
  }

  db = window.supabase.createClient(
    'https://bpmmimvlwuokipawabrk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbW1pbXZsd3Vva2lwYXdhYnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjE5NTMsImV4cCI6MjA5NzQzNzk1M30.U9S3vUNhyuqqirMNdamRBqdh67JbHNatBkQvdF3qu3k'
  );

  const { data: { session } } = await db.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  adminSession = session;
  await loadAll();
}

// ============================================
// LOAD ALL
// ============================================
async function loadAll() {
  const [roundsRes, matchesRes] = await Promise.all([
    db.from('rounds')
      .select('id, name, is_active')
      .order('id'),
    db.from('matches')
      .select('id, round_id, home_team, away_team, match_date, home_score, away_score, is_finished')
      .order('match_date', { ascending: true })
  ]);

  if (roundsRes.error) {
    showToast('Error loading: ' + roundsRes.error.message, 'error');
    return;
  }

  roundsCache  = roundsRes.data  || [];
  matchesCache = matchesRes.data || [];

  renderRoundsList();
  renderMatchesList();
  renderResultsList();
  populateRoundSelect();
}

// ============================================
// TAB SWITCHING
// ============================================
function switchAdminTab(tab, el) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');
}

// ============================================
// ROUNDS
// ============================================
function renderRoundsList() {
  const container = document.getElementById('rounds-list');
  if (roundsCache.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No rounds yet. Add one above!</p>
      </div>`;
    return;
  }

  let html = '';
  roundsCache.forEach(r => {
    html += `
      <div class="admin-match-item">
        <div class="admin-match-info">
          <strong>${r.name}</strong>
          <small>${r.is_active
            ? '🟢 Active — shown to players'
            : '⚪ Inactive'}</small>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
          ${!r.is_active ? `
            <button class="btn btn-ghost btn-sm"
                    onclick="setActiveRound(${r.id})">
              Set Active
            </button>` : ''}
          <button class="btn btn-danger btn-sm"
                  onclick="deleteRound(${r.id})">
            Delete
          </button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

async function addRound() {
  const name     = document.getElementById('round-name').value.trim();
  const isActive = document.getElementById('round-active').checked;

  if (!name) { showToast('Enter a round name!', 'error'); return; }

  const { error } = await db
    .from('rounds')
    .insert({ name, is_active: isActive });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  document.getElementById('round-name').value    = '';
  document.getElementById('round-active').checked = false;
  showToast('Round added!');
  await loadAll();
}

async function setActiveRound(roundId) {
  await db.from('rounds').update({ is_active: false }).neq('id', 0);
  await db.from('rounds').update({ is_active: true }).eq('id', roundId);
  showToast('Active round updated!');
  await loadAll();
}

async function deleteRound(roundId) {
  if (!confirm('Delete this round and ALL its matches?')) return;
  const { error } = await db.from('rounds').delete().eq('id', roundId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Round deleted');
  await loadAll();
}

// ============================================
// MATCHES
// ============================================
function populateRoundSelect() {
  const select = document.getElementById('match-round');
  if (!select) return;
  if (roundsCache.length === 0) {
    select.innerHTML = '<option value="">No rounds yet — add one first!</option>';
    return;
  }
  select.innerHTML = roundsCache.map(r =>
    `<option value="${r.id}">
       ${r.name}${r.is_active ? ' (Active)' : ''}
     </option>`
  ).join('');
}

function renderMatchesList() {
  const container = document.getElementById('matches-list');
  if (matchesCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No matches yet.</p></div>';
    return;
  }

  const byRound = {};
  matchesCache.forEach(m => {
    if (!byRound[m.round_id]) byRound[m.round_id] = [];
    byRound[m.round_id].push(m);
  });

  let html = '';
  roundsCache.forEach(r => {
    const ms = byRound[r.id] || [];
    if (ms.length === 0) return;

    html += `<div class="round-label"><h2>${r.name}</h2></div>`;
    ms.forEach(m => {
      html += `
        <div class="admin-match-item">
          <div class="admin-match-info">
            <strong>${m.home_team} vs ${m.away_team}</strong>
            <small>🗓 ${formatCairoDate(m.match_date)}</small>
          </div>
          <button class="btn btn-danger btn-sm"
                  onclick="deleteMatch(${m.id})">
            Delete
          </button>
        </div>`;
    });
  });

  container.innerHTML = html || '<div class="empty-state"><p>No matches.</p></div>';
}

async function addMatch() {
  const roundId   = document.getElementById('match-round').value;
  const homeTeam  = document.getElementById('home-team').value.trim();
  const awayTeam  = document.getElementById('away-team').value.trim();
  const localTime = document.getElementById('match-date').value;

  if (!roundId || !homeTeam || !awayTeam) {
    showToast('Fill in all required fields!', 'error');
    return;
  }

  // Convert Cairo time → UTC
  const utcTime = localTime ? cairoInputToUTC(localTime) : null;

  const { error } = await db.from('matches').insert({
    round_id:   parseInt(roundId),
    home_team:  homeTeam,
    away_team:  awayTeam,
    match_date: utcTime
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  document.getElementById('home-team').value      = '';
  document.getElementById('away-team').value      = '';
  document.getElementById('match-date').value     = '';
  document.getElementById('cairo-preview').style.display = 'none';

  showToast('✅ Match added! ' + formatCairoDate(utcTime));
  await loadAll();
}

async function deleteMatch(matchId) {
  if (!confirm('Delete this match and all its predictions?')) return;
  const { error } = await db.from('matches').delete().eq('id', matchId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Match deleted');
  await loadAll();
}

// ============================================
// RESULTS — always editable, joker-aware
// ============================================
function renderResultsList() {
  const container = document.getElementById('results-list');

  if (matchesCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No matches yet.</p></div>';
    return;
  }

  const byRound = {};
  matchesCache.forEach(m => {
    if (!byRound[m.round_id]) byRound[m.round_id] = [];
    byRound[m.round_id].push(m);
  });

  let html = '';

  roundsCache.forEach(r => {
    const ms = byRound[r.id] || [];
    if (ms.length === 0) return;

    html += `<div class="round-label"><h2>${r.name}</h2></div>`;

    ms.forEach(m => {
      const isFinished  = m.is_finished;
      const currentHome = m.home_score ?? '';
      const currentAway = m.away_score ?? '';

      html += `
        <div class="admin-match-item"
             style="flex-direction:column; align-items:stretch; gap:16px;
                    ${isFinished ? 'border-color:var(--green)' : ''}">

          <!-- Header -->
          <div style="display:flex; justify-content:space-between;
               align-items:center; flex-wrap:wrap; gap:8px">
            <div class="admin-match-info">
              <strong style="font-size:1rem">
                ${m.home_team} vs ${m.away_team}
              </strong>
              <small>🗓 ${formatCairoDate(m.match_date)}</small>
              <small style="margin-top:2px">
                ${isFinished
                  ? `✅ Current: <strong style="color:var(--green)">
                       ${m.home_score} – ${m.away_score}
                     </strong>`
                  : '⏳ Not started yet'}
              </small>
            </div>
            ${isFinished ? `
              <button class="btn btn-ghost btn-sm"
                      onclick="unfinishMatch(${m.id})">
                ↩ Revert
              </button>` : ''}
          </div>

          <!-- Score inputs -->
          <div style="display:flex; align-items:flex-end;
               gap:16px; flex-wrap:wrap">

            <!-- Home -->
            <div style="display:flex; flex-direction:column;
                 align-items:center; gap:8px">
              <span style="font-size:0.75rem; color:var(--text-muted);
                    text-transform:uppercase; letter-spacing:0.5px; font-weight:600">
                ${m.home_team}
              </span>
              <div style="display:flex; align-items:center; gap:6px">
                <button class="stepper-btn"
                        onclick="changeScore('res-home-${m.id}', -1)">−</button>
                <input type="number" id="res-home-${m.id}"
                       value="${currentHome}" min="0" max="20"
                       style="width:64px; background:var(--dark);
                              border:2px solid var(--green); border-radius:10px;
                              padding:10px; color:var(--text); font-size:1.4rem;
                              font-weight:800; text-align:center; outline:none">
                <button class="stepper-btn"
                        onclick="changeScore('res-home-${m.id}', 1)">+</button>
              </div>
            </div>

            <span style="font-size:1.8rem; color:var(--text-muted);
                         font-weight:800; padding-bottom:10px">–</span>

            <!-- Away -->
            <div style="display:flex; flex-direction:column;
                 align-items:center; gap:8px">
              <span style="font-size:0.75rem; color:var(--text-muted);
                    text-transform:uppercase; letter-spacing:0.5px; font-weight:600">
                ${m.away_team}
              </span>
              <div style="display:flex; align-items:center; gap:6px">
                <button class="stepper-btn"
                        onclick="changeScore('res-away-${m.id}', -1)">−</button>
                <input type="number" id="res-away-${m.id}"
                       value="${currentAway}" min="0" max="20"
                       style="width:64px; background:var(--dark);
                              border:2px solid var(--green); border-radius:10px;
                              padding:10px; color:var(--text); font-size:1.4rem;
                              font-weight:800; text-align:center; outline:none">
                <button class="stepper-btn"
                        onclick="changeScore('res-away-${m.id}', 1)">+</button>
              </div>
            </div>

            <!-- Save button -->
            <div style="margin-left:auto; padding-bottom:4px">
              <button class="btn btn-primary"
                      id="save-btn-${m.id}"
                      onclick="saveResult(${m.id})">
                ${isFinished ? '🔄 Update Score' : '🟢 Go Live'}
              </button>
            </div>

          </div>
        </div>`;
    });
  });

  container.innerHTML = html;
}

// ---- Stepper ----
function changeScore(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = Math.max(0, Math.min(20, (parseInt(input.value) || 0) + delta));
}

// ---- Save result ----
async function saveResult(matchId) {
  const homeScore = parseInt(document.getElementById(`res-home-${matchId}`).value);
  const awayScore = parseInt(document.getElementById(`res-away-${matchId}`).value);
  const btn       = document.getElementById(`save-btn-${matchId}`);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Saving...';

  // Update match
  const { error: matchError } = await db
    .from('matches')
    .update({
      home_score:  homeScore,
      away_score:  awayScore,
      is_finished: true
    })
    .eq('id', matchId);

  if (matchError) {
    showToast('Error: ' + matchError.message, 'error');
    btn.disabled    = false;
    btn.textContent = '🔄 Update Score';
    return;
  }

  // Get predictions
  const { data: preds } = await db
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away, points_earned')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Score saved! No predictions to score.');
    await loadAll();
    return;
  }

  // Get jokers
  const { data: jokers } = await db
    .from('jokers')
    .select('user_id')
    .eq('match_id', matchId);

  const jokerUserIds = new Set((jokers || []).map(j => j.user_id));
  const actualResult = Math.sign(homeScore - awayScore);

  for (const p of preds) {
    const isPerfect  = p.predicted_home === homeScore
                    && p.predicted_away === awayScore;
    const predResult = Math.sign(p.predicted_home - p.predicted_away);
    const isCorrect  = predResult === actualResult;

    const basePoints = isPerfect ? 6 : isCorrect ? 3 : 0;
    const newPoints  = jokerUserIds.has(p.user_id) ? basePoints * 2 : basePoints;
    const oldPoints  = p.points_earned || 0;
    const diff       = newPoints - oldPoints;

    await db
      .from('predictions')
      .update({ points_earned: newPoints })
      .eq('id', p.id);

    if (diff !== 0) {
      const { data: profile } = await db
        .from('profiles')
        .select('total_points')
        .eq('id', p.user_id)
        .single();

      await db
        .from('profiles')
        .update({
          total_points: Math.max(0, (profile?.total_points || 0) + diff)
        })
        .eq('id', p.user_id);
    }
  }

  showToast(`✅ Score saved! ${preds.length} predictions scored.`);
  await loadAll();
}

// ---- Revert match ----
async function unfinishMatch(matchId) {
  if (!confirm('Revert this match and remove all points earned from it?')) return;

  const { data: preds } = await db
    .from('predictions')
    .select('id, user_id, points_earned')
    .eq('match_id', matchId);

  if (preds && preds.length > 0) {
    for (const p of preds) {
      if (p.points_earned > 0) {
        const { data: profile } = await db
          .from('profiles')
          .select('total_points')
          .eq('id', p.user_id)
          .single();

        await db
          .from('profiles')
          .update({
            total_points: Math.max(0, (profile?.total_points || 0) - p.points_earned)
          })
          .eq('id', p.user_id);
      }
      await db
        .from('predictions')
        .update({ points_earned: 0 })
        .eq('id', p.id);
    }
  }

  await db
    .from('matches')
    .update({ home_score: null, away_score: null, is_finished: false })
    .eq('id', matchId);

  showToast('Match reverted to upcoming');
  await loadAll();
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  toast.className   = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

init();
