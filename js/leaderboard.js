// ============================================
// LEADERBOARD.JS
// ============================================

async function init() {
  const session = await requireAuth();
  if (!session) return;

  const currentUserId = session.user.id;

  // Single query - get all profiles sorted by points
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, username, total_points')
    .order('total_points', { ascending: false })
    .limit(100);

  if (error || !profiles) {
    document.getElementById('leaderboard-container').innerHTML = `
      <div class="empty-state"><p>Error loading leaderboard.</p></div>`;
    return;
  }

  if (profiles.length === 0) {
    document.getElementById('leaderboard-container').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🏆</div>
        <p>No players yet!</p>
      </div>`;
    return;
  }

  let html = `
    <table class="leaderboard-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Player</th>
          <th>Points</th>
        </tr>
      </thead>
      <tbody>`;

  profiles.forEach((profile, index) => {
    const rank = index + 1;
    const isMe = profile.id === currentUserId;

    const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
    const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;

    html += `
      <tr class="${isMe ? 'my-row' : ''}">
        <td><span class="rank-badge ${rankClass}">${rankIcon}</span></td>
        <td>
          ${profile.username}
          ${isMe ? '<span class="badge badge-green" style="margin-left:8px">You</span>' : ''}
        </td>
        <td><span class="points-chip">${profile.total_points} pts</span></td>
      </tr>`;
  });

  html += '</tbody></table>';
  document.getElementById('leaderboard-container').innerHTML = html;
}

init();
