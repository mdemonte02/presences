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
test('déplacement et annulation : jours habituels inchangés et absence de doublon', () => {
  const c = calendar();
  const list = [{ id:'web', day:'Lundi', totalDays:25 }];
  c.exceptions = [{courseId:'web',date:'2026-10-12',action:'move',targetDate:'2026-10-15'}];
  P.validateExceptions(c,list);
  assert.equal(P.scheduledCourses(list,c,'Q1','2026-10-12').length,0);
  assert.equal(P.scheduledCourses(list,c,'Q1','2026-10-15').length,1);
  assert.equal(list[0].day,'Lundi');
  c.exceptions = [{courseId:'web',date:'2026-10-12',action:'cancel',targetDate:''}];
  assert.equal(P.scheduledCourses(list,c,'Q1','2026-10-12').length,0);
  assert.equal(P.scheduledCourses(list,c,'Q1','2026-10-26').length,1);
});
test('déplacements : collisions, mauvais cours, congés et dates hors quadrimestre refusés', () => {
  const list = [{id:'web',day:'Lundi'}];
  for (const targetDate of ['2026-10-12','2026-10-19','2026-10-26','2027-02-02','2026-02-30']) {
    const c=calendar(); c.exceptions=[{courseId:'web',date:'2026-10-12',action:'move',targetDate}];
    assert.throws(()=>P.validateExceptions(c,list));
  }
  const c=calendar();
  c.exceptions=[{courseId:'web',date:'2026-10-12',action:'move',targetDate:'2026-10-15'},{courseId:'web',date:'2026-10-05',action:'move',targetDate:'2026-10-15'}];
  assert.throws(()=>P.validateExceptions(c,list));
  c.exceptions=[{courseId:'web',date:'2026-10-13',action:'cancel'}];
  assert.throws(()=>P.validateExceptions(c,list));
  c.exceptions=[{courseId:'unknown',date:'2026-10-12',action:'cancel'}];
  assert.throws(()=>P.validateExceptions(c,list));
});
test('rappels : congés, déplacements, annulations, déjà encodés et séances futures exclus', () => {
  const list=[{id:'web',day:'Lundi'}], c=calendar();
  c.exceptions=[{courseId:'web',date:'2026-10-12',action:'move',targetDate:'2026-10-13'},{courseId:'web',date:'2026-10-05',action:'cancel'}];
  const entries=[{id:'recorded',courseId:'web',date:'2026-09-28',status:'cancelled'}];
  const before=structuredClone(entries);
  assert.deepEqual(P.missingSessions(list,c,'Q1',entries,'2026-09-28','2026-10-26','2026-10-15'),[{courseId:'web',date:'2026-10-13'}]);
  assert.deepEqual(entries,before);
  assert.deepEqual(P.missingSessions(list,c,'Q1',entries,'2026-10-15','2026-10-26','2026-10-15'),[]);
  assert.throws(()=>P.missingSessions(list,c,'Q1',entries,'2025-01-01','2026-10-26','2026-10-15'));
});
test('correction groupée : identifiants, dates, notes et lignes non sélectionnées conservés', () => {
  const entries=[{id:'a',courseId:'web',date:'2026-10-01',status:'absent',note:'Certificat',createdAt:'original'},{id:'b',courseId:'web',date:'2026-10-02',status:'absent',note:'Note B',createdAt:'original'}];
  const before=structuredClone(entries);
  const next=P.updateEntries(entries,['a'],{status:'justified'});
  assert.deepEqual(next[0],{...entries[0],status:'justified'});
  assert.deepEqual(next[1],entries[1]); assert.deepEqual(entries,before);
  assert.equal(P.updateEntries(entries,['a','b'],{status:'present',note:''})[1].note,'');
  for(const ids of [[],['missing'],['a','a']]) assert.throws(()=>P.updateEntries(entries,ids,{status:'present'}));
  assert.throws(()=>P.updateEntries(entries,['a'],{status:'unknown'}));
});
test('bilan et tri : justifiés présents, annulations exclues et valeurs vides en dernier', () => {
  const list=[{id:'a',name:'Algèbre',totalDays:10},{id:'b',name:'Base',totalDays:20},{id:'c',name:'Communication',totalDays:15}];
  const rows=P.courseReport(list,[{courseId:'a',status:'present'},{courseId:'a',status:'justified'},{courseId:'a',status:'cancelled'},{courseId:'b',status:'absent'}]);
  assert.equal(rows[0].presenceRate,100); assert.equal(rows[1].left,7); assert.equal(rows[2].presenceRate,null);
  assert.deepEqual(P.sortReport(rows,'presenceRate','desc').map(r=>r.id),['a','b','c']);
  assert.deepEqual(P.sortReport(rows,'presenceRate','asc').map(r=>r.id),['b','a','c']);
  assert.deepEqual(P.sortReport(rows,'name','desc').map(r=>r.id),['c','b','a']);
});
test('CSV Excel : BOM, séparateur, guillemets, retours à la ligne et formules neutralisées', () => {
  const csv=P.toCsv([['Cours','Note','Total'],['Éléments; statistiques','Texte "cité"\nseconde ligne',2],['=CMD()','  +SUM(A1:A2)',0]]);
  assert(csv.startsWith('\uFEFF"Cours";"Note";"Total"\r\n'));
  assert(csv.includes('"Éléments; statistiques";"Texte ""cité""\nseconde ligne";"2"'));
  assert(csv.includes('"\'=CMD()";"\'  +SUM(A1:A2)";"0"'));
});
