let state = null;
let currentUser = JSON.parse(localStorage.getItem('tablix_user') || 'null');

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function switchTab(panelId, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(panelId).classList.remove('hidden');
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function showAlert(msg, type = 'success') {
  const styles = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    danger: 'bg-rose-50 border-rose-200 text-rose-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };
  const box = document.getElementById('alertBox');
  box.innerHTML = `<div class="flex items-center justify-between px-4 py-3 rounded-xl border text-xs font-semibold shadow-sm ${styles[type] || styles.info}">
    <span>${msg}</span>
    <button onclick="this.parentElement.remove()" class="ml-4 opacity-60 hover:opacity-100">✕</button>
  </div>`;
}

async function api(url, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser) {
    headers['x-user-role'] = currentUser.role;
    headers['x-user-id'] = currentUser.id;
  }
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : null });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en la operación');
  return data;
}

function fillDemo(u) {
  document.getElementById('loginUser').value = u;
  document.getElementById('loginPass').value = '123';
}

function updateRoleUI() {
  const badge = document.getElementById('roleBadge');
  const btnLogin = document.getElementById('btnOpenLogin');
  const btnLogout = document.getElementById('btnLogout');
  const mainTabs = document.getElementById('mainTabs');
  document.querySelectorAll('.role-only').forEach(el => el.classList.add('hidden'));

  if (currentUser) {
    badge.innerHTML = `<i data-lucide="user-check" class="w-3.5 h-3.5 text-amber-400"></i> ${currentUser.role} (${currentUser.fullName.split(' ')[0]})`;
    btnLogin.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    mainTabs.classList.remove('hidden');
    document.querySelectorAll(`.role-${currentUser.role}`).forEach(el => el.classList.remove('hidden'));
  } else {
    badge.innerHTML = '<i data-lucide="eye" class="w-3.5 h-3.5 text-amber-400"></i> Público General';
    btnLogin.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    mainTabs.classList.add('hidden');
    switchTab('tabPublic', document.querySelector('#mainTabs button'));
  }
  if (window.lucide) lucide.createIcons();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const res = await api('/api/login', 'POST', {
      username: document.getElementById('loginUser').value,
      password: document.getElementById('loginPass').value
    });
    currentUser = res.user;
    localStorage.setItem('tablix_user', JSON.stringify(currentUser));
    closeModal('loginModal');
    updateRoleUI();
    renderAll();
    showAlert(`Bienvenido, ${currentUser.fullName}`);
  } catch (err) { showAlert(err.message, 'danger'); }
});

function logout() {
  currentUser = null;
  localStorage.removeItem('tablix_user');
  updateRoleUI();
  renderAll();
  showAlert('Sesión cerrada. Modo Público General activo.', 'info');
}

async function loadState() {
  state = await api('/api/state');
  renderAll();
}

function teamName(id) {
  const t = state.teams.find(x => x.id === id);
  return t ? t.name : id;
}

