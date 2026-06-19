// ============================================
// ADMIN.JS
// ============================================

let adminSession = null;
let roundsCache = [];
let matchesCache = [];

async function init() {
  adminSession = await requireAdmin();
  if (!adminSession) return;

  // Load all data in parallel (2 queries total)
  await loadAll();
}

async function loadAll() {
  const [roundsRes, matchesRes] = await Promise.all([
    supabase.from('rounds').select('id, name, is_active').order('id'),
    supabase.from('matches').select('id, round_id, home_team, away_team, match_date, home_score, away_score, is_finished').order('id')
  ]);

  roundsCache = roundsRes.data || [];
  matchesCache = matchesRes.data || [];

  renderRoundsList();
  renderMatchesList();
  renderResultsList();
  populateRoundSelect();
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

  event.target.classList.add('active');
  document.getElementById(`section-${tab}`).classList.add('active');
}

// ---- ROUNDS ----
function renderRoundsList() {
  const container = document.getElementById('rounds-list');
  if (roundsCache.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No rounds yet.</p></div>';
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
          ${!r.is_active ? `<button class="btn btn-ghost btn-sm" onclick="setActiveRound(${r.id})">Set Active</button>` : ''}
          <button class="btn btn-danger btn-sm" onclick="deleteRound(${r.id})">Delete</button>
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

async function addRound() {
  const name = document.getElementById('round-name').value.trim();
  const isActive = document.getElementById('round-active').checked;

  if (!name) { showToast('Enter a round name!', 'error'); return; }

  const { error } = await supabase.from('rounds').insert({ name, is_active: isActive });
  if (error) { showToast('Error adding round', 'error'); return; }

  document.getElementById('round-name').value = '';
  document.getElementById('round-active').checked = false;
  showToast('Round added!');
  await loadAll();
}

async function setActiveRound(roundId) {
  // Deactivate all, then activate selected (2 queries)
  await supabase.from('rounds').update({ is_active: false }).neq('id', 0);
  await supabase.from('rounds').update({ is_active: true }).eq('id', roundId);
  showToast('Active round updated!');
  await loadAll();
}

async function deleteRound(roundId) {
  if (!confirm('Delete this round and ALL its matches?')) return;
  const { error } = await supabase.from('rounds').delete().eq('id', roundId);
  if (error) { showToast('Error deleting', 'error'); return; }
  showToast('Round deleted');
  await loadAll();
}

// ---- MATCHES ----
function populateRoundSelect() {
  const select = document.getElementById('match-round');
  if (!select) return;
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

  // Group by round
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
        ? new Date(m.match_date).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
        : 'No date';
      html += `
        <div class="admin-match-item">
          <div class="admin-match-info">
            <strong>${m.home_team} vs ${m.away_team}</strong>
            <small>${dateStr}</small>
          </div>
          <button class="btn btn-danger btn-sm" onclick="deleteMatch(${m.id})">Delete</button>
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

  const { error } = await supabase.from('matches').insert({
    round_id: parseInt(roundId),
    home_team: homeTeam,
    away_team: awayTeam,
    match_date: matchDate || null
  });

  if (error) { showToast('Error adding match', 'error'); return; }

  document.getElementById('home-team').value = '';
  document.getElementById('away-team').value = '';
  document.getElementById('match-date').value = '';
  showToast('Match added!');
  await loadAll();
}

async function deleteMatch(matchId) {
  if (!confirm('Delete this match and all its predictions?')) return;
  const { error } = await supabase.from('matches').delete().eq('id', matchId);
  if (error) { showToast('Error deleting', 'error'); return; }
  showToast('Match deleted');
  await loadAll();
}

// ---- RESULTS ----
function renderResultsList() {
  const container = document.getElementById('results-list');
  const unfinished = matchesCache.filter(m => !m.is_finished);
  const finished = matchesCache.filter(m => m.is_finished);

  let html = '';

  if (unfinished.length > 0) {
    html += `<div class="round-label"><h2>Pending Results</h2></div>`;
    unfinished.forEach(m => {
      const round = roundsCache.find(r => r.id === m.round_id);
      html += `
        <div class="admin-match-item">
          <div class="admin-match-info">
            <strong>${m.home_team} vs ${m.away_team}</strong>
            <small>${round ? round.name : ''}</small>
          </div>
          <div class="score-form">
            <input type="number" id="res-home-${m.id}" min="0" max="20" placeholder="0" value="">
            <span style="color:var(--text-muted)">–</span>
            <input type="number" id="res-away-${m.id}" min="0" max="20" placeholder="0" value="">
            <button class="btn btn-primary btn-sm" onclick="saveResult(${m.id})">Save</button>
          </div>
        </div>`;
    });
  }

  if (finished.length > 0) {
    html += `<div class="round-label" style="margin-top:24px"><h2>Completed</h2></div>`;
    finished.forEach(m => {
      html += `
        <div class="admin-match-item" style="opacity:0.6">
          <div class="admin-match-info">
            <strong>${m.home_team} vs ${m.away_team}</strong>
            <small>✅ Final: ${m.home_score} – ${m.away_score}</small>
          </div>
        </div>`;
    });
  }

  if (matchesCache.length === 0) {
    html = '<div class="empty-state"><p>No matches yet.</p></div>';
  }

  container.innerHTML = html;
}

async function saveResult(matchId) {
  const homeScore = parseInt(document.getElementById(`res-home-${matchId}`).value);
  const awayScore = parseInt(document.getElementById(`res-away-${matchId}`).value);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  // 1. Mark match as finished
  const { error: matchError } = await supabase
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, is_finished: true })
    .eq('id', matchId);

  if (matchError) { showToast('Error saving result', 'error'); return; }

  // 2. Get all predictions for this match
  const { data: preds } = await supabase
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Result saved! (No predictions to score)');
    await loadAll();
    return;
  }

  // 3. Calculate points
  const actualResult = Math.sign(homeScore - awayScore); // -1, 0, 1

  const updates = preds.map(p => {
    let points = 0;
    if (p.predicted_home === homeScore && p.predicted_away === awayScore) {
      points = 3; // Exact score
    } else {
      const predResult = Math.sign(p.predicted_home - p.predicted_away);
      if (predResult === actualResult) points = 1; // Correct outcome
    }
    return { id: p.id, user_id: p.user_id, match_id: matchId, points_earned: points };
  });

  // 4. Update predictions with points
  for (const u of updates) {
    await supabase
      .from('predictions')
      .update({ points_earned: u.points_earned })
      .eq('id', u.id);
  }

  // 5. Update each player's total points
  // Group points by user
  const pointsByUser = {};
  updates.forEach(u => {
    pointsByUser[u.user_id] = (pointsByUser[u.user_id] || 0) + u.points_earned;
  });

  for (const [userId, pts] of Object.entries(pointsByUser)) {
    // Get current points first
    const { data: profile } = await supabase
      .from('profiles')
      .select('total_points')
      .eq('id', userId)
      .single();

    await supabase
      .from('profiles')
      .update({ total_points: (profile?.total_points || 0) + pts })
      .eq('id', userId);
  }

  showToast(`Result saved! ${preds.length} predictions scored ✅`);
  await loadAll();
}

init();
