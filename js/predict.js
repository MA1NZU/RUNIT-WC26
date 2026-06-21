// ============================================
// PREDICT.JS
// ============================================

let currentUser = null;
let currentProfile = null;

const _predictDb = window.supabase.createClient(
  'https://bpmmimvlwuokipawabrk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwbW1pbXZsd3Vva2lwYXdhYnJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4NjE5NTMsImV4cCI6MjA5NzQzNzk1M30.U9S3vUNhyuqqirMNdamRBqdh67JbHNatBkQvdF3qu3k'
);

async function init() {
  const { data: { session } } = await _predictDb.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;

  // Show admin button if user is admin
  if (ADMIN_IDS.includes(currentUser.id)) {
    const adminBtn = document.getElementById('admin-nav-btn');
    if (adminBtn) adminBtn.style.display = 'inline-flex';
  }

  const [profileRes, roundsRes] = await Promise.all([
    _predictDb
      .from('profiles')
      .select('username, total_points')
      .eq('id', currentUser.id)
      .single(),
    _predictDb
      .from('rounds')
      .select('id, name, matches(id, home_team, away_team, match_date, home_score, away_score, is_finished)')
      .eq('is_active', true)
      .order('id')
  ]);

  currentProfile = profileRes.data;

  const greeting = document.getElementById('user-greeting');
  if (greeting) {
    greeting.textContent = `Welcome back, ${currentProfile?.username || 'Player'} 👋`;
  }

  const rounds = roundsRes.data || [];

  if (rounds.length === 0) {
    document.getElementById('matches-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏟️</div>
        <p>No active rounds yet. Check back soon!</p>
      </div>`;
    renderStats(currentProfile?.total_points || 0, 0);
    return;
  }

  const matchIds = rounds.flatMap(r => (r.matches || []).map(m => m.id));

  if (matchIds.length === 0) {
    document.getElementById('matches-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No matches scheduled yet.</p>
      </div>`;
    renderStats(currentProfile?.total_points || 0, 0);
    return;
  }

  const { data: predictions } = await _predictDb
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points_earned')
    .eq('user_id', currentUser.id)
    .in('match_id', matchIds);

  const predMap = {};
  (predictions || []).forEach(p => { predMap[p.match_id] = p; });

  renderMatches(rounds, predMap);
  renderStats(currentProfile?.total_points || 0, predictions?.length || 0);
}

function renderStats(points, predicted) {
  document.getElementById('stats-bar').style.display = 'grid';
  document.getElementById('stat-points').textContent = points;
  document.getElementById('stat-predicted').textContent = predicted;
  document.getElementById('stat-rank').textContent = '–';
}

function renderMatches(rounds, predMap) {
  const container = document.getElementById('matches-container');
  const isAdmin = ADMIN_IDS.includes(currentUser.id);
  let html = '';

  rounds.forEach(round => {
    if (!round.matches || round.matches.length === 0) return;

    html += `<div class="round-label"><h2>${round.name}</h2></div>`;

    round.matches.forEach(match => {
      const pred = predMap[match.id];
      const isFinished = match.is_finished;
      const hasDate = match.match_date;
      const isPast = hasDate && new Date(match.match_date) < new Date();
      const isLocked = isFinished || isPast;

      // Find this block and replace it
    let resultBadge = '';
    if (isFinished && pred) {
    if (pred.points_earned === 6) {
      resultBadge = `<span class="result-badge exact">⚡ Perfect! +6pts</span>`;
    } else if (pred.points_earned === 3) {
      resultBadge = `<span class="result-badge correct">✓ Correct outcome +3pts</span>`;
    } else {
      resultBadge = `<span class="result-badge wrong">✗ Wrong • 0pts</span>`;
    }
  }

      const dateStr = hasDate
        ? new Date(match.match_date).toLocaleString([], {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : 'Date TBD';

      // Admin live score editor shown on finished matches
      const adminScoreEditor = isAdmin && isFinished ? `
        <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:16px;">
          <p style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin-bottom:10px">
            ⚙️ Admin: Update Live Score
          </p>
          <div style="display:flex; align-items:center; justify-content:center; gap:10px">
            <input type="number" id="live-home-${match.id}" 
                   value="${match.home_score ?? 0}" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.1rem; font-weight:700; text-align:center; outline:none">
            <span style="color:var(--text-muted); font-size:1.2rem; font-weight:800">–</span>
            <input type="number" id="live-away-${match.id}"
                   value="${match.away_score ?? 0}" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.1rem; font-weight:700; text-align:center; outline:none">
            <button class="btn btn-primary btn-sm" onclick="updateLiveScore(${match.id})">
              Update
            </button>
          </div>
        </div>` : '';

      // Admin can also mark unfinished matches as started (live)
      const adminStartBtn = isAdmin && !isFinished && isPast ? `
        <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:16px;">
          <p style="text-align:center; font-size:0.8rem; color:var(--text-muted); margin-bottom:10px">
            ⚙️ Admin: Start Live Scoring
          </p>
          <div style="display:flex; align-items:center; justify-content:center; gap:10px">
            <input type="number" id="live-home-${match.id}"
                   value="0" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.1rem; font-weight:700; text-align:center; outline:none">
            <span style="color:var(--text-muted); font-size:1.2rem; font-weight:800">–</span>
            <input type="number" id="live-away-${match.id}"
                   value="0" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.1rem; font-weight:700; text-align:center; outline:none">
            <button class="btn btn-primary btn-sm" onclick="updateLiveScore(${match.id})">
              🟢 Go Live
            </button>
          </div>
        </div>` : '';

      html += `
        <div class="match-card ${isLocked ? 'locked' : ''} ${pred ? 'saved' : ''}" 
             id="match-${match.id}">
          <div class="match-teams">
            <div class="team"><div class="team-name home">${match.home_team}</div></div>
            <div class="vs-badge">
              ${isFinished
                ? `<span style="color:var(--green)">${match.home_score}–${match.away_score}</span>`
                : 'VS'}
            </div>
            <div class="team"><div class="team-name away">${match.away_team}</div></div>
          </div>

          <div class="match-date">
            ${isFinished
              ? `<span style="color:var(--green)">🟢 Live / Final</span>`
              : dateStr}
          </div>

          ${!isLocked ? `
            <div class="prediction-inputs">
              <input type="number" class="score-input" id="home-${match.id}"
                     min="0" max="20" placeholder="0"
                     value="${pred ? pred.predicted_home : ''}">
              <span class="score-separator">–</span>
              <input type="number" class="score-input" id="away-${match.id}"
                     min="0" max="20" placeholder="0"
                     value="${pred ? pred.predicted_away : ''}">
            </div>
            <div class="save-btn-wrap">
              <button class="btn btn-primary btn-sm" onclick="savePrediction(${match.id})">
                ${pred ? '✏️ Update' : '💾 Save Prediction'}
              </button>
            </div>
          ` : `
            <div class="prediction-inputs" style="justify-content:center; gap:20px">
              <span style="color:var(--text-muted); font-size:0.9rem">Your pick:</span>
              <strong>
                ${pred ? `${pred.predicted_home} – ${pred.predicted_away}` : 'No prediction made'}
              </strong>
            </div>
            ${resultBadge
              ? `<div style="text-align:center; margin-top:12px">${resultBadge}</div>`
              : ''}
          `}

          ${adminScoreEditor}
          ${adminStartBtn}
        </div>`;
    });
  });

  container.innerHTML = html || `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No matches available.</p>
    </div>`;
}

async function savePrediction(matchId) {
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);

  if (homeInput.value === '' || awayInput.value === '') {
    showToast('Enter both scores!', 'error');
    return;
  }

  const predicted_home = parseInt(homeInput.value);
  const predicted_away = parseInt(awayInput.value);

  if (isNaN(predicted_home) || isNaN(predicted_away) || predicted_home < 0 || predicted_away < 0) {
    showToast('Invalid scores!', 'error');
    return;
  }

  const { error } = await _predictDb.from('predictions').upsert({
    user_id: currentUser.id,
    match_id: matchId,
    predicted_home,
    predicted_away,
    points_earned: 0
  }, { onConflict: 'user_id,match_id' });

  if (error) {
    showToast('Error saving: ' + error.message, 'error');
  } else {
    showToast('Prediction saved!');
    const card = document.getElementById(`match-${matchId}`);
    const btn = card.querySelector('.btn');
    if (btn) btn.textContent = '✏️ Update';
    card.classList.add('saved');
  }
}

// ---- Admin: update live score and recalculate points ----
async function updateLiveScore(matchId) {
  const homeScore = parseInt(document.getElementById(`live-home-${matchId}`).value);
  const awayScore = parseInt(document.getElementById(`live-away-${matchId}`).value);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  // 1. Update match score and mark as finished/live
  const { error: matchError } = await _predictDb
    .from('matches')
    .update({
      home_score: homeScore,
      away_score: awayScore,
      is_finished: true
    })
    .eq('id', matchId);

  if (matchError) {
    showToast('Error updating score: ' + matchError.message, 'error');
    return;
  }

  // 2. Get all predictions for this match
  const { data: preds } = await _predictDb
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Score updated! No predictions to recalculate.', 'success');
    setTimeout(() => location.reload(), 1500);
    return;
  }

  // 3. Recalculate points for each prediction
  const actualResult = Math.sign(homeScore - awayScore);

  // Get OLD points before updating (to adjust totals correctly)
  const { data: oldPreds } = await _predictDb
    .from('predictions')
    .select('id, user_id, points_earned')
    .eq('match_id', matchId);

  const oldPointsMap = {};
  (oldPreds || []).forEach(p => { oldPointsMap[p.id] = p.points_earned || 0; });

  for (const p of preds) {
    // Calculate new points
    let newPoints = 0;
    if (p.predicted_home === homeScore && p.predicted_away === awayScore) {
      newPoints = 3;
    } else {
      const predResult = Math.sign(p.predicted_home - p.predicted_away);
      if (predResult === actualResult) newPoints = 1;
    }

    const oldPoints = oldPointsMap[p.id] || 0;
    const pointsDiff = newPoints - oldPoints;

    // Update prediction points
    await _predictDb
      .from('predictions')
      .update({ points_earned: newPoints })
      .eq('id', p.id);

    // Adjust user total points by the DIFFERENCE only
    if (pointsDiff !== 0) {
      const { data: profile } = await _predictDb
        .from('profiles')
        .select('total_points')
        .eq('id', p.user_id)
        .single();

      const newTotal = Math.max(0, (profile?.total_points || 0) + pointsDiff);

      await _predictDb
        .from('profiles')
        .update({ total_points: newTotal })
        .eq('id', p.user_id);
    }
  }

  showToast(`Score updated! ${preds.length} predictions recalculated ✅`);

  // Reload page after short delay to show new scores
  setTimeout(() => location.reload(), 1500);
}

// ---- Toast ----
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = (type === 'success' ? '✅ ' : '❌ ') + msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

init();
