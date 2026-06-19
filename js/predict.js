// ============================================
// PREDICT.JS
// Points: 3 = exact score, 1 = correct result
// ============================================

let currentUser = null;
let currentProfile = null;

async function init() {
  const session = await requireAuth();
  if (!session) return;

  currentUser = session.user;

  // Single query: get profile, active round matches, and user's predictions
  const [profileRes, roundsRes] = await Promise.all([
    supabase.from('profiles').select('username, total_points').eq('id', currentUser.id).single(),
    supabase.from('rounds').select('id, name, matches(id, home_team, away_team, match_date, home_score, away_score, is_finished)').eq('is_active', true).order('id')
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
    return;
  }

  // Get all match IDs
  const matchIds = rounds.flatMap(r => r.matches.map(m => m.id));

  if (matchIds.length === 0) {
    document.getElementById('matches-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No matches scheduled yet.</p>
      </div>`;
    return;
  }

  // Get user's existing predictions (1 query)
  const { data: predictions } = await supabase
    .from('predictions')
    .select('match_id, predicted_home, predicted_away, points_earned')
    .eq('user_id', currentUser.id)
    .in('match_id', matchIds);

  const predMap = {};
  (predictions || []).forEach(p => { predMap[p.match_id] = p; });

  // Render
  renderMatches(rounds, predMap);
  renderStats(currentProfile?.total_points || 0, predictions?.length || 0);
}

function renderStats(points, predicted) {
  document.getElementById('stats-bar').style.display = 'grid';
  document.getElementById('stat-points').textContent = points;
  document.getElementById('stat-predicted').textContent = predicted;
  // Rank from leaderboard would need extra query - skip to save reads
  document.getElementById('stat-rank').textContent = '–';
}

function renderMatches(rounds, predMap) {
  const container = document.getElementById('matches-container');
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

      let resultBadge = '';
      if (isFinished && pred) {
        if (pred.points_earned === 3) {
          resultBadge = `<span class="result-badge exact">⚡ Exact! +3pts</span>`;
        } else if (pred.points_earned === 1) {
          resultBadge = `<span class="result-badge correct">✓ Correct result +1pt</span>`;
        } else {
          resultBadge = `<span class="result-badge wrong">✗ Wrong</span>`;
        }
      }

      const dateStr = hasDate
        ? new Date(match.match_date).toLocaleString([], { weekday:'short', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })
        : 'Date TBD';

      const finalScore = isFinished
        ? `<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; margin-bottom:8px">
             Final: <strong style="color:var(--text)">${match.home_score} – ${match.away_score}</strong>
           </div>`
        : '';

      html += `
        <div class="match-card ${isLocked ? 'locked' : ''} ${pred ? 'saved' : ''}" id="match-${match.id}">
          <div class="match-teams">
            <div class="team"><div class="team-name home">${match.home_team}</div></div>
            <div class="vs-badge">${isFinished ? `${match.home_score}–${match.away_score}` : 'VS'}</div>
            <div class="team"><div class="team-name away">${match.away_team}</div></div>
          </div>
          <div class="match-date">${dateStr}</div>
          ${finalScore}
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
              <strong>${pred ? `${pred.predicted_home} – ${pred.predicted_away}` : 'No prediction'}</strong>
            </div>
            ${resultBadge ? `<div style="text-align:center; margin-top:12px">${resultBadge}</div>` : ''}
          `}
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

  const homeVal = homeInput.value;
  const awayVal = awayInput.value;

  if (homeVal === '' || awayVal === '') {
    showToast('Enter both scores!', 'error');
    return;
  }

  const predicted_home = parseInt(homeVal);
  const predicted_away = parseInt(awayVal);

  if (isNaN(predicted_home) || isNaN(predicted_away) || predicted_home < 0 || predicted_away < 0) {
    showToast('Invalid scores!', 'error');
    return;
  }

  const { error } = await supabase.from('predictions').upsert({
    user_id: currentUser.id,
    match_id: matchId,
    predicted_home,
    predicted_away,
    points_earned: 0
  }, { onConflict: 'user_id,match_id' });

  if (error) {
    showToast('Error saving. Try again.', 'error');
  } else {
    showToast('Prediction saved!');
    // Update button text
    const card = document.getElementById(`match-${matchId}`);
    const btn = card.querySelector('.btn');
    if (btn) btn.textContent = '✏️ Update';
    card.classList.add('saved');
    // Update local predicted count
    const el = document.getElementById('stat-predicted');
    if (el) el.textContent = parseInt(el.textContent || '0') + 1;
  }
}

init();
