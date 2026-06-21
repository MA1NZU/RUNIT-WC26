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

  // Show admin button if admin
  if (typeof ADMIN_IDS !== 'undefined' && ADMIN_IDS.includes(currentUser.id)) {
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

  // Check and auto-kickoff any matches that have passed their start time
  await autoKickoffMatches(rounds);

  renderMatches(rounds, predMap);
  renderStats(currentProfile?.total_points || 0, predictions?.length || 0);

  // Start a live countdown ticker that updates every second
  startCountdownTicker();
}

// ============================================
// AUTO KICKOFF — sets score to 0-0 when match time is reached
// ============================================
async function autoKickoffMatches(rounds) {
  const now = new Date();

  for (const round of rounds) {
    for (const match of (round.matches || [])) {
      if (!match.match_date || match.is_finished) continue;

      const matchTime = new Date(match.match_date);

      // If match time has passed and score is not set yet → set to 0-0 and mark finished
      if (now >= matchTime) {
        const { error } = await _predictDb
          .from('matches')
          .update({
            home_score: match.home_score ?? 0,
            away_score: match.away_score ?? 0,
            is_finished: true
          })
          .eq('id', match.id)
          .is('is_finished', false); // Only update if not already finished

        if (!error) {
          // Update local cache so render shows correctly
          match.is_finished = true;
          match.home_score = match.home_score ?? 0;
          match.away_score = match.away_score ?? 0;
        }
      }
    }
  }
}

// ============================================
// COUNTDOWN TICKER — updates countdowns every second
// ============================================
function startCountdownTicker() {
  setInterval(() => {
    const now = new Date();
    const countdownEls = document.querySelectorAll('[data-kickoff]');

    countdownEls.forEach(el => {
      const matchId = el.dataset.matchid;
      const kickoff = new Date(el.dataset.kickoff);
      const diff = kickoff - now;
      const oneHour = 60 * 60 * 1000;

      if (diff <= 0) {
        // Time is up — lock the prediction inputs if still showing
        el.textContent = '🔴 LIVE';
        el.style.color = 'var(--red)';
        lockMatchCard(matchId);
      } else if (diff <= oneHour) {
        // Less than 1 hour — show countdown + lock inputs
        el.textContent = `🔒 Locked — kicks off in ${formatCountdown(diff)}`;
        el.style.color = 'var(--gold)';
        lockMatchCard(matchId);
      } else {
        // More than 1 hour — show normal countdown
        el.textContent = `⏱ ${formatCountdown(diff)}`;
        el.style.color = 'var(--text-muted)';
      }
    });
  }, 1000);
}

function formatCountdown(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function lockMatchCard(matchId) {
  // Disable score inputs
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);
  const saveBtn = document.getElementById(`save-pred-${matchId}`);

  if (homeInput) homeInput.disabled = true;
  if (awayInput) awayInput.disabled = true;
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '🔒 Locked';
  }
}

// ============================================
// RENDER STATS
// ============================================
function renderStats(points, predicted) {
  document.getElementById('stats-bar').style.display = 'grid';
  document.getElementById('stat-points').textContent = points;
  document.getElementById('stat-predicted').textContent = predicted;
  document.getElementById('stat-rank').textContent = '–';
}

