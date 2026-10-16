const Planning = PresencePlanning;
const STORAGE_KEY = "presenceCours.v1";

const DEFAULT_COURSES = [
  { id: "web", name: "Projet de développement Web", day: "Lundi", totalDays: 25 },
  { id: "os2", name: "Système d'exploitation", day: "Mardi", totalDays: 25 },
  { id: "ebusiness", name: "Notions de e-business", day: "Mercredi", totalDays: 20 },
  { id: "networks", name: "Base des réseaux", day: "Mardi / Vendredi", totalDays: 20 },
  { id: "sgbd", name: "Projet de développement SGBD", day: "Jeudi", totalDays: 20 },
  { id: "computers", name: "Structure des ordinateurs", day: "Jeudi", totalDays: 15 },
  { id: "math", name: "Mathématique appliquée à l'informatique", day: "Vendredi", totalDays: 15 },
  { id: "stats", name: "Éléments de statistiques", day: "Lundi / Vendredi", totalDays: 10 },
  { id: "communication", name: "Information & communication professionnelle", day: "Mercredi", totalDays: 10 }
];

const statusLabels = {
  present: "Présent",
  absent: "Absent",
  justified: "Justifié",
  cancelled: "Annulé"
};

let state = loadState();
// Appliquer une fois le thème clair de la nouvelle direction, puis conserver le choix.
if (localStorage.getItem("presenceCours.appearance") !== "minimal-v1") {
  localStorage.setItem("presenceCours.theme", "light");
  localStorage.setItem("presenceCours.appearance", "minimal-v1");
}
state.dark = localStorage.getItem("presenceCours.theme") === "dark";
let selectedQuarter = localStorage.getItem("presenceCours.quarter") === "Q2" ? "Q2" : "Q1";
let editingId = null;
let undoEntries = null;
let detailsCourseId = null;
const historySelection = new Set();
let visibleHistoryIds = [];
let reportSort = { key: "name", direction: "asc" };
let courseSort = null;
let weekOffset = 0;
function iconMarkup(name) {
  return `<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="ui-icons.svg?v=19#${name}"/></svg>`;
}
function decorateButtons(root = document) {
  root.querySelectorAll("button[data-icon]").forEach(button => {
    if (!button.querySelector(".ui-icon")) button.insertAdjacentHTML("afterbegin", iconMarkup(button.dataset.icon));
  });
}
function visibleCourses() { return state.courses.filter(c => Planning.quarterOf(c) === selectedQuarter); }
const notice = document.getElementById("notice");
let noticeTimer = null;
function dismissNotice() {
  clearTimeout(noticeTimer);
  noticeTimer = null;
  notice.hidden = true;
  undoEntries = null;
}
function notify(message, previous = null) {
  clearTimeout(noticeTimer);
  undoEntries = previous;
  document.getElementById("noticeText").textContent = message;
  document.getElementById("undoBtn").hidden = !previous;
  notice.hidden = false;
  // Toujours fermer, même si la souris ou le focus reste sur le message.
  noticeTimer = setTimeout(dismissNotice, 5000);
}
function snapshot() { return structuredClone(state.entries); }
function openAttendance(entry = null, defaults = {}) {
  editingId = entry?.id ?? null;
  document.getElementById("attendanceForm").reset();
  document.getElementById("attendanceTitle").textContent = entry ? "Modifier la séance" : "Encoder une séance";
  document.getElementById("dateInput").value = entry?.date ?? defaults.date ?? todayIso();
  document.getElementById("courseSelect").value = entry?.courseId ?? defaults.courseId ?? visibleCourses()[0]?.id ?? state.courses[0]?.id;
  document.getElementById("noteInput").value = entry?.note ?? "";
  if (entry) document.querySelector(`input[name="status"][value="${entry.status}"]`).checked = true;
  document.getElementById("attendanceDialog").showModal();
}
function quickAttendance(courseId, status) {
  const date = todayIso();
  const existing = state.entries.find(e => e.courseId === courseId && e.date === date);
  if (existing && !confirm("Une séance existe déjà aujourd’hui. Remplacer son statut ?")) return;
  const previous = snapshot();
  state.entries = state.entries.filter(e => !(e.courseId === courseId && e.date === date));
  state.entries.push({ id: existing?.id ?? crypto.randomUUID(), courseId, date, status, note: existing?.note ?? "", createdAt: existing?.createdAt ?? new Date().toISOString() });
  saveState(); render();
  notify(`${statusLabels[status]} · ${state.courses.find(c => c.id === courseId).name} · ${formatDate(date)}`, previous);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return { courses: structuredClone(DEFAULT_COURSES), entries: [], dark: false, calendar: Planning.emptyCalendar() };
  }
  try {
    const parsed = JSON.parse(saved);
    let calendar = Planning.emptyCalendar();
    try { if (parsed.calendar) { Planning.validateCalendar(parsed.calendar); Planning.validateExceptions(parsed.calendar, parsed.courses ?? DEFAULT_COURSES); calendar = parsed.calendar; } } catch { /* Préserver les séances si seul le calendrier local est endommagé. */ }
    return {
      courses: Array.isArray(parsed.courses) ? parsed.courses : structuredClone(DEFAULT_COURSES),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      calendar,
      dark: !!parsed.dark
    };
  } catch {
    return { courses: structuredClone(DEFAULT_COURSES), entries: [], dark: false, calendar: Planning.emptyCalendar() };
  }
}


function migrateCourseNames() {
  const canonicalNames = {
    web: "Projet de développement Web",
    os2: "Système d'exploitation",
    ebusiness: "Notions de e-business",
    networks: "Base des réseaux",
    sgbd: "Projet de développement SGBD",
    computers: "Structure des ordinateurs",
    math: "Mathématique appliquée à l'informatique",
    stats: "Éléments de statistiques",
    communication: "Information & communication professionnelle"
  };

  let changed = false;
  state.courses.forEach(course => {
    const correctName = canonicalNames[course.id];
    if (correctName && course.name !== correctName) {
      course.name = correctName;
      changed = true;
    }
  });
  if (changed) saveState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function maxAbsences(totalDays) {
  return Math.floor(totalDays * 0.40);
}

function entriesFor(courseId) {
  return state.entries.filter(e => e.courseId === courseId);
}

function metrics(course) {
  const entries = entriesFor(course.id);
  const present = entries.filter(e => e.status === "present").length;
  const absent = entries.filter(e => e.status === "absent").length;
  const justified = entries.filter(e => e.status === "justified").length;
  const cancelled = entries.filter(e => e.status === "cancelled").length;

  // Une absence justifiée compte comme une présence.
  // "Séances comptabilisées" = présent + absent + justifié.
  // Un cours annulé n'entre ni dans la présence actuelle, ni dans les absences.
  const completed = present + absent + justified;
  const presenceRate = completed ? Math.round(((present + justified) / completed) * 1000) / 10 : 100;
  const limit = maxAbsences(course.totalDays);
  const left = Math.max(0, limit - absent);
  const absenceRateAnnual = course.totalDays ? Math.round((absent / course.totalDays) * 1000) / 10 : 0;

  return { present, absent, justified, cancelled, completed, presenceRate, limit, left, absenceRateAnnual };
}

function riskLabel(m) {
  if (m.absenceRateAnnual >= 40) return ["Limite atteinte", "risk-danger"];
  if (m.absenceRateAnnual >= 30) return ["Danger", "risk-danger"];
  if (m.absenceRateAnnual >= 20) return ["À surveiller", "risk-watch"];
  return ["OK", "risk-ok"];
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(iso + "T12:00:00"));
}