function openPublicRoster(teamId) {
  const t = state.teams.find(x => x.id === teamId);
  if (!t) return;
  document.getElementById('rosterModalTitle').textContent = `Plantilla Oficial — ${t.name}`;
  document.getElementById('rosterModalBody').innerHTML = t.players.length === 0
    ? '<p class="text-slate-500 text-xs">Sin deportistas registrados.</p>'
    : `<table class="w-full text-left text-xs">
        <thead><tr class="border-b border-slate-200 text-slate-400 uppercase"><th class="py-2">Dorsal</th><th class="py-2">Deportista</th><th class="py-2">Posición</th></tr></thead>
        <tbody class="divide-y divide-slate-100">${t.players.map(p => `<tr><td class="py-2"><span class="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold">#${p.number}</span></td><td class="py-2 font-semibold text-slate-800">${p.fullName}</td><td class="py-2 text-slate-500">${p.position}</td></tr>`).join('')}</tbody>
      </table>`;
  openModal('rosterModal');
}

function renderAll() {
  if (!state) return;
  const { tournament, teams, matches, standings, financialSummary } = state;

  document.getElementById('tourName').textContent = tournament.name;
  document.getElementById('kpiTeams').textContent = teams.filter(t => t.status === 'APPROVED').length;
  document.getElementById('kpiMatches').textContent = matches.length;
  document.getElementById('kpiFormat').textContent = tournament.config.setsFormat;
  document.getElementById('tourMeta').textContent = `Categoría: ${tournament.category} • Modalidad: Al mejor de ${tournament.config.setsFormat} Set(s) (${tournament.config.regularSetPoints} pts, dif. ${tournament.config.minPointDiff}) • Inscripción: $${tournament.registrationFee.toLocaleString('es-CO')}`;

  const regBadge = document.getElementById('regStatusBadge');
  regBadge.textContent = tournament.registrationOpen ? 'Inscripciones Abiertas' : 'Inscripciones Cerradas';
  regBadge.className = tournament.registrationOpen
    ? 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
    : 'px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-700 text-slate-300';

  // Tabla Posiciones
  document.getElementById('standingsBody').innerHTML = standings.map((r, i) => {
    const rankStyle = i === 0 ? 'bg-amber-100 text-amber-800 border-amber-300' : (i < 3 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200');
    return `<tr class="hover:bg-slate-50/80 transition">
      <td class="py-3 px-2"><span class="w-7 h-7 rounded-lg border text-xs font-extrabold inline-flex items-center justify-center ${rankStyle}">${i + 1}</span></td>
      <td class="py-3 px-2">
        <div class="flex items-center gap-2.5">
          <span class="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 border border-blue-200 text-blue-700 font-extrabold text-xs inline-flex items-center justify-center shrink-0">${r.teamName.substring(0,2).toUpperCase()}</span>
          <span class="font-bold text-slate-800 text-xs sm:text-sm">${r.teamName}</span>
        </div>
      </td>
      <td class="py-3 px-2 text-center font-extrabold text-blue-600 text-sm">${r.pts}</td>
      <td class="py-3 px-2 text-center text-slate-600">${r.pj}</td>
      <td class="py-3 px-2 text-center text-slate-600">${r.pg}</td>
      <td class="py-3 px-2 text-center text-slate-600">${r.pe}</td>
      <td class="py-3 px-2 text-center text-slate-600">${r.pp}</td>
      <td class="py-3 px-2 text-center text-slate-600">${r.sf}</td>
      <td class="py-3 px-2 text-center text-slate-600">${r.sc}</td>
      <td class="py-3 px-2 text-center font-bold ${r.setDiff >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${r.setDiff > 0 ? '+'+r.setDiff : r.setDiff}</td>
      <td class="py-3 px-2 text-center text-xs text-slate-400 font-medium">${r.pointRatio}</td>
    </tr>`;
  }).join('');

  // Partidos Públicos
  const filterVal = document.getElementById('matchFilter').value;
  const filteredMatches = matches.filter(m => filterVal === 'ALL' ? true : m.status === filterVal);
  document.getElementById('publicMatchesList').innerHTML = filteredMatches.length === 0
    ? '<div class="text-slate-400 text-xs p-6 bg-slate-50 rounded-2xl text-center border border-dashed border-slate-200">No hay encuentros en esta categoría.</div>'
    : filteredMatches.map(m => `
      <div class="p-3.5 rounded-2xl border ${m.status==='COMPLETED' ? 'border-emerald-200/80 bg-emerald-50/20' : 'border-slate-200/80 bg-white'} hover:shadow-md transition flex items-center justify-between gap-3">
        <div class="space-y-1">
          <span class="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600">Jornada ${m.round}</span>
          <div class="text-xs sm:text-sm font-extrabold text-slate-900">${teamName(m.teamAId)} <span class="text-slate-400 font-normal mx-1">vs</span> ${teamName(m.teamBId)}</div>
          <div class="text-[11px] text-slate-500">
            ${m.status === 'PENDING_SCHEDULE' ? 'Horario por confirmar' : `📅 ${m.date} • ⏰ ${m.time}<br>📍 ${m.court}`}
          </div>
        </div>
        <div class="text-right shrink-0">
          ${m.status === 'COMPLETED'
            ? `<span class="inline-block px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-extrabold text-sm shadow-sm">${m.result.setsWonA} - ${m.result.setsWonB}</span><div class="text-[11px] text-slate-500 font-medium mt-1">${m.sets.map(s=>s.a+'-'+s.b).join(', ')}</div>`
            : `<span class="inline-block px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">${m.status === 'SCHEDULED' ? 'Programado' : 'Por agendar'}</span>`}
        </div>
      </div>
    `).join('');

  // Clubes y Escenarios Públicos
  const approved = teams.filter(t => t.status === 'APPROVED');
  document.getElementById('publicClubsGrid').innerHTML = approved.map(t => `
    <div class="p-3.5 rounded-2xl border border-slate-200/80 hover:border-blue-300 bg-slate-50/40 flex items-center justify-between gap-2 transition">
      <div class="flex items-center gap-3">
        <span class="w-9 h-9 rounded-xl bg-slate-900 text-amber-400 font-extrabold text-xs flex items-center justify-center shrink-0">${t.name.substring(0,2).toUpperCase()}</span>
        <div>
          <div class="font-bold text-xs sm:text-sm text-slate-900">${t.name}</div>
          <div class="text-[11px] text-slate-500">DT: ${t.coach} • ${t.players.length} jug.</div>
        </div>
      </div>
      <button onclick="openPublicRoster('${t.id}')" class="px-3 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-900 hover:text-white hover:border-slate-900 text-xs font-bold transition">Nómina</button>
    </div>
  `).join('');

  document.getElementById('publicCourtsList').innerHTML = tournament.courts.map((c, idx) => `
    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center gap-3">
      <span class="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-extrabold flex items-center justify-center shrink-0">${idx + 1}</span>
      <span class="text-xs font-bold text-slate-800">${c}</span>
    </div>
  `).join('');

  // Matriz Interna (Organizador)
  let mHtml = '<table class="w-full text-xs border-collapse border border-slate-200"><thead><tr class="bg-slate-50"><th class="p-2 border border-slate-200 text-left">Equipo</th>';
  approved.forEach((t, idx) => mHtml += `<th class="p-2 border border-slate-200 text-center">E${idx+1}</th>`);
  mHtml += '</tr></thead><tbody>';
  approved.forEach((rowT, rIdx) => {
    mHtml += `<tr><td class="p-2 border border-slate-200 font-bold">E${rIdx+1}. ${rowT.name}</td>`;
    approved.forEach(colT => {
      if (rowT.id === colT.id) { mHtml += '<td class="p-2 border border-slate-200 text-center matrix-diag">—</td>'; return; }
      const m = matches.find(x => x.status === 'COMPLETED' && ((x.teamAId === rowT.id && x.teamBId === colT.id) || (x.teamAId === colT.id && x.teamBId === rowT.id)));
      if (!m) { mHtml += '<td class="p-2 border border-slate-200 text-center text-slate-400">vs</td>'; return; }
      const score = m.teamAId === rowT.id ? `${m.result.setsWonA}-${m.result.setsWonB}` : `${m.result.setsWonB}-${m.result.setsWonA}`;
      mHtml += `<td class="p-2 border border-slate-200 text-center font-extrabold text-emerald-600">${score}</td>`;
    });
    mHtml += '</tr>';
  });
  mHtml += '</tbody></table>';
  document.getElementById('crossMatrixContainer').innerHTML = mHtml;

  // Config & Scheduler
  document.getElementById('cfgName').value = tournament.name;
  document.getElementById('cfgFormat').value = tournament.config.setsFormat;
  document.getElementById('cfgDiff').value = tournament.config.minPointDiff;
  document.getElementById('cfgRegPts').value = tournament.config.regularSetPoints;
  document.getElementById('cfgTiePts').value = tournament.config.tieBreakPoints;
  document.getElementById('cfgFee').value = tournament.registrationFee;
  document.getElementById('cfgRegOpen').value = String(tournament.registrationOpen);
  document.getElementById('cfgCourts').value = tournament.courts.join(', ');

  document.getElementById('schedulerContainer').innerHTML = matches.map(m => `
    <div class="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-2 text-xs">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-slate-800">${m.id} (J${m.round}): ${teamName(m.teamAId)} vs ${teamName(m.teamBId)}</span>
        <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status==='COMPLETED'?'bg-emerald-100 text-emerald-800':(m.status==='SCHEDULED'?'bg-blue-100 text-blue-800':'bg-amber-100 text-amber-800')}">${m.status}</span>
      </div>
      ${m.status !== 'COMPLETED' ? `
        <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
          <input type="date" id="d-${m.id}" value="${m.date||''}" class="sm:col-span-3 rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white">
          <input type="time" id="t-${m.id}" value="${m.time||''}" class="sm:col-span-2 rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white">
          <select id="c-${m.id}" class="sm:col-span-4 rounded-xl border border-slate-300 px-2.5 py-1.5 bg-white">${tournament.courts.map(c=>`<option ${m.court===c?'selected':''}>${c}</option>`).join('')}</select>
          <div class="sm:col-span-3 flex gap-1">
            <button onclick="scheduleMatch('${m.id}')" class="flex-1 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold">Agendar</button>
            ${m.status==='SCHEDULED' ? `<button onclick="unscheduleMatch('${m.id}')" class="px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-slate-600 font-bold">X</button>` : ''}
          </div>
        </div>
      ` : `<div class="text-emerald-700 font-bold">Finalizado: ${m.result.setsWonA}-${m.result.setsWonB}</div>`}
    </div>
  `).join('');

  // Finanzas y Equipos
  document.getElementById('financeSummaryRow').innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-200 p-4 text-center shadow-sm"><div class="text-[11px] font-bold uppercase text-slate-400">Recaudo Esperado</div><div class="text-xl font-extrabold text-slate-900 mt-1">$${financialSummary.expected.toLocaleString('es-CO')}</div></div>
    <div class="bg-white rounded-2xl border border-emerald-200 p-4 text-center shadow-sm"><div class="text-[11px] font-bold uppercase text-emerald-600">Recaudo Efectivo</div><div class="text-xl font-extrabold text-emerald-600 mt-1">$${financialSummary.collected.toLocaleString('es-CO')}</div></div>
    <div class="bg-white rounded-2xl border border-amber-200 p-4 text-center shadow-sm"><div class="text-[11px] font-bold uppercase text-amber-600">Cartera Pendiente</div><div class="text-xl font-extrabold text-amber-600 mt-1">$${financialSummary.pending.toLocaleString('es-CO')}</div></div>
  `;

  document.getElementById('teamsListContainer').innerHTML = teams.map(t => `
    <div class="p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <strong class="text-sm text-slate-900">${t.name}</strong>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${t.status==='APPROVED'?'bg-emerald-100 text-emerald-800':(t.status==='REJECTED'?'bg-rose-100 text-rose-800':'bg-amber-100 text-amber-800')}">${t.status}</span>
        </div>
        <div class="text-slate-500">DT: ${t.coach} • Delegado: ${t.delegateName} • Nómina: ${t.players.length} jug.</div>
        <div>
          Cartera: <span class="px-2 py-0.5 rounded-md font-bold ${t.finance.financialStatus==='PAGADO'?'bg-emerald-100 text-emerald-800':(t.finance.financialStatus==='ABONADO'?'bg-blue-100 text-blue-800':'bg-slate-100 text-slate-700')}">${t.finance.financialStatus}</span>
          <span class="ml-2">Abonado: <strong>$${t.finance.totalPaid.toLocaleString('es-CO')}</strong> • Saldo: <strong>$${t.finance.balance.toLocaleString('es-CO')}</strong></span>
        </div>
      </div>
      ${currentUser && currentUser.role === 'ORGANIZADOR' ? `
        <div class="flex flex-col gap-1.5 shrink-0">
          <div class="flex gap-1">
            <button onclick="setTeamStatus('${t.id}','APPROVED')" class="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white font-bold">Aprobar</button>
            <button onclick="setTeamStatus('${t.id}','REJECTED')" class="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-600 hover:text-white font-bold">Rechazar</button>
          </div>
          ${t.finance.balance > 0 ? `<button onclick="addPayment('${t.id}', ${t.finance.balance})" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-700">+ Registrar Abono</button>` : ''}
        </div>
      ` : ''}
    </div>
  `).join('');

  // Panel Árbitro
  const maxSets = Number(tournament.config.setsFormat);
  const playable = matches.filter(m => m.status !== 'PENDING_SCHEDULE');
  document.getElementById('refereeMatchesContainer').innerHTML = playable.map(m => {
    let inputs = '';
    for (let i = 0; i < maxSets; i++) {
      const valA = m.sets[i] ? m.sets[i].a : '';
      const valB = m.sets[i] ? m.sets[i].b : '';
      inputs += `<div class="bg-slate-50 p-2 rounded-xl border border-slate-200 text-center">
        <div class="text-[10px] font-bold text-slate-400 uppercase mb-1">Set ${i+1}</div>
        <div class="flex items-center justify-center gap-1">
          <input type="number" id="sa-${m.id}-${i}" value="${valA}" min="0" class="w-12 text-center rounded-lg border border-slate-300 py-1 font-bold">
          <span class="text-slate-400">-</span>
          <input type="number" id="sb-${m.id}-${i}" value="${valB}" min="0" class="w-12 text-center rounded-lg border border-slate-300 py-1 font-bold">
        </div>
      </div>`;
    }
    return `<div class="p-4 rounded-2xl border border-slate-200 space-y-3 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><strong class="text-sm text-slate-900">${teamName(m.teamAId)} vs ${teamName(m.teamBId)}</strong> <span class="text-slate-500">(${m.date} ${m.time} • ${m.court})</span></div>
        <a href="/planilla.html?matchId=${m.id}&teamA=${encodeURIComponent(teamName(m.teamAId))}&teamB=${encodeURIComponent(teamName(m.teamBId))}" target="_blank" class="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800">Planilla Digital</a>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        ${inputs}
        <button onclick="saveMatchScore('${m.id}', ${maxSets})" class="px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold ml-auto">Guardar Acta</button>
      </div>
    </div>`;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

document.getElementById('configForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const res = await api('/api/tournament/config', 'PUT', {
      name: document.getElementById('cfgName').value,
      setsFormat: document.getElementById('cfgFormat').value,
      minPointDiff: document.getElementById('cfgDiff').value,
      regularSetPoints: document.getElementById('cfgRegPts').value,
      tieBreakPoints: document.getElementById('cfgTiePts').value,
      registrationFee: document.getElementById('cfgFee').value,
      registrationOpen: document.getElementById('cfgRegOpen').value === 'true',
      courts: document.getElementById('cfgCourts').value.split(',')
    });
    showAlert(res.message); loadState();
  } catch (err) { showAlert(err.message, 'danger'); }
});

