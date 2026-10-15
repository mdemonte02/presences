const { clickTool } = require('./helpers.cjs');
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const readState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('presenceCours.v1')));
async function close(page,id){await page.locator(`[data-close="${id}"]`).first().click();}
async function exception(page,course,date,action,target=''){
  await clickTool(page, 'exceptionsBtn');
  await page.locator('#exceptionCourse').selectOption(course);
  await page.locator('#exceptionDate').fill(date);
  await page.locator('#exceptionAction').selectOption(action);
  if(target)await page.locator('#exceptionTarget').fill(target);
  await page.locator('#exceptionForm button[type=submit]').click();
}
async function seed(page){
  await page.locator('#coursesGrid .quick-present').first().click();
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('presenceCours.v1'));
    state.entries=[{id:'a',courseId:'web',date:'2026-10-12',status:'absent',note:'Certificat',createdAt:'2026-10-12T12:00:00Z'},{id:'b',courseId:'web',date:'2026-10-05',status:'present',note:'Note B',createdAt:'2026-10-05T12:00:00Z'},{id:'c',courseId:'os2',date:'2026-10-13',status:'absent',note:'Note C',createdAt:'2026-10-13T12:00:00Z'}];
    localStorage.setItem('presenceCours.v1',JSON.stringify(state));
  });await page.reload();
}
test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-10-15T12:00:00+02:00')});
  await page.goto('/');
});
test('déplacer un cours, conserver son historique et le jour habituel, puis annuler le planning',async({page})=>{
  await seed(page);const before=(await readState(page)).entries;
  await exception(page,'web','2026-10-12','move','2026-10-15');
  await expect(page.locator('#exceptionsList')).toContainText('Déplacé au');
  await close(page,'exceptionsDialog');
  await expect(page.locator('.today-course')).toHaveCount(2);
  expect((await readState(page)).entries).toEqual(before);
  await expect(page.locator('#coursesGrid .course-day').first()).toHaveText('Lundi');
  await page.reload();await expect(page.locator('.today-course')).toHaveCount(2);
  await clickTool(page, 'batchBtn');
  await expect(page.locator('[data-batch-course="web"] [data-batch-include]')).toBeChecked();
  await page.locator('#cancelBatchBtn').click();
  await exception(page,'computers','2026-10-15','cancel');await close(page,'exceptionsDialog');
  await expect(page.locator('.today-course')).toHaveCount(1);
  await page.locator('#undoBtn').click();await expect(page.locator('.today-course')).toHaveCount(2);
  await clickTool(page, 'exceptionsBtn');await page.locator('#exceptionsList button').click();await close(page,'exceptionsDialog');
  await expect(page.locator('.today-course')).toHaveCount(1);
});
test('conflits de déplacement refusés et sauvegarde JSON des changements',async({page},testInfo)=>{
  await exception(page,'web','2026-10-12','move','2026-10-19');
  await expect(page.locator('#exceptionError')).toContainText('déjà prévue');
  await page.locator('#exceptionTarget').fill('2026-10-15');await page.locator('#exceptionForm button[type=submit]').click();await close(page,'exceptionsDialog');
  const downloadPromise=page.waitForEvent('download');await clickTool(page, 'exportBtn');const d=await downloadPromise;
  const path=testInfo.outputPath('planning.json');await d.saveAs(path);
  const saved=JSON.parse(await fs.readFile(path,'utf8'));expect(saved.calendar.exceptions).toHaveLength(1);
  page.on('dialog',dialog=>dialog.accept());await page.locator('#importInput').setInputFiles(path);
  await expect(page.locator('#noticeText')).toContainText('Sauvegarde importée');
  await page.reload();await expect(page.locator('.today-course')).toHaveCount(2);
});
test('séances à vérifier : période, déplacement, annulation et encodage sans absence automatique',async({page})=>{
  await exception(page,'web','2026-10-12','move','2026-10-14');await close(page,'exceptionsDialog');
  await exception(page,'os2','2026-10-13','cancel');await close(page,'exceptionsDialog');
  await page.locator('#missingBtn').click();await page.locator('#missingStart').fill('2026-10-12');await page.locator('#missingEnd').fill('2026-10-15');
  await expect(page.locator('.missing-row')).toHaveCount(2);
  await expect(page.locator('#missingList')).toContainText('14 oct. 2026');
  await expect(page.locator('#missingList')).not.toContainText('12 oct. 2026');
  expect((await readState(page)).entries).toHaveLength(0);
  await page.getByRole('button',{name:/Encoder Projet de développement Web du/}).click();
  await expect(page.locator('#dateInput')).toHaveValue('2026-10-14');await expect(page.locator('#courseSelect')).toHaveValue('web');
  await expect(page.locator('input[name=status]:checked')).toHaveCount(0);
  await page.locator('label.justified').click();await page.locator('#attendanceForm button[type=submit]').click();
  await expect(page.locator('#summaryGrid strong').first()).toHaveText('100%');
  await page.locator('#missingBtn').click();await page.locator('#missingStart').fill('2026-10-12');await page.locator('#missingEnd').fill('2026-10-15');
  await expect(page.locator('.missing-row')).toHaveCount(1);
  await page.locator('#missingStart').fill('2024-01-01');await expect(page.locator('#missingError')).toContainText('366');
});
test('tableau triable, CSV Excel et bilan imprimable',async({page},testInfo)=>{
  await seed(page);await page.locator('#overviewBtn').click();
  await expect(page.locator('#reportRows tr')).toHaveCount(5);
  await page.locator('[data-sort=absent]').click();await page.locator('[data-sort=absent]').click();
  await expect(page.locator('[data-sort-header=absent]')).toHaveAttribute('aria-sort','descending');
  await expect(page.locator('#reportRows tr').first()).toContainText('Projet de développement Web');
  const summaryPromise=page.waitForEvent('download');await page.locator('#csvSummaryBtn').click();const summary=await summaryPromise;
  const path=testInfo.outputPath('bilan.csv');await summary.saveAs(path);const csv=await fs.readFile(path,'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);expect(csv).toContain('"Projet de développement Web";"Q1";"1";"0";"1"');
  const historyPromise=page.waitForEvent('download');await page.locator('#csvHistoryBtn').click();const history=await historyPromise;
  const historyPath=testInfo.outputPath('seances.csv');await history.saveAs(historyPath);expect(await fs.readFile(historyPath,'utf8')).toContain('Certificat');
  await page.evaluate(()=>{window.print=()=>{window.printCalled=true;};});await page.locator('#printReportBtn').click();
  expect(await page.evaluate(()=>window.printCalled)).toBe(true);
  await page.emulateMedia({media:'print'});await expect(page.locator('#printReport')).toBeVisible();await expect(page.locator('main')).not.toBeVisible();
  await expect(page.locator('#printReport tbody tr')).toHaveCount(5);
  await page.pdf({path:testInfo.outputPath('bilan.pdf'),preferCSSPageSize:true});
});
test('correction groupée : confirmation, notes et dates conservées, puis annulation complète',async({page})=>{
  await seed(page);const original=(await readState(page)).entries;
  await page.locator('#historyCourse').selectOption('web');await page.locator('#selectHistory').check();
  await expect(page.locator('#bulkEditBtn')).toHaveText('Corriger la sélection (2)');await page.locator('#bulkEditBtn').click();
  await expect(page.locator('#bulkSelection p')).toHaveCount(2);await page.locator('#bulkStatus').selectOption('justified');
  page.once('dialog',d=>d.dismiss());await page.locator('#bulkEditForm button[type=submit]').click();expect((await readState(page)).entries).toEqual(original);
  page.once('dialog',d=>d.accept());await page.locator('#bulkEditForm button[type=submit]').click();
  const next=(await readState(page)).entries;
  expect(next.filter(e=>e.courseId==='web').every(e=>e.status==='justified')).toBe(true);
  expect(next.map(e=>e.note)).toEqual(original.map(e=>e.note));expect(next.map(e=>e.date)).toEqual(original.map(e=>e.date));
  expect(next.find(e=>e.id==='c')).toEqual(original.find(e=>e.id==='c'));
  await page.locator('#undoBtn').click();expect((await readState(page)).entries).toEqual(original);
  await page.reload();expect((await readState(page)).entries).toEqual(original);
});
test('changement de filtre efface la sélection et remplacement explicite des notes',async({page})=>{
  await seed(page);await page.locator('#selectHistory').check();await page.locator('#historyStatus').selectOption('absent');
  await expect(page.locator('#bulkEditBtn')).toBeDisabled();await page.locator('#selectHistory').check();await page.locator('#bulkEditBtn').click();
  await page.locator('#bulkStatus').selectOption('present');await page.locator('#bulkReplaceNote').check();await page.locator('#bulkNote').fill('Correction');
  page.once('dialog',d=>d.accept());await page.locator('#bulkEditForm button[type=submit]').click();
  const entries=(await readState(page)).entries;expect(entries.filter(e=>e.id!=='b').every(e=>e.note==='Correction')).toBe(true);expect(entries.find(e=>e.id==='b').note).toBe('Note B');
});