// ============================================
// RENDER MATCHES
// ============================================
function renderMatches(rounds, predMap) {
  const container = document.getElementById('matches-container');
  const isAdmin = typeof ADMIN_IDS !== 'undefined' && ADMIN_IDS.includes(currentUser?.id);
  const now = new Date();
  const oneHour = 60 * 60 * 1000;

  let html = '';

  rounds.forEach(round => {
    if (!round.matches || round.matches.length === 0) return;

    html += `<div class="round-label"><h2>${round.name}</h2></div>`;

    round.matches.forEach(match => {
      const pred = predMap[match.id];
      const isFinished = match.is_finished;
      const hasDate = !!match.match_date;
      const matchTime = hasDate ? new Date(match.match_date) : null;
      const msUntilKickoff = matchTime ? matchTime - now : Infinity;
      const isWithinLockWindow = hasDate && msUntilKickoff <= oneHour;  // less than 1hr away
      const isKickedOff = hasDate && msUntilKickoff <= 0;               // past kickoff time
      const isLocked = isFinished || isWithinLockWindow;

      // ---- Status label for countdown ----
      let statusHtml = '';
      if (isFinished) {
        statusHtml = `
          <div class="match-date" style="color:var(--green)">
            🟢 Live / Final &nbsp;|&nbsp;
            <strong>${match.home_score} – ${match.away_score}</strong>
          </div>`;
      } else if (hasDate) {
        // Live countdown element (updated by ticker every second)
        const initialText = isKickedOff
          ? '🔴 LIVE'
          : isWithinLockWindow
            ? `🔒 Locked — kicks off in ${formatCountdown(msUntilKickoff)}`
            : `⏱ ${formatCountdown(msUntilKickoff)}`;

        const initialColor = isKickedOff
          ? 'var(--red)'
          : isWithinLockWindow
            ? 'var(--gold)'
            : 'var(--text-muted)';

        statusHtml = `
          <div class="match-date"
               data-kickoff="${match.match_date}"
               data-matchid="${match.id}"
               style="color:${initialColor}">
            ${initialText}
          </div>
          <div class="match-date" style="color:var(--text-muted); font-size:0.75rem; margin-top:2px">
            ${matchTime.toLocaleString([], {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
          </div>`;
      } else {
        statusHtml = `<div class="match-date">Date TBD</div>`;
      }

      // ---- Lock notice ----
      const lockNotice = isWithinLockWindow && !isFinished ? `
        <div style="text-align:center; margin-bottom:10px">
          <span class="badge" style="background:rgba(255,215,0,0.1); 
                color:var(--gold); border:1px solid rgba(255,215,0,0.3); font-size:0.8rem">
            🔒 Predictions locked 1 hour before kickoff
          </span>
        </div>` : '';

      // ---- Result badge ----
      let resultBadge = '';
      if (isFinished && pred) {
        if (pred.points_earned === 6) {
          resultBadge = `<span class="result-badge exact">⚡ Perfect! +6pts</span>`;
        } else if (pred.points_earned === 3) {
          resultBadge = `<span class="result-badge correct">✓ Correct outcome +3pts</span>`;
        } else if (pred.points_earned === 0 && pred) {
          resultBadge = `<span class="result-badge wrong">✗ Wrong • 0pts</span>`;
        }
      }

      // ---- Admin live score editor ----
      const adminEditor = isAdmin && isFinished ? `
        <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:14px">
          <p style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-bottom:10px">
            ⚙️ Admin — Update Live Score
          </p>
          <div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap">
            <input type="number" id="live-home-${match.id}"
                   value="${match.home_score ?? 0}" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.2rem; font-weight:800; text-align:center; outline:none">
            <span style="color:var(--text-muted); font-size:1.3rem; font-weight:800">–</span>
            <input type="number" id="live-away-${match.id}"
                   value="${match.away_score ?? 0}" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.2rem; font-weight:800; text-align:center; outline:none">
            <button class="btn btn-primary btn-sm" onclick="updateLiveScore(${match.id})">
              🔄 Update
            </button>
          </div>
        </div>` : '';

      // ---- Admin go-live button (for past matches not yet started) ----
      const adminGoLive = isAdmin && !isFinished && isKickedOff ? `
        <div style="border-top:1px solid var(--border); margin-top:16px; padding-top:14px">
          <p style="text-align:center; font-size:0.78rem; color:var(--text-muted); margin-bottom:10px">
            ⚙️ Admin — Set Opening Score
          </p>
          <div style="display:flex; align-items:center; justify-content:center; gap:10px; flex-wrap:wrap">
            <input type="number" id="live-home-${match.id}"
                   value="0" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.2rem; font-weight:800; text-align:center; outline:none">
            <span style="color:var(--text-muted); font-size:1.3rem; font-weight:800">–</span>
            <input type="number" id="live-away-${match.id}"
                   value="0" min="0" max="20"
                   style="width:56px; background:var(--dark); border:2px solid var(--green);
                          border-radius:8px; padding:8px; color:var(--text);
                          font-size:1.2rem; font-weight:800; text-align:center; outline:none">
            <button class="btn btn-primary btn-sm" onclick="updateLiveScore(${match.id})">
              🟢 Go Live
            </button>
          </div>
        </div>` : '';

      // ---- Build full match card ----
      html += `
        <div class="match-card ${isLocked ? 'locked' : ''} ${pred ? 'saved' : ''}"
             id="match-${match.id}">

          <!-- Teams row -->
          <div class="match-teams">
            <div class="team">
              <div class="team-name home">${match.home_team}</div>
            </div>
            <div class="vs-badge">
              ${isFinished
                ? `<span style="color:var(--green); font-size:1rem; font-weight:800">
                     ${match.home_score}–${match.away_score}
                   </span>`
                : 'VS'}
            </div>
            <div class="team">
              <div class="team-name away">${match.away_team}</div>
            </div>
          </div>

          <!-- Status / countdown -->
          ${statusHtml}

          <!-- Lock notice -->
          ${lockNotice}

          <!-- Prediction input OR locked view -->
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
              <button class="btn btn-primary btn-sm"
                      id="save-pred-${match.id}"
                      onclick="savePrediction(${match.id})">
                ${pred ? '✏️ Update' : '💾 Save Prediction'}
              </button>
            </div>
          ` : `
            <div style="text-align:center; padding:8px 0">
              <span style="color:var(--text-muted); font-size:0.9rem">Your pick: </span>
              <strong>
                ${pred
                  ? `${pred.predicted_home} – ${pred.predicted_away}`
                  : isWithinLockWindow && !isFinished
                    ? '<span style="color:var(--gold)">No prediction made</span>'
                    : 'No prediction made'}
              </strong>
            </div>
            ${resultBadge
              ? `<div style="text-align:center; margin-top:8px">${resultBadge}</div>`
              : ''}
          `}

          <!-- Admin controls -->
          ${adminEditor}
          ${adminGoLive}

        </div>`;
    });
  });

  container.innerHTML = html || `
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <p>No matches available.</p>
    </div>`;
}

// ============================================
// SAVE PREDICTION
// ============================================
async function savePrediction(matchId) {
  const homeInput = document.getElementById(`home-${matchId}`);
  const awayInput = document.getElementById(`away-${matchId}`);

  if (!homeInput || homeInput.value === '' || awayInput.value === '') {
    showToast('Enter both scores!', 'error');
    return;
  }

  const predicted_home = parseInt(homeInput.value);
  const predicted_away = parseInt(awayInput.value);

  if (isNaN(predicted_home) || isNaN(predicted_away) || predicted_home < 0 || predicted_away < 0) {
    showToast('Invalid scores!', 'error');
    return;
  }

  // Double-check the match isn't locked right now
  const now = new Date();
  const kickoffEl = document.querySelector(`[data-matchid="${matchId}"]`);
  if (kickoffEl) {
    const kickoff = new Date(kickoffEl.dataset.kickoff);
    if (kickoff - now <= 60 * 60 * 1000) {
      showToast('Predictions are locked for this match!', 'error');
      return;
    }
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
    const btn = document.getElementById(`save-pred-${matchId}`);
    if (btn) btn.textContent = '✏️ Update';
    if (card) card.classList.add('saved');
  }
}

// ============================================
// ADMIN: UPDATE LIVE SCORE
// ============================================
async function updateLiveScore(matchId) {
  const homeScore = parseInt(document.getElementById(`live-home-${matchId}`).value);
  const awayScore = parseInt(document.getElementById(`live-away-${matchId}`).value);

  if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
    showToast('Enter valid scores!', 'error');
    return;
  }

  // Update match
  const { error: matchError } = await _predictDb
    .from('matches')
    .update({ home_score: homeScore, away_score: awayScore, is_finished: true })
    .eq('id', matchId);

  if (matchError) {
    showToast('Error: ' + matchError.message, 'error');
    return;
  }

  // Get predictions
  const { data: preds } = await _predictDb
    .from('predictions')
    .select('id, user_id, predicted_home, predicted_away, points_earned')
    .eq('match_id', matchId);

  if (!preds || preds.length === 0) {
    showToast('Score updated!');
    setTimeout(() => location.reload(), 1200);
    return;
  }

  const actualResult = Math.sign(homeScore - awayScore);

  for (const p of preds) {
    const isPerfect = p.predicted_home === homeScore && p.predicted_away === awayScore;
    const predResult = Math.sign(p.predicted_home - p.predicted_away);
    const isCorrect = predResult === actualResult;

    // New points system: 6 / 3 / 0
    const newPoints = isPerfect ? 6 : isCorrect ? 3 : 0;
    const oldPoints = p.points_earned || 0;
    const diff = newPoints - oldPoints;

    await _predictDb
      .from('predictions')
      .update({ points_earned: newPoints })
      .eq('id', p.id);

    if (diff !== 0) {
      const { data: profile } = await _predictDb
        .from('profiles')
        .select('total_points')
        .eq('id', p.user_id)
        .single();

      await _predictDb
        .from('profiles')
        .update({ total_points: Math.max(0, (profile?.total_points || 0) + diff) })
        .eq('id', p.user_id);
    }
  }

  showToast(`Score updated! ${preds.length} predictions recalculated ✅`);
  setTimeout(() => location.reload(), 1500);
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