async function generateFixture() {
  try { const r = await api('/api/fixture/generate', 'POST'); showAlert(r.message); loadState(); }
  catch (err) { showAlert(err.message, 'danger'); }
}

async function resetFixture() {
  try { const r = await api('/api/fixture/reset', 'POST'); showAlert(r.message, 'warning'); loadState(); }
  catch (err) { showAlert(err.message, 'danger'); }
}

async function scheduleMatch(id) {
  try {
    const r = await api(`/api/matches/${id}/schedule`, 'PUT', {
      date: document.getElementById(`d-${id}`).value,
      time: document.getElementById(`t-${id}`).value,
      court: document.getElementById(`c-${id}`).value
    });
    showAlert(r.message); loadState();
  } catch (err) { showAlert(err.message, 'danger'); }
}

async function unscheduleMatch(id) {
  try { const r = await api(`/api/matches/${id}/unschedule`, 'PUT'); showAlert(r.message, 'info'); loadState(); }
  catch (err) { showAlert(err.message, 'danger'); }
}

async function saveMatchScore(id, maxSets) {
  const sets = [];
  for (let i = 0; i < maxSets; i++) {
    sets.push({ a: document.getElementById(`sa-${id}-${i}`).value, b: document.getElementById(`sb-${id}-${i}`).value });
  }
  try { const r = await api(`/api/matches/${id}/score`, 'PUT', { sets }); showAlert(r.message); loadState(); }
  catch (err) { showAlert(err.message, 'danger'); }
}

