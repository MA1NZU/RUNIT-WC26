// ============================================
// ADMIN.JS
// ============================================

let adminSession = null;
let roundsCache = [];
let matchesCache = [];
let db = null;

async function init() {
  if (typeof window.supabase === 'undefined') {
    console.error('Supabase library not loaded');
    return;
  }

  db = window.supabase.createClient(
    'https://bpmmimvlwuokipawabrk.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbW1pbXZsd3Vva2lwYXdhYnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjE5NTMsImV4cCI6MjA5NzQzNzk1M30.U9S3vUNhyuqqirMNdamRBqdh67JbHNatBkQvdF3qu3k'
  );

  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  adminSession = session;
  await loadAll();
}

async function loadAll() {
  const [roundsRes, matchesRes] = await Promise.all([
    db.from('rounds').select('id, name, is_active').order('id'),
    db.from('matches').select('id, round_id, home_team, away_team, match_date, home_score, away_score, is_finished').order('id')
  ]);

  if (roundsRes.error) {
    showToast('Error loading: ' + roundsRes.error.message, 'error');
    return;
  }

  roundsCache = roundsRes.data || [];
  matchesCache = matchesRes.data || [];

  renderRoundsList();
  renderMatchesList();
  renderResultsList();
  populateRoundSelect();
}

// ============================================
// TAB SWITCHING
// ============================================
function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');
}

