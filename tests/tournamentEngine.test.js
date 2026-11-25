const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSetScore, evaluateMatchSets, generateBergerFixture, checkScheduleConflict, calculateStandings, calculateTeamFinance } = require('../src/domain/tournamentEngine');

test('PU-01: Validación de set regular (25 pts y diferencia 2) y tie-break (15 pts)', () => {
  const cfg = { regularSetPoints: 25, tieBreakPoints: 15, minPointDiff: 2 };
  assert.equal(validateSetScore(25, 23, cfg, false).valid, true);
  assert.equal(validateSetScore(25, 24, cfg, false).valid, false);
  assert.equal(validateSetScore(27, 25, cfg, false).valid, true);
  assert.equal(validateSetScore(15, 13, cfg, true).valid, true);
  assert.equal(validateSetScore(-2, 25, cfg, false).valid, false);
});

test('PU-02: Formatos flexibles (1 set, 2 sets fijos con empate, mejor de 3 y bloqueo excedente)', () => {
  const res1 = evaluateMatchSets([{ a: 21, b: 20 }], { setsFormat: 1, regularSetPoints: 21, minPointDiff: 1 });
  assert.equal(res1.valid, true);
  assert.equal(res1.winner, 'A');

  const res2 = evaluateMatchSets([{ a: 21, b: 18 }, { a: 19, b: 21 }], { setsFormat: 2, regularSetPoints: 21, minPointDiff: 2 });
  assert.equal(res2.valid, true);
  assert.equal(res2.winner, 'DRAW');
  assert.equal(res2.tablePtsA, 1);

  const res3Inv = evaluateMatchSets([{ a: 25, b: 20 }, { a: 25, b: 18 }, { a: 15, b: 10 }], { setsFormat: 3, regularSetPoints: 25, tieBreakPoints: 15, minPointDiff: 2 });
  assert.equal(res3Inv.valid, false);
});

test('PU-03: Algoritmo de rotación de Berger con equipos pares e impares (BYE)', () => {
  const t4 = [{ id: 'T1', name: 'A' }, { id: 'T2', name: 'B' }, { id: 'T3', name: 'C' }, { id: 'T4', name: 'D' }];
  assert.equal(generateBergerFixture(t4).length, 6);
  const t5 = [...t4, { id: 'T5', name: 'E' }];
  assert.equal(generateBergerFixture(t5).length, 10);
});

test('PU-04: Detección preventiva de conflictos de cancha, fecha y hora', () => {
  const existing = [{ id: 'M-001', status: 'SCHEDULED', date: '2026-11-25', time: '18:00', court: 'Cancha 1' }];
  assert.equal(checkScheduleConflict(existing, { id: 'M-002', date: '2026-11-25', time: '18:00', court: 'cancha 1' }), true);
  assert.equal(checkScheduleConflict(existing, { id: 'M-002', date: '2026-11-25', time: '18:00', court: 'Cancha 2' }), false);
});

test('PU-05: Cálculo de tabla de posiciones y control financiero de inscripciones', () => {
  const teams = [
    { id: 'T1', name: 'Alfa', payments: [{ amount: 200000 }] },
    { id: 'T2', name: 'Beta', payments: [{ amount: 80000 }] }
  ];
  const cfg = { setsFormat: 3, regularSetPoints: 25, tieBreakPoints: 15, minPointDiff: 2 };
  const ev = evaluateMatchSets([{ a: 25, b: 20 }, { a: 25, b: 19 }], cfg);
  const matches = [{ id: 'M-001', teamAId: 'T1', teamBId: 'T2', status: 'COMPLETED', sets: [{ a: 25, b: 20 }, { a: 25, b: 19 }], result: ev }];
  const st = calculateStandings(teams, matches, cfg);
  assert.equal(st[0].teamId, 'T1');
  assert.equal(st[0].pts, 3);
  assert.equal(calculateTeamFinance(teams[0], 200000).financialStatus, 'PAGADO');
  assert.equal(calculateTeamFinance(teams[1], 200000).financialStatus, 'ABONADO');
  assert.equal(calculateTeamFinance(teams[1], 200000).balance, 120000);
});