function addPlayerRow() {
  const div = document.createElement('div');
  div.className = 'grid grid-cols-12 gap-1.5 player-row';
  div.innerHTML = `
    <input type="text" placeholder="Nombre completo" required class="col-span-6 rounded-xl border border-slate-300 px-2.5 py-1.5 p-name">
    <input type="number" placeholder="Dorsal" required class="col-span-3 rounded-xl border border-slate-300 px-2.5 py-1.5 p-num">
    <input type="text" placeholder="Posición" value="Punta" class="col-span-3 rounded-xl border border-slate-300 px-2.5 py-1.5 p-pos">
  `;
  document.getElementById('playersInputs').appendChild(div);
}

document.getElementById('teamForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const players = Array.from(document.querySelectorAll('.player-row')).map(row => ({
    fullName: row.querySelector('.p-name').value,
    number: row.querySelector('.p-num').value,
    position: row.querySelector('.p-pos').value
  }));
  try {
    const r = await api('/api/teams', 'POST', {
      name: document.getElementById('teamName').value,
      coach: document.getElementById('teamCoach').value,
      delegateName: document.getElementById('teamDelegate').value,
      players
    });
    document.getElementById('teamForm').reset();
    document.getElementById('playersInputs').innerHTML = '';
    addPlayerRow();
    showAlert(r.message); loadState();
  } catch (err) { showAlert(err.message, 'danger'); }
});

async function setTeamStatus(id, status) {
  try { const r = await api(`/api/teams/${id}/status`, 'PATCH', { status }); showAlert(r.message); loadState(); }
  catch (err) { showAlert(err.message, 'danger'); }
}

async function addPayment(id, balance) {
  const val = prompt(`Saldo pendiente: $${balance.toLocaleString('es-CO')}. Ingrese el monto del abono (COP):`, balance);
  if (!val) return;
  try { const r = await api(`/api/teams/${id}/payments`, 'POST', { amount: Number(val), concept: 'Abono registrado en plataforma' }); showAlert(r.message); loadState(); }
  catch (err) { showAlert(err.message, 'danger'); }
}

function exportStandingsPNG() {
  html2canvas(document.getElementById('standingsCapture')).then(canvas => {
    const link = document.createElement('a');
    link.download = 'Tabla_Posiciones_TABLIX.png';
    link.href = canvas.toDataURL();
    link.click();
  });
}

addPlayerRow();
updateRoleUI();
loadState();
