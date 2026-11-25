const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  evaluateMatchSets,
  getDefaultPointsTable,
  generateBergerFixture,
  checkScheduleConflict,
  calculateStandings,
  calculateTeamFinance
} = require('./src/domain/tournamentEngine');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'db.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, DB_PATH);
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = (req.headers['x-user-role'] || 'PUBLICO').toUpperCase();
    const userId = req.headers['x-user-id'] || '';
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: `Acceso denegado para el rol '${role}'.` });
    }
    req.userContext = { role, userId };
    next();
  };
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(
    u => u.username.toLowerCase() === String(username || '').trim().toLowerCase() && u.password === password
  );
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser });
});

app.get('/api/state', (req, res) => {
  const db = readDB();
  const tournament = db.tournament;
  const approvedTeams = db.teams.filter(t => t.status === 'APPROVED');
  const teamsWithFinance = db.teams.map(t => ({
    ...t,
    finance: calculateTeamFinance(t, tournament.registrationFee)
  }));

  const financialSummary = teamsWithFinance.reduce((acc, t) => {
    if (t.status !== 'REJECTED') {
      acc.expected += t.finance.registrationFee;
      acc.collected += t.finance.totalPaid;
      acc.pending += t.finance.balance;
    }
    return acc;
  }, { expected: 0, collected: 0, pending: 0 });

  const standings = calculateStandings(approvedTeams, db.matches, tournament.config);
  res.json({ tournament, teams: teamsWithFinance, matches: db.matches, standings, financialSummary });
});

app.put('/api/tournament/config', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  if (db.matches.length > 0) {
    return res.status(400).json({ error: 'No se pueden cambiar las reglas técnicas con el fixture ya generado.' });
  }
  const { name, category, registrationOpen, registrationFee, courts, setsFormat, regularSetPoints, tieBreakPoints, minPointDiff } = req.body;
  if (!name || !Array.isArray(courts) || courts.length === 0) {
    return res.status(400).json({ error: 'Ingrese el nombre del torneo y al menos una cancha.' });
  }
  const format = Number(setsFormat || 3);
  db.tournament.name = String(name).trim();
  db.tournament.category = String(category || 'Libre').trim();
  db.tournament.registrationOpen = Boolean(registrationOpen);
  db.tournament.registrationFee = Math.max(0, Number(registrationFee || 0));
  db.tournament.courts = courts.map(c => String(c).trim()).filter(Boolean);
  db.tournament.config = {
    setsFormat: format,
    regularSetPoints: Math.max(5, Number(regularSetPoints || 25)),
    tieBreakPoints: Math.max(5, Number(tieBreakPoints || 15)),
    minPointDiff: Number(minPointDiff) === 1 ? 1 : 2,
    pointsTable: getDefaultPointsTable(format)
  };
  writeDB(db);
  res.json({ message: 'Reglas del torneo guardadas correctamente.' });
});

app.post('/api/teams', requireRole(['DELEGADO', 'ORGANIZADOR']), (req, res) => {
  const db = readDB();
  if (!db.tournament.registrationOpen && req.userContext.role !== 'ORGANIZADOR') {
    return res.status(400).json({ error: 'Las inscripciones están cerradas.' });
  }
  const { name, coach, delegateName, players } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'El nombre del equipo es obligatorio.' });
  if (db.teams.some(t => t.name.trim().toLowerCase() === String(name).trim().toLowerCase())) {
    return res.status(409).json({ error: 'Ya existe un equipo con ese nombre.' });
  }
  const cleanPlayers = Array.isArray(players) ? players : [];
  const jerseys = new Set();
  for (const p of cleanPlayers) {
    const num = String(p.number || '').trim();
    if (!p.fullName || !num) return res.status(400).json({ error: 'Cada jugador requiere nombre y dorsal.' });
    if (jerseys.has(num)) return res.status(400).json({ error: `Dorsal #${num} repetido en la nómina.` });
    jerseys.add(num);
  }
  const newTeam = {
    id: `T-${String(db.teams.length + 1).padStart(2, '0')}`,
    name: String(name).trim(),
    coach: String(coach || 'Por definir').trim(),
    delegateName: String(delegateName || 'Delegado Club').trim(),
    delegateUserId: req.userContext.userId || 'u-del-1',
    status: req.userContext.role === 'ORGANIZADOR' ? 'APPROVED' : 'PENDING',
    players: cleanPlayers.map((p, idx) => ({
      id: `P-${Date.now()}-${idx}`,
      fullName: String(p.fullName).trim(),
      documentId: String(p.documentId || '').trim(),
      number: String(p.number).trim(),
      position: String(p.position || 'Universal').trim()
    })),
    payments: []
  };
  db.teams.push(newTeam);
  writeDB(db);
  res.status(201).json({ message: 'Equipo inscrito correctamente.', team: newTeam });
});