function todayIso() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function render() {
  document.body.classList.toggle("dark", state.dark);
  document.querySelectorAll("[data-quarter]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.quarter === selectedQuarter)));
  const themeButton = document.getElementById("themeBtn");
  themeButton.setAttribute("aria-pressed", String(state.dark));
  themeButton.setAttribute("aria-label", state.dark ? "Activer le thème clair" : "Activer le thème sombre");
  themeButton.innerHTML = state.dark
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 14.2A9 9 0 0 1 9.8 3.2a9 9 0 1 0 11 11Z"/></svg>';
  renderSummary();
  renderToday();
  renderCourses();
  renderHistory();
  renderMissingBadge();
  if (document.getElementById("overviewDialog").open) renderReport();
  if (document.getElementById("missingDialog").open) renderMissing();
  populateCourseSelect();
  if (document.getElementById("weekDialog").open) renderWeek();
  decorateButtons();
  scheduleNavigation();
}

function renderSummary() {
  const all = visibleCourses().map(metrics);
  const totalEntries = all.reduce((s,m) => s + m.completed, 0);
  const totalPresent = all.reduce((s,m) => s + m.present + m.justified, 0);
  const totalAbsent = all.reduce((s,m) => s + m.absent, 0);
  const totalAllowed = visibleCourses().reduce((s,c) => s + maxAbsences(c.totalDays), 0);
  const globalPresence = totalEntries ? Math.round((totalPresent / totalEntries) * 1000) / 10 : 100;

  document.getElementById("summaryGrid").innerHTML = `
    <div class="summary-card"><span>Présence ${selectedQuarter}</span><strong>${totalEntries ? globalPresence + "%" : "—"}</strong></div>
    <div class="summary-card"><span>Absences injustifiées</span><strong>${totalAbsent}</strong></div>
    <div class="summary-card"><span>Maximum d’absences</span><strong>${totalAllowed}</strong></div>
    <div class="summary-card"><span>Séances encodées</span><strong>${totalEntries}</strong></div>
  `;
}

function renderToday() {
  const date = todayIso();
  document.getElementById("todayDate").textContent = `${formatDate(date)} · ${selectedQuarter}`;
  const list = document.getElementById("todayCourses");
  list.replaceChildren();
  const courses = Planning.scheduledCourses(state.courses, state.calendar, selectedQuarter, date);
  if (!courses.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aucun cours prévu ce jour pour ce quadrimestre dans l’horaire renseigné.";
    list.appendChild(empty);
  }
  courses.forEach(course => {
    const entry = state.entries.find(item => item.courseId === course.id && item.date === date);
    const row = document.createElement("article");
    row.className = "today-course";
    const info = document.createElement("div");
    info.className = "today-info";
    const title = document.createElement("h3");
    title.textContent = course.name;
    const status = document.createElement("p");
    status.className = entry ? `status-pill status-${entry.status}` : "muted";
    status.textContent = entry ? statusLabels[entry.status] : "À encoder";
    info.append(title, status);
    const actions = document.createElement("div");
    actions.className = "today-actions";
    if (entry) {
      const edit = document.createElement("button");
      edit.className = "secondary";
      edit.dataset.icon = "edit";
      edit.textContent = "Modifier la séance";
      edit.setAttribute("aria-label", `Modifier la séance : ${course.name}`);
      edit.addEventListener("click", () => openAttendance(entry));
      actions.appendChild(edit);
    } else {
      for (const value of ["present", "absent"]) {
        const button = document.createElement("button");
        button.className = value === "present" ? "primary" : "secondary";
        button.textContent = statusLabels[value];
        button.dataset.icon = value === "present" ? "check" : "close";
        button.setAttribute("aria-label", `${statusLabels[value]} : ${course.name}`);
        button.addEventListener("click", () => quickAttendance(course.id, value));
        actions.appendChild(button);
      }
    }
    row.append(info, actions);
    list.appendChild(row);
  });
}

function renderCourses() {
  const grid = document.getElementById("coursesGrid");
  const template = document.getElementById("courseRowTemplate");
  grid.innerHTML = "";

  const available = visibleCourses();
  const scheduledToday = new Set(Planning.scheduledCourses(state.courses, state.calendar, selectedQuarter, todayIso()).map(course => course.id));
  const courses = courseSort ? Planning.sortReport(available.map(course => { const m = metrics(course); return { ...course, ...m, presenceRate: m.completed ? m.presenceRate : null }; }), courseSort.key, courseSort.direction) : available;
  document.getElementById("coursesHeading").textContent = `Mes cours (${available.length})`;
  document.getElementById("coursesCaption").textContent = `Cours du ${selectedQuarter}`;
  document.querySelectorAll("[data-course-sort-header]").forEach(header => header.setAttribute("aria-sort", header.dataset.courseSortHeader === courseSort?.key ? (courseSort.direction === "asc" ? "ascending" : "descending") : "none"));
  courses.forEach(course => {
    const node = template.content.cloneNode(true);
    const m = metrics(course);
    const [label, cls] = riskLabel(m);

    node.querySelector(".course-day").textContent = course.day || "Jours à définir";
    node.querySelector(".course-name").textContent = course.name;
    node.querySelector(".presence-rate").textContent = m.completed ? `${m.presenceRate}%` : "—";
    node.querySelector(".absence-count").textContent = m.absent;
    node.querySelector(".absence-limit").textContent = m.limit;
    node.querySelector(".absence-left").textContent = m.left;

    const todayEntry = state.entries.find(e => e.courseId === course.id && e.date === todayIso());
    const row = node.querySelector(".course-row");
    row.dataset.courseRow = course.id;
    row.classList.toggle("is-scheduled-today", scheduledToday.has(course.id));
    node.querySelector(".course-today-marker").hidden = !scheduledToday.has(course.id);
    if (todayEntry) {
      const status = node.querySelector(".row-today-status");
      status.hidden = false;
      status.className += ` status-${todayEntry.status}`;
      status.textContent = `${statusLabels[todayEntry.status]} aujourd’hui`;
      node.querySelector(".quick-present").remove(); node.querySelector(".quick-absent").remove();
      const edit = document.createElement("button"); edit.className = "secondary today-edit"; edit.dataset.icon = "edit";
      edit.textContent = "Modifier";
      edit.addEventListener("click", () => openAttendance(todayEntry));
      node.querySelector(".row-actions").prepend(edit);
    } else {
      node.querySelector(".quick-present").addEventListener("click", () => quickAttendance(course.id, "present"));
      node.querySelector(".quick-absent").addEventListener("click", () => quickAttendance(course.id, "absent"));
    }
    node.querySelectorAll("button").forEach(button => {
      const action = button.matches(".quick-present, .quick-absent") ? `${button.textContent} aujourd’hui` : button.matches(".today-edit") ? "Modifier la séance d’aujourd’hui" : "Voir le détail";
      button.setAttribute("aria-label", `${action} : ${course.name}`);
      button.title = `${action} : ${course.name}`;
    });
    const badge = node.querySelector(".risk-badge");
    badge.textContent = label;
    badge.classList.add(cls);

    node.querySelector(".details-btn").addEventListener("click", () => showDetails(course.id));
    grid.appendChild(node);
  });
  decorateButtons(grid);
}

function renderHistory() {
  document.getElementById("clearHistoryBtn").hidden = !state.entries.length;
  const list = document.getElementById("historyList");
  const courseFilter = document.getElementById("historyCourse").value;
  const statusFilter = document.getElementById("historyStatus").value;
  const dateFilter = document.getElementById("historyDate").value;
  const entries = state.entries.filter(e => (!courseFilter || e.courseId === courseFilter) && (!statusFilter || e.status === statusFilter) && (!dateFilter || e.date === dateFilter)).sort((a,b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

  visibleHistoryIds = entries.map(e => e.id);
  for (const id of historySelection) if (!visibleHistoryIds.includes(id)) historySelection.delete(id);
  updateHistorySelection();
  if (!entries.length) {
    list.innerHTML = state.entries.length
      ? '<div class="empty"><p>Aucune séance pour ces filtres.</p></div>'
      : '<div class="empty empty-history"><svg viewBox="0 0 96 96" aria-hidden="true"><use href="logo.svg?v=19#presence"/></svg><p>Aucune séance pour le moment</p></div>';
    return;
  }

  list.innerHTML = entries.map(e => {
    const course = state.courses.find(c => c.id === e.courseId);
    return `
      <div class="history-item">
        <span class="history-date history-select"><input type="checkbox" data-history-select="${escapeHtml(e.id)}" aria-label="Sélectionner ${escapeHtml(course?.name ?? "Cours")} du ${escapeHtml(formatDate(e.date))}" ${historySelection.has(e.id) ? "checked" : ""}>${formatDate(e.date)}</span>
        <div>
          <div class="history-course">${escapeHtml(course?.name ?? "Cours supprimé")}</div>
          ${e.note ? `<div class="muted">${escapeHtml(e.note)}</div>` : ""}
        </div>
        <span class="status-pill status-${e.status}">${statusLabels[e.status]}</span>
        <div class="history-actions"><button class="secondary" data-icon="edit" data-edit="${escapeHtml(e.id)}">Modifier</button><button class="delete-btn" data-delete="${escapeHtml(e.id)}">Supprimer</button></div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => openAttendance(state.entries.find(e => e.id === btn.dataset.edit))));
  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      const previous = snapshot();
      state.entries = state.entries.filter(e => e.id !== btn.dataset.delete);
      saveState();
      render();
      notify("Séance supprimée.", previous);
    });
  });
  decorateButtons(list);
}

function populateCourseSelect() {
  const select = document.getElementById("courseSelect");
  select.innerHTML = state.courses.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  const filter = document.getElementById("historyCourse");
  const value = filter.value;
  filter.innerHTML = '<option value="">Tous les cours</option>' + select.innerHTML;
  filter.value = value;
}

function showDetails(courseId) {
  detailsCourseId = courseId;
  document.getElementById("detailsStart").value = "";
  document.getElementById("detailsEnd").value = "";
  renderDetails();
  document.getElementById("detailsDialog").showModal();
}

function renderDetails() {
  const start = document.getElementById("detailsStart").value;
  const end = document.getElementById("detailsEnd").value;
  const error = document.getElementById("detailsError");
  error.textContent = start && end && start > end ? "La date de fin doit suivre la date de début." : "";
  const course = state.courses.find(c => c.id === detailsCourseId);
  document.getElementById("detailsTitle").textContent = course.name;
  if (error.textContent) { document.getElementById("detailsContent").replaceChildren(); return; }
  const list = Planning.inPeriod(entriesFor(course.id), start, end).sort((a,b) => b.date.localeCompare(a.date));
  const summary = Planning.statistics(list);
  const annual = metrics(course);
  document.getElementById("detailsContent").innerHTML = `
    <div class="detail-stats period-stats">
      ${Object.entries(statusLabels).map(([key, label]) => `<div class="detail-stat"><span>${label}</span><strong data-stat="${key}">${summary[key]}</strong></div>`).join("")}
      <div class="detail-stat"><span>Présence sur la période</span><strong data-stat="rate">${summary.presenceRate === null ? "—" : summary.presenceRate + "%"}</strong></div>
    </div>
    <p class="muted">Quota du cours entier : ${annual.absent} absence(s) injustifiée(s) sur ${annual.limit} maximum · ${annual.left} restante(s).</p>
    <div class="detail-history">
      ${list.length ? list.map(e => `
        <div class="history-item">
          <span class="history-date">${formatDate(e.date)}</span>
          <span>${e.note ? escapeHtml(e.note) : "—"}</span>
          <span class="status-pill status-${e.status}">${statusLabels[e.status]}</span>
        </div>
      `).join("") : `<div class="empty">Aucune séance sur cette période.</div>`}
    </div>`;
}

function holidayRow(holiday = { label: "", start: "", end: "" }) {
  const row = document.createElement("div");
  row.className = "holiday-row";
  row.innerHTML = `<label>Libellé<input type="text" maxlength="80" data-holiday-label value="${escapeHtml(holiday.label)}" placeholder="Congé"></label>
    <label>Du<input type="date" data-holiday-start required value="${escapeHtml(holiday.start)}"></label>
    <label>Au<input type="date" data-holiday-end required value="${escapeHtml(holiday.end)}"></label>
    <button class="secondary" type="button" aria-label="Supprimer ce congé">Supprimer</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  return row;
}

function openCourseSettings() {
  const wrap = document.getElementById("courseSettingsList");
  wrap.innerHTML = state.courses.map(c => `
    <fieldset class="course-setting" data-course="${escapeHtml(c.id)}">
      <legend>${escapeHtml(c.name)}</legend>
      <div class="settings-controls">
        <label>Quadrimestre<select data-course-quarter><option value="Q1" ${Planning.quarterOf(c) === "Q1" ? "selected" : ""}>Q1</option><option value="Q2" ${Planning.quarterOf(c) === "Q2" ? "selected" : ""}>Q2</option></select></label>
        <label>Séances prévues<input type="number" min="1" max="100" step="1" required value="${c.totalDays}" data-course-days></label>
      </div>
      <div class="weekday-options" role="group" aria-label="Jours de ${escapeHtml(c.name)}">${Planning.DAYS.slice(1).concat(Planning.DAYS[0]).map(day => `<label><input type="checkbox" data-weekday value="${day}" ${c.day.split("/").some(value => value.trim().toLowerCase() === day.toLowerCase()) ? "checked" : ""}>${day}</label>`).join("")}</div>
    </fieldset>`).join("");
  for (const key of ["Q1", "Q2"]) {
    document.getElementById(`${key}Start`).value = state.calendar.quarters[key].start;
    document.getElementById(`${key}End`).value = state.calendar.quarters[key].end;
  }
  const holidays = document.getElementById("holidayList");
  holidays.replaceChildren(...state.calendar.holidays.map(holidayRow));
  document.getElementById("settingsError").textContent = "";
  const picker = document.getElementById("settingsCoursePicker");
  picker.innerHTML = state.courses.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  showCourseSettings();
  activateSettingsTab("courses");
  document.getElementById("courseDialog").showModal();
}

function activateSettingsTab(key, focus = false) {
  document.querySelectorAll("[data-settings-tab]").forEach(tab => {
    const selected = tab.dataset.settingsTab === key;
    tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
    document.getElementById(`settings-${tab.dataset.settingsTab}`).hidden = !selected;
    if (selected && focus) tab.focus();
  });
}
function showCourseSettings() {
  const value = document.getElementById("settingsCoursePicker").value;
  document.querySelectorAll("[data-course]").forEach(row => { row.hidden = row.dataset.course !== value; });
}
function revealSettingsInput(input) {
  const panel = input.closest('[role="tabpanel"]');
  if (panel) activateSettingsTab(panel.id.replace("settings-", ""));
  const course = input.closest("[data-course]");
  if (course) { document.getElementById("settingsCoursePicker").value = course.dataset.course; showCourseSettings(); }
}
function renderWeek() {
  const anchor = new Date(todayIso() + "T12:00:00Z"); anchor.setUTCDate(anchor.getUTCDate() + weekOffset * 7);
  const dates = Planning.weekDates(anchor.toISOString().slice(0,10));
  document.getElementById("weekTitle").textContent = `Aperçu de la semaine · ${selectedQuarter}`;
  document.getElementById("weekRange").textContent = `${formatDate(dates[0])} – ${formatDate(dates[4])}`;
  const grid = document.getElementById("weekDays"); grid.replaceChildren();
  for (const date of dates) {
    const column = document.createElement("section"); column.className = "week-day";
    if (date === todayIso()) column.classList.add("is-today");
    const heading = document.createElement("h3");
    const time = document.createElement("time"); time.dateTime = date;
    time.textContent = new Intl.DateTimeFormat("fr-BE", {weekday:"long",day:"numeric",month:"short"}).format(new Date(date + "T12:00:00Z"));
    heading.appendChild(time); column.appendChild(heading);
    const courses = Planning.scheduledCourses(state.courses, state.calendar, selectedQuarter, date);
    for (const course of courses) {
      const card = document.createElement("article"); card.className = "week-course";
      const name = document.createElement("h4"); name.textContent = course.name; card.appendChild(name);
      const entry = state.entries.find(e => e.courseId === course.id && e.date === date);
      const status = document.createElement("p"); status.className = entry ? `status-pill status-${entry.status}` : "muted";
      status.textContent = entry ? statusLabels[entry.status] : date > todayIso() ? "À venir" : "À encoder"; card.appendChild(status);
      const moved = (state.calendar.exceptions ?? []).find(e => e.courseId === course.id && e.action === "move" && e.targetDate === date);
      if (moved) { const note = document.createElement("p"); note.className = "week-note"; note.textContent = `Déplacé du ${formatDate(moved.date)}`; card.appendChild(note); }
      column.appendChild(card);
    }
    for (const change of state.calendar.exceptions ?? []) {
      const course = state.courses.find(c => c.id === change.courseId);
      if (change.date !== date || Planning.quarterOf(course) !== selectedQuarter) continue;
      const card = document.createElement("article"); card.className = "week-course week-changed";
      const name = document.createElement("h4"); name.textContent = course.name;
      const note = document.createElement("p"); note.textContent = change.action === "cancel" ? "Annulé au planning" : `Déplacé au ${formatDate(change.targetDate)}`;
      card.append(name,note); column.appendChild(card);
    }
    if (column.children.length === 1) { const empty = document.createElement("p"); empty.className="muted"; empty.textContent="Aucun cours prévu"; column.appendChild(empty); }
    grid.appendChild(column);
  }
}

function renderBatch() {
  const date = document.getElementById("batchDate").value;
  const planned = new Set(Planning.scheduledCourses(state.courses, state.calendar, selectedQuarter, date).map(c => c.id));
  document.getElementById("batchError").textContent = "";
  document.getElementById("batchRows").innerHTML = visibleCourses().map(course => {
    const entry = state.entries.find(e => e.courseId === course.id && e.date === date);
    return `<tr data-batch-course="${escapeHtml(course.id)}">
      <td><input type="checkbox" data-batch-include aria-label="Inclure ${escapeHtml(course.name)}" ${planned.has(course.id) && !entry ? "checked" : ""}></td>
      <th scope="row">${escapeHtml(course.name)}<small>${entry ? "Déjà encodé" : planned.has(course.id) ? "Prévu" : "Non prévu"}</small></th>
      <td><select data-batch-status aria-label="Statut de ${escapeHtml(course.name)}">${Object.entries(statusLabels).map(([value,label]) => `<option value="${value}" ${(entry?.status ?? "present") === value ? "selected" : ""}>${label}</option>`).join("")}</select></td>
      <td><input data-batch-note type="text" maxlength="120" aria-label="Note pour ${escapeHtml(course.name)}" value="${escapeHtml(entry?.note ?? "")}"></td>
    </tr>`;
  }).join("");
  updateBatchCount();
}
function updateBatchCount() {
  const count = document.querySelectorAll("[data-batch-include]:checked").length;
  document.getElementById("batchSave").textContent = `Enregistrer (${count})`;
  document.getElementById("batchSave").disabled = !count;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[ch]));
}


function reportData() {
  return Planning.sortReport(Planning.courseReport(visibleCourses(), state.entries), reportSort.key, reportSort.direction);
}
function reportTable(rows) {
  return rows.map(row => `<tr><th scope="row">${escapeHtml(row.name)}</th>${[row.present, row.justified, row.absent, row.cancelled, row.presenceRate === null ? "—" : row.presenceRate + "%", row.limit, row.left].map(value => `<td>${value}</td>`).join("")}</tr>`).join("");
}
function renderReport() {
  document.getElementById("overviewTitle").textContent = `Tableau de bord · ${selectedQuarter}`;
  document.getElementById("reportCaption").textContent = `Bilan des cours · ${selectedQuarter}`;
  document.getElementById("reportRows").innerHTML = reportTable(reportData());
  document.querySelectorAll("[data-sort-header]").forEach(header => {
    header.setAttribute("aria-sort", header.dataset.sortHeader === reportSort.key ? (reportSort.direction === "asc" ? "ascending" : "descending") : "none");
  });
}
function downloadText(contents, type, filename) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function missingDefaults() {
  const yesterday = new Date(todayIso() + "T12:00:00Z"); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const end = yesterday.toISOString().slice(0, 10);
  const startDate = new Date(end + "T12:00:00Z"); startDate.setUTCDate(startDate.getUTCDate() - 29);
  const recent = startDate.toISOString().slice(0, 10);
  const quarterStart = state.calendar.quarters[selectedQuarter].start;
  return { start: quarterStart && quarterStart > recent ? quarterStart : recent, end };
}
function renderMissingBadge() {
  const range = missingDefaults();
  const count = range.start <= range.end ? Planning.missingSessions(state.courses, state.calendar, selectedQuarter, state.entries, range.start, range.end, todayIso()).length : 0;
  document.getElementById("missingBtn").textContent = count ? `Séances à vérifier (${count})` : "Séances à vérifier";
}
function renderMissing() {
  const list = document.getElementById("missingList");
  list.replaceChildren();
  document.getElementById("missingError").textContent = "";
  let sessions;
  try { sessions = Planning.missingSessions(state.courses, state.calendar, selectedQuarter, state.entries, document.getElementById("missingStart").value, document.getElementById("missingEnd").value, todayIso()); }
  catch (error) { document.getElementById("missingError").textContent = error.message; return; }
  if (!sessions.length) { list.innerHTML = '<p class="muted">Aucune séance non encodée sur cette période.</p>'; return; }
  sessions.forEach(session => {
    const course = state.courses.find(c => c.id === session.courseId);
    const row = document.createElement("div"); row.className = "missing-row";
    const label = document.createElement("span"); label.textContent = `${formatDate(session.date)} · ${course.name}`;
    const button = document.createElement("button"); button.className = "secondary"; button.textContent = "Encoder";
    button.setAttribute("aria-label", `Encoder ${course.name} du ${formatDate(session.date)}`);
    button.addEventListener("click", () => { document.getElementById("missingDialog").close(); openAttendance(null, session); });
    row.append(label, button); list.appendChild(row);
  });
}
function renderExceptions() {
  const list = document.getElementById("exceptionsList"); list.replaceChildren();
  const exceptions = state.calendar.exceptions ?? [];
  if (!exceptions.length) list.innerHTML = '<p class="muted">Aucun changement enregistré.</p>';
  [...exceptions].sort((a,b) => a.date.localeCompare(b.date)).forEach(item => {
    const row = document.createElement("div"); row.className = "exception-row";
    const label = document.createElement("span");
    label.textContent = `${state.courses.find(c => c.id === item.courseId).name} · ${formatDate(item.date)} · ${item.action === "cancel" ? "Annulé" : "Déplacé au " + formatDate(item.targetDate)}`;
    const button = document.createElement("button"); button.className = "secondary"; button.textContent = "Retirer";
    button.setAttribute("aria-label", `Retirer le changement : ${label.textContent}`);
    button.addEventListener("click", () => {
      const previous = structuredClone(state.calendar);
      state.calendar.exceptions = exceptions.filter(e => e !== item); saveState(); render(); renderExceptions();
      notify("Changement retiré du planning.", { calendar: previous });
    });
    row.append(label, button); list.appendChild(row);
  });
}
function updateHistorySelection() {
  const count = historySelection.size;
  document.getElementById("bulkEditBtn").textContent = `Corriger la sélection (${count})`;
  document.getElementById("bulkEditBtn").disabled = !count;
  document.getElementById("bulkEditBtn").hidden = !count;
  document.getElementById("historySelectionBar").hidden = !visibleHistoryIds.length;
  document.getElementById("historySelectionBar").classList.toggle("has-selection", !!count);
  decorateButtons(document.getElementById("historySelectionBar"));
  const all = document.getElementById("selectHistory");
  all.disabled = !visibleHistoryIds.length;
  all.checked = !!count && count === visibleHistoryIds.length;
  all.indeterminate = !!count && count < visibleHistoryIds.length;
}

document.getElementById("scheduleBtn").addEventListener("click", () => {
  document.getElementById("scheduleDialog").showModal();
});

document.getElementById("closeScheduleBtn").addEventListener("click", () => {
  document.getElementById("scheduleDialog").close();
});

document.getElementById("addAttendanceBtn").addEventListener("click", () => openAttendance());

document.getElementById("closeAttendanceBtn").addEventListener("click", () => {
  document.getElementById("attendanceDialog").close();
});

document.getElementById("cancelAttendanceBtn").addEventListener("click", () => {
  document.getElementById("attendanceDialog").close();
});

document.getElementById("attendanceForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const form = new FormData(ev.currentTarget);
  const status = form.get("status");
  if (!status) return;

  const courseId = document.getElementById("courseSelect").value;
  const date = document.getElementById("dateInput").value;
  const note = document.getElementById("noteInput").value.trim();

  const collision = state.entries.find(e => e.courseId === courseId && e.date === date && e.id !== editingId);
  if (collision && !confirm("Une séance existe déjà à cette date pour ce cours. La remplacer ?")) return;
  const previous = snapshot();
  // Une seule entrée par cours et par date : si elle existe, on la remplace.
  state.entries = state.entries.filter(e => e.id !== editingId && !(e.courseId === courseId && e.date === date));
  state.entries.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    courseId, date, status, note,
    createdAt: new Date().toISOString()
  });

  saveState();
  document.getElementById("attendanceDialog").close();
  render();
  notify("Séance enregistrée.", previous);
});

