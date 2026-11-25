function validateSetScore(scoreA, scoreB, config, isTieBreak = false) {
  const a = Number(scoreA);
  const b = Number(scoreB);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { valid: false, reason: 'Los puntajes deben ser enteros positivos o cero.' };
  }
  const target = isTieBreak ? Number(config.tieBreakPoints || 15) : Number(config.regularSetPoints || 25);
  const minDiff = Number(config.minPointDiff || 2);
  if (a === b) return { valid: false, reason: 'Un set no puede finalizar empatado.' };
  const maxPts = Math.max(a, b);
  const diff = Math.abs(a - b);
  if (maxPts < target) return { valid: false, reason: `El ganador debe alcanzar al menos ${target} puntos.` };
  if (diff < minDiff) return { valid: false, reason: `Se requiere diferencia mínima de ${minDiff} punto(s).` };
  if (maxPts > target && minDiff === 2 && diff > 2) {
    return { valid: false, reason: `En extensión por encima de ${target}, la diferencia debe ser exactamente 2 puntos.` };
  }
  return { valid: true, winner: a > b ? 'A' : 'B' };
}

function getDefaultPointsTable(format) {
  switch (Number(format)) {
    case 1: return { '1-0': { winner: 2, loser: 0 } };
    case 2: return { '2-0': { winner: 3, loser: 0 }, '1-1': { draw: 1 } };
    case 5: return { '3-0': { winner: 3, loser: 0 }, '3-1': { winner: 3, loser: 0 }, '3-2': { winner: 2, loser: 1 } };
    case 3:
    default: return { '2-0': { winner: 3, loser: 0 }, '2-1': { winner: 2, loser: 1 } };
  }
}

function evaluateMatchSets(setsArray, config) {
  const format = Number(config.setsFormat || 3);
  const requiredSetsToWin = format === 2 ? null : Math.ceil(format / 2);
  let setsWonA = 0, setsWonB = 0, pointsForA = 0, pointsForB = 0;

  for (let i = 0; i < setsArray.length; i++) {
    const s = setsArray[i];
    if (s.a === '' || s.b === '' || s.a === null || s.b === null || s.a === undefined || s.b === undefined) continue;
    if (requiredSetsToWin && (setsWonA === requiredSetsToWin || setsWonB === requiredSetsToWin)) {
      return { valid: false, reason: `El partido ya se definió; el set ${i + 1} es excedente.` };
    }
    const isDecisive = (format === 3 && i === 2) || (format === 5 && i === 4);
    const check = validateSetScore(s.a, s.b, config, isDecisive);
    if (!check.valid) return { valid: false, reason: `Set ${i + 1}: ${check.reason}` };
    pointsForA += Number(s.a);
    pointsForB += Number(s.b);
    if (check.winner === 'A') setsWonA++; else setsWonB++;
  }

  if (format === 2) {
    if (setsWonA + setsWonB < 2) return { valid: false, reason: 'En modalidad de 2 sets fijos deben registrarse ambos sets.' };
  } else if (setsWonA < requiredSetsToWin && setsWonB < requiredSetsToWin) {
    return { valid: false, reason: `Ningún equipo alcanzó los ${requiredSetsToWin} sets requeridos.` };
  }

  const scoreKey = `${Math.max(setsWonA, setsWonB)}-${Math.min(setsWonA, setsWonB)}`;
  const pointsTable = config.pointsTable || getDefaultPointsTable(format);
  const rule = pointsTable[scoreKey] || { winner: 2, loser: 1, draw: 1 };
  let tablePtsA = 0, tablePtsB = 0, winner = 'DRAW';
  if (setsWonA > setsWonB) { winner = 'A'; tablePtsA = Number(rule.winner); tablePtsB = Number(rule.loser); }
  else if (setsWonB > setsWonA) { winner = 'B'; tablePtsB = Number(rule.winner); tablePtsA = Number(rule.loser); }
  else { tablePtsA = Number(rule.draw ?? 1); tablePtsB = Number(rule.draw ?? 1); }

  return { valid: true, winner, setsWonA, setsWonB, pointsForA, pointsForB, tablePtsA, tablePtsB, scoreKey };
}