app.patch('/api/teams/:id/status', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  const team = db.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado.' });
  team.status = req.body.status;
  writeDB(db);
  res.json({ message: 'Estado del equipo actualizado.' });
});

app.post('/api/teams/:id/payments', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  const team = db.teams.find(t => t.id === req.params.id);
  if (!team) return res.status(404).json({ error: 'Equipo no encontrado.' });
  const amount = Number(req.body.amount);
  const concept = String(req.body.concept || 'Abono inscripción').trim();
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Monto inválido.' });
  const fin = calculateTeamFinance(team, db.tournament.registrationFee);
  if (amount > fin.balance && db.tournament.registrationFee > 0) {
    return res.status(400).json({ error: `El abono supera el saldo pendiente ($${fin.balance}).` });
  }
  team.payments.push({ id: `PAY-${Date.now()}`, date: new Date().toISOString().slice(0, 10), amount, concept });
  writeDB(db);
  res.status(201).json({ message: 'Abono financiero registrado.' });
});

app.post('/api/fixture/generate', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  const approved = db.teams.filter(t => t.status === 'APPROVED');
  if (approved.length < 2) return res.status(400).json({ error: 'Se requieren mínimo 2 equipos aprobados.' });
  db.matches = generateBergerFixture(approved);
  db.tournament.registrationOpen = false;
  writeDB(db);
  res.status(201).json({ message: `Fixture generado (${db.matches.length} cruces).` });
});

app.post('/api/fixture/reset', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  db.matches = [];
  db.tournament.registrationOpen = true;
  writeDB(db);
  res.json({ message: 'Fixture reiniciado y registro de inscripciones reabierto.' });
});

app.put('/api/matches/:id/schedule', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado.' });
  const { date, time, court } = req.body;
  if (!date || !time || !court) return res.status(400).json({ error: 'Complete fecha, hora y cancha.' });
  if (checkScheduleConflict(db.matches, { id: match.id, date, time, court })) {
    return res.status(409).json({ error: `Conflicto: la cancha "${court}" ya tiene partido el ${date} a las ${time}.` });
  }
  match.date = date; match.time = time; match.court = court; match.status = 'SCHEDULED';
  writeDB(db);
  res.json({ message: 'Encuentro agendado sin conflictos.' });
});

app.put('/api/matches/:id/unschedule', requireRole(['ORGANIZADOR']), (req, res) => {
  const db = readDB();
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado.' });
  match.date = null; match.time = null; match.court = null; match.status = 'PENDING_SCHEDULE';
  writeDB(db);
  res.json({ message: 'Partido devuelto a pendientes.' });
});

app.put('/api/matches/:id/score', requireRole(['ARBITRO', 'ORGANIZADOR']), (req, res) => {
  const db = readDB();
  const match = db.matches.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado.' });
  if (match.status === 'PENDING_SCHEDULE') return res.status(400).json({ error: 'Agende el partido antes de juzgarlo.' });
  const evaluation = evaluateMatchSets(req.body.sets || [], db.tournament.config);
  if (!evaluation.valid) return res.status(400).json({ error: evaluation.reason });
  match.sets = req.body.sets.filter(s => s.a !== '' && s.b !== '' && s.a !== null && s.b !== null).map(s => ({ a: Number(s.a), b: Number(s.b) }));
  match.result = evaluation;
  match.status = 'COMPLETED';
  writeDB(db);
  res.json({ message: 'Resultado oficial guardado y tabla actualizada.' });
});

app.listen(PORT, () => console.log(`Servidor TABLIX activo en http://localhost:${PORT}`));
