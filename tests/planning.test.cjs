const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../presence-cours-app-v3/planning.js');
const courses = [
  { id: 'web', day: 'Lundi / Jeudi' },
  { id: 'math', day: 'Jeudi', quarter: 'Q2' },
  { id: 'stats', day: 'Lundi / Vendredi' }
];
function calendar() {
  return { quarters: { Q1: { start: '2026-09-01', end: '2027-01-31' }, Q2: { start: '2027-02-01', end: '2027-06-30' } }, holidays: [{ label: 'Congé', start: '2026-10-19', end: '2026-10-25' }] };
}
test('dates : années bissextiles et dates impossibles', () => {
  assert(P.validDate('2028-02-29'));
  for (const date of ['2026-02-29', '2026-13-01', '2026-1-01', '', null]) assert(!P.validDate(date));
});
test('anciens cours : quadrimestre conservé par défaut, choix explicite prioritaire', () => {
  assert.equal(P.quarterOf(courses[0]), 'Q1');
  assert.equal(P.quarterOf(courses[1]), 'Q2');
  assert.equal(P.quarterOf(courses[2]), 'Q2');
});
test('horaire : jours multiples, bornes inclusives et quadrimestre', () => {
  const c = calendar();
  assert.deepEqual(P.scheduledCourses(courses, c, 'Q1', '2026-10-15').map(c => c.id), ['web']);
  assert.deepEqual(P.scheduledCourses(courses, c, 'Q2', '2026-10-15'), []);
  assert.deepEqual(P.scheduledCourses(courses, c, 'Q1', '2026-08-31'), []);
  assert.deepEqual(P.scheduledCourses(courses, c, 'Q2', '2027-02-01').map(c => c.id), ['stats']);
  assert.deepEqual(P.scheduledCourses(courses, P.emptyCalendar(), 'Q1', '2026-10-17'), []);
});
test('congés : premier jour, dernier jour et périodes chevauchantes', () => {
  const c = calendar();
  c.holidays.push({ label: '', start: '2026-10-22', end: '2026-10-26' });
  for (const date of ['2026-10-19', '2026-10-22', '2026-10-26']) assert.deepEqual(P.scheduledCourses(courses, c, 'Q1', date), []);
  assert.equal(P.scheduledCourses(courses, c, 'Q1', '2026-10-29').length, 1);
});
test('validation : dates partielles, inversées, chevauchantes et congés invalides', () => {
  P.validateCalendar(P.emptyCalendar());
  P.validateCalendar(calendar());
  for (const mutation of [c => c.quarters.Q1.end = '', c => c.quarters.Q1.end = '2026-01-01', c => c.quarters.Q2.start = '2027-01-31', c => c.holidays[0].start = '2026-02-30']) {
    const c = calendar(); mutation(c); assert.throws(() => P.validateCalendar(c));
  }
});
test('bilan : justifié = présent, annulation exclue et période inclusive', () => {
  const entries = ['present', 'justified', 'absent', 'cancelled'].map((status, i) => ({ status, date: `2026-10-0${i+1}` }));
  assert.deepEqual(P.statistics(entries), { present: 1, absent: 1, justified: 1, cancelled: 1, completed: 3, presenceRate: 66.7 });
  assert.equal(P.statistics(P.inPeriod(entries, '2026-10-01', '2026-10-02')).presenceRate, 100);
  assert.equal(P.statistics(P.inPeriod(entries, '2026-10-04')).presenceRate, null);
  assert.equal(P.inPeriod(entries, '', '2026-10-02').length, 2);
});
test('lot : remplacement unique, notes et identifiants conservés, entrées non sélectionnées intactes', () => {
  const original = [{ id: 'old', courseId: 'web', date: '2026-10-15', status: 'absent', note: 'Ancien', createdAt: 'before' }, { id: 'untouched', courseId: 'stats', date: '2026-10-15', status: 'present', note: '', createdAt: 'before' }];
  const before = structuredClone(original);
  const next = P.applyBatch(original, '2026-10-15', [{ courseId: 'web', status: 'justified', note: 'Certificat' }, { courseId: 'math', status: 'cancelled', note: '' }], courses, () => 'new', 'now');
  assert.deepEqual(original, before);
  assert.equal(next.length, 3);
  assert.deepEqual(next.find(e => e.id === 'untouched'), original[1]);
  assert.equal(next.find(e => e.id === 'old').createdAt, 'before');
  assert.equal(next.find(e => e.id === 'old').status, 'justified');
  assert.equal(next.find(e => e.id === 'new').courseId, 'math');
});
test('lot invalide : aucune modification partielle', () => {
  const original = [];
  const row = { courseId: 'web', status: 'present', note: '' };
  for (const rows of [[], [row, row], [{ ...row, status: 'unknown' }], [{ ...row, courseId: 'unknown' }], [{ ...row, note: 'x'.repeat(121) }]]) assert.throws(() => P.applyBatch(original, '2026-10-15', rows, courses, () => 'id', 'now'));
  assert.deepEqual(original, []);
});