document.getElementById("settingsBtn").addEventListener("click", openCourseSettings);
document.getElementById("closeCourseBtn").addEventListener("click", () => document.getElementById("courseDialog").close());
document.getElementById("cancelCourseBtn").addEventListener("click", () => document.getElementById("courseDialog").close());

document.getElementById("courseForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const invalid = [...ev.currentTarget.elements].find(input => input.willValidate && !input.checkValidity());
  if (invalid) { revealSettingsInput(invalid); invalid.reportValidity(); return; }
  const calendar = { quarters: {}, holidays: [], exceptions: structuredClone(state.calendar.exceptions ?? []) };
  for (const key of ["Q1", "Q2"]) calendar.quarters[key] = { start: document.getElementById(`${key}Start`).value, end: document.getElementById(`${key}End`).value };
  calendar.holidays = [...document.querySelectorAll(".holiday-row")].map(row => ({ label: row.querySelector("[data-holiday-label]").value.trim(), start: row.querySelector("[data-holiday-start]").value, end: row.querySelector("[data-holiday-end]").value }));
  try { Planning.validateCalendar({ ...calendar, holidays: [] }); }
  catch (error) { activateSettingsTab("quarters"); document.getElementById("settingsError").textContent = error.message; return; }
  try { Planning.validateCalendar(calendar); }
  catch (error) { activateSettingsTab("holidays"); document.getElementById("settingsError").textContent = error.message; return; }
  const courses = state.courses.map(course => {
    const row = [...document.querySelectorAll("[data-course]")].find(row => row.dataset.course === course.id);
    return { ...course, quarter: row.querySelector("[data-course-quarter]").value, totalDays: Number(row.querySelector("[data-course-days]").value), day: [...row.querySelectorAll("[data-weekday]:checked")].map(input => input.value).join(" / ") };
  });
  try { Planning.validateExceptions(calendar, courses); }
  catch (error) { document.getElementById("settingsError").textContent = "Vérifiez les changements ponctuels : " + error.message; return; }
  state.calendar = calendar;
  state.courses = courses;
  saveState();
  document.getElementById("courseDialog").close();
  render();
  notify("Horaire enregistré.");
});

