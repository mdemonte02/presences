const {test,expect}=require('@playwright/test');
const AxeBuilder=require('@axe-core/playwright').default;
const {clickTool,settingsTab}=require('./helpers.cjs');
const readState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('presenceCours.v1')));
const saveSettings=page=>page.locator('#courseForm button[type=submit]').click();
test.beforeEach(async({page})=>{
  await page.clock.install({time:new Date('2026-10-15T12:00:00+02:00')});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
});
test('statut du jour : encodage, modification justifiée, conservation et annulation',async({page})=>{
  const row=page.locator('[data-course-row="web"]');
  await row.locator('.quick-present').click();
  await expect(row.locator('.row-today-status')).toHaveText('Présent aujourd’hui');
  await expect(row.locator('.quick-present,.quick-absent')).toHaveCount(0);
  await row.locator('.today-edit').click();await page.locator('label.justified').click();
  await page.locator('#noteInput').fill('Certificat');await page.locator('#attendanceForm button[type=submit]').click();
  await expect(row.locator('.row-today-status')).toHaveText('Justifié aujourd’hui');
  expect((await readState(page)).entries).toHaveLength(1);
  await page.reload();await expect(row.locator('.row-today-status')).toHaveText('Justifié aujourd’hui');
  await row.locator('.today-edit').click();await expect(page.locator('#noteInput')).toHaveValue('Certificat');
  await page.locator('label.absent').click();await page.locator('#attendanceForm button[type=submit]').click();
  await page.locator('#undoBtn').click();await expect(row.locator('.row-today-status')).toHaveText('Justifié aujourd’hui');
});
test('onglets des réglages : clavier, changements conservés et validation d’un champ masqué',async({page})=>{
  await clickTool(page,'settingsBtn');
  await expect(page.locator('[data-course]:visible')).toHaveCount(1);
  await page.locator('[data-course="web"] [data-course-days]').fill('29');
  await page.locator('#settingsCoursePicker').selectOption('os2');
  await page.locator('[data-course="os2"] [data-weekday][value="Jeudi"]').check();
  await page.locator('[data-settings-tab="courses"]').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-settings-tab="quarters"]')).toBeFocused();
  await expect(page.locator('#settings-quarters')).toBeVisible();
  await page.locator('#Q1Start').fill('2026-09-01');await page.locator('#Q1End').fill('2027-01-31');
  await settingsTab(page,'holidays');await page.locator('#addHolidayBtn').click();
  await page.locator('[data-holiday-start]').fill('2026-10-20');
  await settingsTab(page,'courses');await saveSettings(page);
  await expect(page.locator('#settings-holidays')).toBeVisible();
  await expect(page.locator('[data-holiday-end]')).toBeFocused();
  await page.locator('[data-holiday-end]').fill('2026-10-19');await settingsTab(page,'courses');await saveSettings(page);
  await expect(page.locator('#settings-holidays')).toBeVisible();await expect(page.locator('#settingsError')).toContainText('congé');
  await page.locator('[data-holiday-end]').fill('2026-10-21');await saveSettings(page);
  const state=await readState(page);
  expect(state.courses.find(c=>c.id==='web').totalDays).toBe(29);
  expect(state.courses.find(c=>c.id==='os2').day).toContain('Jeudi');
  expect(state.calendar.quarters.Q1.start).toBe('2026-09-01');expect(state.calendar.holidays).toHaveLength(1);
  await clickTool(page,'settingsBtn');await expect(page.locator('[data-settings-tab="courses"]')).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-course="web"] [data-course-days]')).toHaveValue('29');
});
test('aperçu hebdomadaire : déplacements, annulation, congés et navigation entre semaines',async({page})=>{
  await clickTool(page,'settingsBtn');await saveSettings(page);
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('presenceCours.v1'));
    state.calendar.holidays=[{label:'Congé',start:'2026-10-15',end:'2026-10-15'}];
    state.calendar.exceptions=[{courseId:'web',date:'2026-10-12',action:'move',targetDate:'2026-10-14'},{courseId:'os2',date:'2026-10-13',action:'cancel',targetDate:''}];
    state.entries=[{id:'existing',courseId:'web',date:'2026-10-14',status:'justified',note:'',createdAt:'2026-10-14T12:00:00Z'}];
    localStorage.setItem('presenceCours.v1',JSON.stringify(state));
  });await page.reload();
  await page.locator('#weekBtn').click();await expect(page.locator('.week-day')).toHaveCount(5);
  await expect(page.locator('#weekRange')).toContainText('12 oct. 2026');
  await expect(page.locator('.week-day').nth(0)).toContainText('Déplacé au');
  await expect(page.locator('.week-day').nth(1)).toContainText('Annulé au planning');
  await expect(page.locator('.week-day').nth(2)).toContainText('Justifié');
  await expect(page.locator('.week-day').nth(2)).toContainText('Déplacé du');
  await expect(page.locator('.week-day').nth(3)).toContainText('Aucun cours prévu');
  await expect(page.locator('.week-day').nth(4)).toContainText('À venir');
  await page.locator('#weekNext').click();await expect(page.locator('#weekRange')).toContainText('19 oct. 2026');
  await page.locator('#weekPrevious').click();await expect(page.locator('#weekRange')).toContainText('12 oct. 2026');
  await page.locator('#weekCurrent').click();expect((await readState(page)).entries).toHaveLength(1);
});
test('navigation active et retour en haut au clavier',async({page})=>{
  const courses=page.locator('.topbar-actions a[href="#coursesHeading"]');
  const history=page.locator('.topbar-actions a[href="#historyHeading"]');
  await expect(courses).toHaveAttribute('aria-current','location');
  await expect(page.locator('#backToTop')).toBeHidden();
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await expect(history).toHaveAttribute('aria-current','location');
  await expect(page.locator('#backToTop')).toBeVisible();
  await page.locator('#backToTop').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#pageTop')).toBeFocused();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  await expect(courses).toHaveAttribute('aria-current','location');
});
test('audit WCAG automatisé : page claire/sombre, réglages et semaine',async({page})=>{
  async function audit(){
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  }
  await audit();await page.locator('#themeBtn').click();await audit();
  await clickTool(page,'settingsBtn');await audit();
  await settingsTab(page,'quarters');await audit();
  await settingsTab(page,'holidays');await audit();
  await page.locator('#cancelCourseBtn').click();await page.locator('#weekBtn').click();await audit();
});
test('recomposition à une largeur équivalente au zoom 200 % sur un écran 1280 px',async({page})=>{
  await page.setViewportSize({width:640,height:450});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#toolsMenu > summary').click();
  const box=await page.locator('#toolsPanel').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(640);
  await page.keyboard.press('Escape');await clickTool(page,'settingsBtn');
  await expect(page.locator('#settingsCoursePicker')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#cancelCourseBtn').click();await page.locator('#weekBtn').click();
  await expect(page.locator('#weekDays')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('repère du jour : suit les déplacements et annulations sans changer l’historique',async({page})=>{
  await expect(page.locator('[data-course-row="computers"] .course-today-marker')).toBeVisible();
  await expect(page.locator('[data-course-row="web"] .course-today-marker')).toBeHidden();
  await clickTool(page,'settingsBtn');await saveSettings(page);
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('presenceCours.v1'));
    state.calendar.exceptions=[{courseId:'web',date:'2026-10-12',action:'move',targetDate:'2026-10-15'},{courseId:'computers',date:'2026-10-15',action:'cancel',targetDate:''}];
    localStorage.setItem('presenceCours.v1',JSON.stringify(state));
  });await page.reload();
  await expect(page.locator('[data-course-row="web"] .course-today-marker')).toBeVisible();
  await expect(page.locator('[data-course-row="computers"] .course-today-marker')).toBeHidden();
  expect((await readState(page)).entries).toHaveLength(0);
});
test('défilement : en-tête du tableau et actions des réglages restent accessibles',async({page})=>{
  await clickTool(page,'settingsBtn');await saveSettings(page);
  await page.evaluate(()=>{
    const state=JSON.parse(localStorage.getItem('presenceCours.v1'));state.courses.forEach(course=>{course.quarter='Q1';});
    localStorage.setItem('presenceCours.v1',JSON.stringify(state));
  });await page.reload();
  const table=page.locator('.courses-table-wrap');
  await table.scrollIntoViewIfNeeded();
  const header=page.locator('.courses-table thead th').first();
  const before=await header.boundingBox();
  expect(await table.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await table.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const after=await header.boundingBox();expect(Math.abs(before.y-after.y)).toBeLessThanOrEqual(1);
  await clickTool(page,'settingsBtn');await settingsTab(page,'holidays');
  for(let i=0;i<10;i++)await page.locator('#addHolidayBtn').click();
  const body=page.locator('.settings-scroll');
  expect(await body.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  const save=page.locator('#courseForm button[type=submit]');
  const lower=await save.boundingBox();
  expect(lower.y+lower.height).toBeLessThanOrEqual(1000);
  await body.evaluate(el=>{el.scrollTop=0;});
  const upper=await save.boundingBox();expect(Math.abs(lower.y-upper.y)).toBeLessThanOrEqual(1);
  await page.locator('#cancelCourseBtn').click();await expect(page.locator('#courseDialog')).not.toBeVisible();
  expect((await readState(page)).calendar.holidays).toHaveLength(0);
});