function generateBergerFixture(approvedTeams) {
  if (!Array.isArray(approvedTeams) || approvedTeams.length < 2) {
    throw new Error('Se requieren al menos 2 equipos aprobados para generar el fixture.');
  }
  const list = [...approvedTeams];
  if (list.length % 2 !== 0) list.push({ id: 'BYE', name: 'DESCANSO (BYE)' });
  const n = list.length, totalRounds = n - 1, half = n / 2, matches = [];
  let matchNumber = 1;
  const rotating = list.slice(0, n - 1), fixed = list[n - 1];

  for (let round = 1; round <= totalRounds; round++) {
    const current = [...rotating, fixed];
    for (let i = 0; i < half; i++) {
      const home = current[i], away = current[n - 1 - i];
      if (home.id === 'BYE' || away.id === 'BYE') continue;
      const swap = round % 2 === 0 && i === 0;
      matches.push({
        id: `M-${String(matchNumber++).padStart(3, '0')}`,
        round, teamAId: swap ? away.id : home.id, teamBId: swap ? home.id : away.id,
        status: 'PENDING_SCHEDULE', date: null, time: null, court: null, sets: [], result: null
      });
    }
    rotating.unshift(rotating.pop());
  }
  return matches;
}

function checkScheduleConflict(matches, candidate) {
  return matches.some(m =>
    m.id !== candidate.id && m.status !== 'PENDING_SCHEDULE' &&
    m.date === candidate.date && m.time === candidate.time &&
    m.court.trim().toLowerCase() === candidate.court.trim().toLowerCase()
  );
}

function calculateStandings(approvedTeams, matches, config) {
  const tableMap = new Map();
  approvedTeams.forEach(t => tableMap.set(t.id, {
    teamId: t.id, teamName: t.name, pts: 0, pj: 0, pg: 0, pe: 0, pp: 0, sf: 0, sc: 0, setDiff: 0, pf: 0, pc: 0, pointRatio: 0
  }));

  matches.filter(m => m.status === 'COMPLETED' && m.result).forEach(m => {
    const sA = tableMap.get(m.teamAId), sB = tableMap.get(m.teamBId);
    if (!sA || !sB) return;
    const res = m.result.valid ? m.result : evaluateMatchSets(m.sets, config);
    if (!res.valid) return;
    sA.pj++; sB.pj++;
    sA.pts += res.tablePtsA; sB.pts += res.tablePtsB;
    sA.sf += res.setsWonA; sA.sc += res.setsWonB;
    sB.sf += res.setsWonB; sB.sc += res.setsWonA;
    sA.pf += res.pointsForA; sA.pc += res.pointsForB;
    sB.pf += res.pointsForB; sB.pc += res.pointsForA;
    if (res.winner === 'A') { sA.pg++; sB.pp++; }
    else if (res.winner === 'B') { sB.pg++; sA.pp++; }
    else { sA.pe++; sB.pe++; }
  });

  return Array.from(tableMap.values()).map(r => {
    r.setDiff = r.sf - r.sc;
    r.pointRatio = r.pc === 0 ? (r.pf > 0 ? r.pf : 0) : Number((r.pf / r.pc).toFixed(3));
    return r;
  }).sort((a, b) => (b.pts - a.pts) || (b.pg - a.pg) || (b.setDiff - a.setDiff) || (b.pointRatio - a.pointRatio));
}

function calculateTeamFinance(team, registrationFee) {
  const fee = Number(registrationFee || 0);
  const payments = Array.isArray(team.payments) ? team.payments : [];
  const totalPaid = payments.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const balance = Math.max(0, fee - totalPaid);
  const financialStatus = (fee === 0 || totalPaid >= fee) ? 'PAGADO' : (totalPaid > 0 ? 'ABONADO' : 'PENDIENTE');
  return { registrationFee: fee, totalPaid, balance, financialStatus, payments };
}

module.exports = { validateSetScore, evaluateMatchSets, getDefaultPointsTable, generateBergerFixture, checkScheduleConflict, calculateStandings, calculateTeamFinance };