// ============================================
// ROUNDS
// ============================================
function renderRoundsList() {
  const container = document.getElementById('rounds-list');
  if (roundsCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No rounds yet. Add one above!</p></div>';
    return;
  }

  let html = '';
  roundsCache.forEach(r => {
    html += `
      <div class="admin-match-item">
        <div class="admin-match-info">
          <strong>${r.name}</strong>
          <small>${r.is_active ? '🟢 Active' : '⚪ Inactive'}</small>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          ${!r.is_active
            ? `<button class="btn btn-ghost btn-sm" onclick="setActiveRound(${r.id})">
                Set Active
               </button>`
            : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteRound(${r.id})">
            Delete
          </button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

async function addRound() {
  const name = document.getElementById('round-name').value.trim();
  const isActive = document.getElementById('round-active').checked;

  if (!name) { showToast('Enter a round name!', 'error'); return; }

  const { error } = await db.from('rounds').insert({ name, is_active: isActive });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  document.getElementById('round-name').value = '';
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
    select.innerHTML = '<option value="">No rounds yet - add one first!</option>';
    return;
  }
  select.innerHTML = roundsCache.map(r =>
    `<option value="${r.id}">${r.name}</option>`
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
      const dateStr = m.match_date
        ? new Date(m.match_date).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : 'No date set';
      html += `
        <div class="admin-match-item">
          <div class="admin-match-info">
            <strong>${m.home_team} vs ${m.away_team}</strong>
            <small>${dateStr}</small>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteMatch(${m.id})">
            Delete
          </button>
        </div>`;
    });
  });

  container.innerHTML = html || '<div class="empty-state"><p>No matches.</p></div>';
}

async function addMatch() {
  const roundId = document.getElementById('match-round').value;
  const homeTeam = document.getElementById('home-team').value.trim();
  const awayTeam = document.getElementById('away-team').value.trim();
  const matchDate = document.getElementById('match-date').value;

  if (!roundId || !homeTeam || !awayTeam) {
    showToast('Fill in all required fields!', 'error');
    return;
  }

  const { error } = await db.from('matches').insert({
    round_id: parseInt(roundId),
    home_team: homeTeam,
    away_team: awayTeam,
    match_date: matchDate || null
  });

  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  document.getElementById('home-team').value = '';
  document.getElementById('away-team').value = '';
  document.getElementById('match-date').value = '';
  showToast('Match added!');
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
// RESULTS — Always editable, live recalculation
// Points: Perfect = 6pts, Correct outcome = 3pts, Wrong = 0pts
// ============================================
function renderResultsList() {
  const container = document.getElementById('results-list');

  if (matchesCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No matches yet.</p></div>';
    return;
  }

  // Group by round
  const byRound = {};
  matchesCache.forEach(m => {
    if (!byRound[m.round_id]) byRound[m.round_id] = [];
    byRound[m.round_id].push(m);
  });

  let html = `
    <!-- Points legend -->
    <div class="card" style="margin-bottom:20px; display:flex; gap:16px; flex-wrap:wrap; align-items:center">
      <span style="font-size:0.85rem; color:var(--text-muted)">Points system:</span>
      <span class="result-badge exact">⚡ Perfect Score = 6pts</span>
      <span class="result-badge correct">✓ Correct Outcome = 3pts</span>
      <span class="result-badge wrong">✗ Wrong = 0pts</span>
    </div>`;

  roundsCache.forEach(r => {
    const ms = byRound[r.id] || [];
    if (ms.length === 0) return;

    html += `<div class="round-label"><h2>${r.name}</h2></div>`;

    ms.forEach(m => {
      const isFinished = m.is_finished;
      const currentHome = m.home_score ?? '';
      const currentAway = m.away_score ?? '';

      html += `
        <div class="admin-match-item" style="flex-direction:column; align-items:stretch; gap:16px">

          <!-- Match header -->
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px">
            <div class="admin-match-info">
              <strong>${m.home_team} vs ${m.away_team}</strong>
              <small>
                ${isFinished
                  ? `✅ Current score: <strong>${m.home_score} – ${m.away_score}</strong>`
                  : '⏳ Not started'}
              </small>
            </div>
            ${isFinished ? `
              <button class="btn btn-ghost btn-sm" onclick="unfinishMatch(${m.id})">
                ↩ Revert to Upcoming
              </button>` : ''}
          </div>

          <!-- Score input — always visible and editable -->
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap">

            <!-- Home score -->
            <div style="display:flex; flex-direction:column; align-items:center; gap:6px">
              <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase">
                ${m.home_team}
              </span>
              <div style="display:flex; align-items:center; gap:6px">
                <button class="stepper-btn" onclick="changeScore('res-home-${m.id}', -1)">−</button>
                <input type="number" id="res-home-${m.id}"
                       value="${currentHome}" min="0" max="20"
                       style="width:60px; background:var(--dark); border:2px solid var(--green);
                              border-radius:10px; padding:10px; color:var(--text);
                              font-size:1.3rem; font-weight:800; text-align:center; outline:none">
                <button class="stepper-btn" onclick="changeScore('res-home-${m.id}', 1)">+</button>
              </div>
            </div>

            <span style="font-size:1.5rem; color:var(--text-muted); font-weight:800; 
                         align-self:flex-end; padding-bottom:8px">–</span>

            <!-- Away score -->
            <div style="display:flex; flex-direction:column; align-items:center; gap:6px">
              <span style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase">
                ${m.away_team}
              </span>
              <div style="display:flex; align-items:center; gap:6px">
                <button class="stepper-btn" onclick="changeScore('res-away-${m.id}', -1)">−</button>
                <input type="number" id="res-away-${m.id}"
                       value="${currentAway}" min="0" max="20"
                       style="width:60px; background:var(--dark); border:2px solid var(--green);
                              border-radius:10px; padding:10px; color:var(--text);
                              font-size:1.3rem; font-weight:800; text-align:center; outline:none">
                <button class="stepper-btn" onclick="changeScore('res-away-${m.id}', 1)">+</button>
              </div>
            </div>

            <!-- Save button -->
            <div style="align-self:flex-end; padding-bottom:4px; margin-left:auto">
              <button class="btn btn-primary" onclick="saveResult(${m.id})" 
                      id="save-btn-${m.id}">
                ${isFinished ? '🔄 Update Score' : '🟢 Go Live'}
              </button>
            </div>

          </div>
        </div>`;
    });
  });

  container.innerHTML = html;
}

// ---- +/- stepper buttons ----
function changeScore(inputId, delta) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const current = parseInt(input.value) || 0;
  const newVal = Math.max(0, Math.min(20, current + delta));
  input.value = newVal;
}

// ---- Save / update result ----
async function saveResult(matchId) {
  const homeInput = document.getElementById(`res-home-${matchId}`);
  const awayInput = document.getElementById(`res-away-${matchId}`);
  const btn = document.getElementById(`save-btn-${matchId}`);

  const homeScore = parseInt(homeInput.value);
  const awayScore = parseInt(awayInput.value);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving...';

  // 1. Update match score
  const { error: matchError } = await db
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, is_finished: true })
    .eq('id', matchId);

  if (matchError) {
    showToast('Error updating score: ' + matchError.message, 'error');
    btn.disabled = false;
    btn.textContent = '🔄 Update Score';
    return;
  }

  // 2. Get all predictions for this match
  const { data: preds } = await db
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away, points_earned')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Score saved! No predictions to recalculate.', 'success');
    await loadAll();
    return;
  }

  // 3. Recalculate points using NEW system
  // Perfect score = 6pts, Correct outcome = 3pts, Wrong = 0pts
  const actualResult = Math.sign(homeScore - awayScore); // -1, 0, or 1

  for (const p of preds) {
    // Calculate new points
    let newPoints = 0;

    const isPerfect = p.predicted_home === homeScore && p.predicted_away === awayScore;
    const predResult = Math.sign(p.predicted_home - p.predicted_away);
    const isCorrectOutcome = predResult === actualResult;

    if (isPerfect) {
      newPoints = 6; // Perfect score
    } else if (isCorrectOutcome) {
      newPoints = 3; // Correct outcome only
    } else {
      newPoints = 0; // Wrong
    }

    const oldPoints = p.points_earned || 0;
    const pointsDiff = newPoints - oldPoints;

    // Update prediction
    await db
      .from('predictions')
      .update({ points_earned: newPoints })
      .eq('id', p.id);

    // Adjust user total by difference only (handles re-scoring correctly)
    if (pointsDiff !== 0) {
      const { data: profile } = await db
        .from('profiles')
        .select('total_points')
        .eq('id', p.user_id)
        .single();

      const newTotal = Math.max(0, (profile?.total_points || 0) + pointsDiff);

      await db
        .from('profiles')
        .update({ total_points: newTotal })
        .eq('id', p.user_id);
    }
  }

  showToast(`✅ Score saved! ${preds.length} predictions recalculated.`);
  await loadAll();
}

// ---- Revert match to upcoming (unfinish) ----
async function unfinishMatch(matchId) {
  if (!confirm('This will revert the match to "upcoming" and REMOVE all points earned from it. Are you sure?')) return;

  // Get predictions to remove their points
  const { data: preds } = await db
    .from('predictions')
    .select('id, user_id, points_earned')
    .eq('match_id', matchId);

  // Remove points from each user
  if (preds && preds.length > 0) {
    for (const p of preds) {
      if (p.points_earned > 0) {
        const { data: profile } = await db
          .from('profiles')
          .select('total_points')
          .eq('id', p.user_id)
          .single();

        const newTotal = Math.max(0, (profile?.total_points || 0) - p.points_earned);

        await db
          .from('profiles')
          .update({ total_points: newTotal })
          .eq('id', p.user_id);
      }

      // Reset prediction points to 0
      await db
        .from('predictions')
        .update({ points_earned: 0 })
        .eq('id', p.id);
    }
  }

  // Revert match
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
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

init();