document.getElementById("closeDetailsBtn").addEventListener("click", () => document.getElementById("detailsDialog").close());

document.getElementById("themeBtn").addEventListener("click", () => {
  state.dark = !state.dark;
  localStorage.setItem("presenceCours.theme", state.dark ? "dark" : "light");
  saveState();
  render();
});

document.getElementById("clearHistoryBtn").addEventListener("click", () => {
  if (confirm("Effacer toutes les séances ? Vous pourrez annuler immédiatement cette action.")) {
    const previous = snapshot();
    state.entries = [];
    saveState();
    render();
    notify("Historique effacé.", previous);
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `presence-cours-backup-${todayIso()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  render();
  notify("Sauvegarde exportée. Conservez le fichier dans un endroit sûr.");
});

document.getElementById("importInput").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.courses) || !parsed.courses.length || !Array.isArray(parsed.entries)) throw new Error();
    const ids = new Set();
    for (const c of parsed.courses) {
      if (typeof c.id !== "string" || ids.has(c.id) || !DEFAULT_COURSES.some(d => d.id === c.id) || typeof c.name !== "string" || typeof c.day !== "string" || !Number.isInteger(c.totalDays) || c.totalDays < 1 || c.totalDays > 100) throw new Error();
      if (c.quarter !== undefined && !["Q1", "Q2"].includes(c.quarter)) throw new Error();
      ids.add(c.id);
    }
    const entryIds = new Set(), sessions = new Set();
    for (const e of parsed.entries) {
      const session = `${e.courseId}/${e.date}`;
      if (typeof e.id !== "string" || entryIds.has(e.id) || sessions.has(session) || !ids.has(e.courseId) || !Object.hasOwn(statusLabels, e.status) || typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0,10) !== e.date || typeof e.note !== "string" || typeof e.createdAt !== "string") throw new Error();
      entryIds.add(e.id); sessions.add(session);
    }
    const calendar = parsed.calendar ? Planning.validateCalendar(parsed.calendar) : Planning.emptyCalendar();
    Planning.validateExceptions(calendar, parsed.courses);
    if (!confirm("Importer cette sauvegarde remplacera les cours et l’historique actuels. Continuer ?")) { ev.target.value = ""; return; }
    state = { courses: parsed.courses, entries: parsed.entries, dark: !!parsed.dark, calendar };
    localStorage.setItem("presenceCours.theme", state.dark ? "dark" : "light");
    saveState();
    document.getElementById("resetFilters").click();
    render();
    notify("Sauvegarde importée. Les données précédentes ont été remplacées.");
  } catch {
    alert("Fichier de sauvegarde invalide.");
  }
  ev.target.value = "";
});

document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importInput").click());
document.querySelectorAll("[data-quarter]").forEach(button => button.addEventListener("click", () => {
  selectedQuarter = button.dataset.quarter;
  localStorage.setItem("presenceCours.quarter", selectedQuarter);
  render();
}));
for (const id of ["historyCourse", "historyStatus", "historyDate"]) document.getElementById(id).addEventListener("change", () => { historySelection.clear(); renderHistory(); });
document.getElementById("resetFilters").addEventListener("click", () => {
  historySelection.clear();
  for (const id of ["historyCourse", "historyStatus", "historyDate"]) document.getElementById(id).value = "";
  renderHistory();
});
document.getElementById("undoBtn").addEventListener("click", () => {
  if (!undoEntries) return;
  if (Array.isArray(undoEntries)) state.entries = undoEntries;
  else if (undoEntries.calendar) state.calendar = undoEntries.calendar;
  saveState(); render();
  if (document.getElementById("exceptionsDialog").open) renderExceptions();
  notify("Modification annulée.");
});
document.getElementById("dismissNotice").addEventListener("click", dismissNotice);
document.getElementById("addHolidayBtn").addEventListener("click", () => {
  const row = holidayRow(); document.getElementById("holidayList").appendChild(row); row.querySelector("input").focus();
});
for (const id of ["detailsStart", "detailsEnd"]) document.getElementById(id).addEventListener("change", renderDetails);
document.getElementById("resetPeriod").addEventListener("click", () => {
  document.getElementById("detailsStart").value = ""; document.getElementById("detailsEnd").value = ""; renderDetails();
});
document.getElementById("batchBtn").addEventListener("click", () => {
  document.getElementById("batchDate").value = todayIso();
  document.getElementById("batchQuarter").textContent = selectedQuarter;
  renderBatch(); document.getElementById("batchDialog").showModal();
});
document.getElementById("closeBatchBtn").addEventListener("click", () => document.getElementById("batchDialog").close());
document.getElementById("cancelBatchBtn").addEventListener("click", () => document.getElementById("batchDialog").close());
document.getElementById("batchDate").addEventListener("change", renderBatch);
document.getElementById("batchRows").addEventListener("change", updateBatchCount);
document.getElementById("batchForm").addEventListener("submit", event => {
  event.preventDefault();
  const date = document.getElementById("batchDate").value;
  const rows = [...document.querySelectorAll("[data-batch-course]")].filter(row => row.querySelector("[data-batch-include]").checked).map(row => ({ courseId: row.dataset.batchCourse, status: row.querySelector("[data-batch-status]").value, note: row.querySelector("[data-batch-note]").value.trim() }));
  const previous = snapshot();
  let next;
  try { next = Planning.applyBatch(state.entries, date, rows, state.courses, () => crypto.randomUUID(), new Date().toISOString()); }
  catch (error) { document.getElementById("batchError").textContent = error.message; return; }
  const replacements = rows.filter(row => state.entries.some(e => e.courseId === row.courseId && e.date === date)).length;
  if (replacements && !confirm(`${replacements} séance(s) déjà encodée(s) seront remplacées. Continuer ?`)) return;
  state.entries = next; saveState(); render();
  document.getElementById("batchDialog").close();
  notify(`${rows.length} séance(s) enregistrée(s).`, previous);
});
document.querySelectorAll("[data-close]").forEach(button => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
document.getElementById("overviewBtn").addEventListener("click", () => { renderReport(); document.getElementById("overviewDialog").showModal(); });
document.querySelectorAll("[data-course-sort]").forEach(button => button.addEventListener("click", () => {
  const key = button.dataset.courseSort;
  courseSort = { key, direction: courseSort?.key === key && courseSort.direction === "asc" ? "desc" : "asc" };
  renderCourses();
}));
document.querySelectorAll("[data-sort]").forEach(button => button.addEventListener("click", () => {
  const key = button.dataset.sort;
  reportSort = { key, direction: key === reportSort.key && reportSort.direction === "asc" ? "desc" : "asc" }; renderReport();
}));
document.getElementById("csvSummaryBtn").addEventListener("click", () => {
  const rows = [["Cours", "Quadrimestre", "Présences", "Justifiées", "Injustifiées", "Annulées", "Taux de présence (%)", "Maximum d’absences", "Absences restantes"], ...reportData().map(row => [row.name, selectedQuarter, row.present, row.justified, row.absent, row.cancelled, row.presenceRate === null ? "" : String(row.presenceRate).replace(".", ","), row.limit, row.left])];
  downloadText(Planning.toCsv(rows), "text/csv;charset=utf-8", `bilan-${selectedQuarter}-${todayIso()}.csv`);
});
document.getElementById("csvHistoryBtn").addEventListener("click", () => {
  const courses = visibleCourses();
  const entries = state.entries.filter(e => courses.some(c => c.id === e.courseId)).sort((a,b) => a.date.localeCompare(b.date));
  const rows = [["Date", "Cours", "Statut", "Note"], ...entries.map(e => [e.date, courses.find(c => c.id === e.courseId).name, statusLabels[e.status], e.note])];
  downloadText(Planning.toCsv(rows), "text/csv;charset=utf-8", `seances-${selectedQuarter}-${todayIso()}.csv`);
});
document.getElementById("printReportBtn").addEventListener("click", () => {
  const report = document.getElementById("printReport");
  report.innerHTML = `<h1>Watchling · ${selectedQuarter}</h1><p>Bilan au ${formatDate(todayIso())}</p><table><thead><tr>${["Cours", "Présences", "Justifiées", "Injustifiées", "Annulées", "Taux", "Maximum", "Restantes"].map(label => `<th scope="col">${label}</th>`).join("")}</tr></thead><tbody>${reportTable(reportData())}</tbody></table>`;
  window.print();
});
document.getElementById("missingBtn").addEventListener("click", () => {
  const range = missingDefaults();
  document.getElementById("missingStart").value = range.start > range.end ? range.end : range.start;
  document.getElementById("missingEnd").value = range.end;
  renderMissing(); document.getElementById("missingDialog").showModal();
});
for (const id of ["missingStart", "missingEnd"]) document.getElementById(id).addEventListener("change", renderMissing);
document.getElementById("exceptionsBtn").addEventListener("click", () => {
  document.getElementById("exceptionForm").reset();
  document.getElementById("exceptionCourse").innerHTML = state.courses.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
  document.getElementById("exceptionDate").value = todayIso();
  document.getElementById("exceptionTargetLabel").hidden = true; document.getElementById("exceptionTarget").required = false;
  document.getElementById("exceptionError").textContent = "";
  renderExceptions(); document.getElementById("exceptionsDialog").showModal();
});
document.getElementById("exceptionAction").addEventListener("change", event => {
  const move = event.target.value === "move";
  document.getElementById("exceptionTargetLabel").hidden = !move;
  document.getElementById("exceptionTarget").required = move;
});
document.getElementById("exceptionForm").addEventListener("submit", event => {
  event.preventDefault();
  const item = { courseId: document.getElementById("exceptionCourse").value, date: document.getElementById("exceptionDate").value, action: document.getElementById("exceptionAction").value, targetDate: document.getElementById("exceptionTarget").value };
  const previous = structuredClone(state.calendar);
  const calendar = structuredClone(state.calendar);
  calendar.exceptions = [...(calendar.exceptions ?? []).filter(e => !(e.courseId === item.courseId && e.date === item.date)), item];
  try { Planning.validateExceptions(calendar, state.courses); }
  catch (error) { document.getElementById("exceptionError").textContent = error.message; return; }
  state.calendar = calendar; saveState(); render(); renderExceptions();
  document.getElementById("exceptionError").textContent = "";
  notify("Changement enregistré dans le planning.", { calendar: previous });
});
document.getElementById("historyList").addEventListener("change", event => {
  const id = event.target.dataset.historySelect; if (!id) return;
  if (event.target.checked) historySelection.add(id); else historySelection.delete(id);
  updateHistorySelection();
});
document.getElementById("selectHistory").addEventListener("change", event => {
  historySelection.clear(); if (event.target.checked) visibleHistoryIds.forEach(id => historySelection.add(id)); renderHistory();
});
document.getElementById("bulkEditBtn").addEventListener("click", () => {
  document.getElementById("bulkEditForm").reset(); document.getElementById("bulkNoteLabel").hidden = true;
  document.getElementById("bulkError").textContent = "";
  document.getElementById("bulkSelection").replaceChildren();
  state.entries.filter(e => historySelection.has(e.id)).forEach(e => {
    const row = document.createElement("p"); row.textContent = `${formatDate(e.date)} · ${state.courses.find(c => c.id === e.courseId)?.name ?? "Cours"} · ${statusLabels[e.status]}`;
    document.getElementById("bulkSelection").appendChild(row);
  });
  document.getElementById("bulkEditDialog").showModal();
});
document.getElementById("bulkReplaceNote").addEventListener("change", event => { document.getElementById("bulkNoteLabel").hidden = !event.target.checked; });
document.getElementById("bulkEditForm").addEventListener("submit", event => {
  event.preventDefault();
  const patch = { status: document.getElementById("bulkStatus").value };
  if (document.getElementById("bulkReplaceNote").checked) patch.note = document.getElementById("bulkNote").value.trim();
  const previous = snapshot();
  let next;
  try { next = Planning.updateEntries(state.entries, [...historySelection], patch); }
  catch (error) { document.getElementById("bulkError").textContent = error.message; return; }
  if (!confirm(`Appliquer « ${statusLabels[patch.status]} » à ${historySelection.size} séance(s) sélectionnée(s) ?`)) return;
  state.entries = next; historySelection.clear(); saveState(); render();
  document.getElementById("bulkEditDialog").close(); notify("Séances corrigées.", previous);
});
document.querySelectorAll("[data-settings-tab]").forEach(tab => {
  tab.addEventListener("click", () => activateSettingsTab(tab.dataset.settingsTab));
  tab.addEventListener("keydown", event => {
    const tabs = [...document.querySelectorAll("[data-settings-tab]")]; const index = tabs.indexOf(tab);
    const target = event.key === "ArrowRight" ? (index+1)%tabs.length : event.key === "ArrowLeft" ? (index+tabs.length-1)%tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length-1 : null;
    if (target !== null) { event.preventDefault(); activateSettingsTab(tabs[target].dataset.settingsTab, true); }
  });
});
document.getElementById("settingsCoursePicker").addEventListener("change", showCourseSettings);
document.getElementById("weekBtn").addEventListener("click", () => { weekOffset=0; renderWeek(); document.getElementById("weekDialog").showModal(); });
document.getElementById("weekPrevious").addEventListener("click", () => { weekOffset--; renderWeek(); });
document.getElementById("weekNext").addEventListener("click", () => { weekOffset++; renderWeek(); });
document.getElementById("weekCurrent").addEventListener("click", () => { weekOffset=0; renderWeek(); });
let navFrame = null;
function updateNavigation() {
  const history = document.getElementById("historyHeading");
  const bottom = window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
  const active = history.getBoundingClientRect().top <= window.innerHeight * .5 || bottom ? "#historyHeading" : "#coursesHeading";
  document.querySelectorAll('.topbar-actions a[href^="#"]').forEach(link => {
    if (link.getAttribute("href") === active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
  });
  document.getElementById("backToTop").hidden = window.scrollY < 200;
  navFrame = null;
}
function scheduleNavigation() { if (navFrame === null) navFrame = requestAnimationFrame(updateNavigation); }
window.addEventListener("scroll", scheduleNavigation, { passive: true });
window.addEventListener("resize", scheduleNavigation);
updateNavigation();
const toolsMenu = document.getElementById("toolsMenu");
const toolsTrigger = toolsMenu.querySelector("summary");
toolsMenu.addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;
  const dialogIds = { batchBtn: "batchDialog", scheduleBtn: "scheduleDialog", settingsBtn: "courseDialog", exceptionsBtn: "exceptionsDialog" };
  if (dialogIds[button.id]) document.getElementById(dialogIds[button.id]).dataset.toolsOrigin = "true";
  toolsMenu.open = false;
  if (!document.querySelector("dialog[open]")) toolsTrigger.focus();
});
document.querySelectorAll("dialog").forEach(dialog => dialog.addEventListener("close", () => {
  if (dialog.dataset.toolsOrigin === "true") {
    delete dialog.dataset.toolsOrigin;
    if (!document.querySelector("dialog[open]")) toolsTrigger.focus();
  }
}));
toolsMenu.addEventListener("keydown", event => {
  if (event.key === "Escape" && toolsMenu.open) { toolsMenu.open = false; toolsTrigger.focus(); event.preventDefault(); event.stopPropagation(); }
});
toolsMenu.addEventListener("focusout", event => { if (event.relatedTarget && !toolsMenu.contains(event.relatedTarget)) toolsMenu.open = false; });
document.addEventListener("pointerdown", event => { if (!toolsMenu.contains(event.target)) toolsMenu.open = false; });
const buttonIcons = { addAttendanceBtn: "plus", batchBtn: "batch", scheduleBtn: "calendar", exportBtn: "download", importBtn: "upload", overviewBtn: "chart", exceptionsBtn: "changes", settingsBtn: "settings", missingBtn: "clock", resetFilters: "reset", bulkEditBtn: "edit", csvSummaryBtn: "download", csvHistoryBtn: "list", printReportBtn: "print", resetPeriod: "reset", addHolidayBtn: "plus", weekBtn: "calendar" };
for (const [id, name] of Object.entries(buttonIcons)) document.getElementById(id).dataset.icon = name;
document.querySelectorAll(".icon-btn:not(#themeBtn), #dismissNotice").forEach(button => { button.innerHTML = iconMarkup("close"); });
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => notify("Le mode hors ligne n’a pas pu être préparé. Réessayez en ligne."));
}
migrateCourseNames();
render();

// Actualiser le jour affiché si l’application reste ouverte pendant la nuit.
let renderedDate = todayIso();
function refreshDay() {
  if (renderedDate !== todayIso()) { renderedDate = todayIso(); render(); }
}
window.addEventListener("focus", refreshDay);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDay(); });
setInterval(refreshDay, 60_000);

// Animer uniquement la silhouette extérieure, devant une silhouette centrale fixe.
const brand = document.querySelector(".brand");
const brandMark = brand.querySelector(".brand-mark");
const logoWatcher = brand.querySelector(".logo-watcher");
let logoAnimation;
function playLogoAnimation() {
  logoAnimation?.cancel();
  // Animation du logo explicitement demandée, y compris en mode de mouvement réduit.
  logoAnimation = logoWatcher.animate([
    { transform: "scale(1)", offset: 0 },
    { transform: "scale(1.34, 1.28)", offset: .35 },
    { transform: "scale(1.34, 1.28)", offset: .7 },
    { transform: "scale(1)", offset: 1 }
  ], { duration: 2000, easing: "ease-in-out", iterations: 1 });
}
brand.addEventListener("pointerenter", playLogoAnimation);
brandMark.addEventListener("focus", playLogoAnimation);
brandMark.addEventListener("click", playLogoAnimation);
