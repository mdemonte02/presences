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
let selectedQuarter = localStorage.getItem("presenceCours.quarter") === "Q2" ? "Q2" : "Q1";
let editingId = null;
let undoEntries = null;
let detailsCourseId = null;
function visibleCourses() { return state.courses.filter(c => Planning.quarterOf(c) === selectedQuarter); }
function notify(message, previous = null) {
  undoEntries = previous;
  document.getElementById("noticeText").textContent = message;
  document.getElementById("undoBtn").hidden = !previous;
  document.getElementById("notice").hidden = false;
}
function snapshot() { return structuredClone(state.entries); }
function openAttendance(entry = null) {
  editingId = entry?.id ?? null;
  document.getElementById("attendanceForm").reset();
  document.getElementById("attendanceTitle").textContent = entry ? "Modifier la séance" : "Encoder une séance";
  document.getElementById("dateInput").value = entry?.date ?? todayIso();
  document.getElementById("courseSelect").value = entry?.courseId ?? visibleCourses()[0]?.id ?? state.courses[0]?.id;
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
    try { if (parsed.calendar) calendar = Planning.validateCalendar(parsed.calendar); } catch { /* Préserver les séances si seul le calendrier local est endommagé. */ }
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
  document.getElementById("themeBtn").setAttribute("aria-pressed", String(state.dark));
  renderSummary();
  renderToday();
  renderCourses();
  renderHistory();
  populateCourseSelect();
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
      edit.textContent = "Modifier la séance";
      edit.setAttribute("aria-label", `Modifier la séance : ${course.name}`);
      edit.addEventListener("click", () => openAttendance(entry));
      actions.appendChild(edit);
    } else {
      for (const value of ["present", "absent"]) {
        const button = document.createElement("button");
        button.className = value === "present" ? "primary" : "secondary";
        button.textContent = statusLabels[value];
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
  const template = document.getElementById("courseCardTemplate");
  grid.innerHTML = "";

  const courses = visibleCourses();
  courses.forEach(course => {
    const node = template.content.cloneNode(true);
    const m = metrics(course);
    const [label, cls] = riskLabel(m);

    node.querySelector(".course-day").textContent = course.day || "Jours à définir";
    node.querySelector(".course-name").textContent = course.name;
    node.querySelector(".presence-rate").textContent = m.completed ? `${m.presenceRate}%` : "—";
    node.querySelector(".progress-fill").style.width = `${m.completed ? Math.max(0, Math.min(100, m.presenceRate)) : 0}%`;
    node.querySelector(".absence-count").textContent = m.absent;
    node.querySelector(".absence-limit").textContent = m.limit;
    node.querySelector(".absence-left").textContent = m.left;

    node.querySelector(".absence-description").textContent = `${m.absent} absence(s) injustifiée(s) sur ${m.limit} maximum`;
    node.querySelector(".quick-present").addEventListener("click", () => quickAttendance(course.id, "present"));
    node.querySelector(".quick-absent").addEventListener("click", () => quickAttendance(course.id, "absent"));
    node.querySelectorAll("button").forEach(button => button.setAttribute("aria-label", `${button.textContent} : ${course.name}`));
    const badge = node.querySelector(".risk-badge");
    badge.textContent = label;
    badge.classList.add(cls);

    node.querySelector(".details-btn").addEventListener("click", () => showDetails(course.id));
    grid.appendChild(node);
  });
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const courseFilter = document.getElementById("historyCourse").value;
  const statusFilter = document.getElementById("historyStatus").value;
  const dateFilter = document.getElementById("historyDate").value;
  const entries = state.entries.filter(e => (!courseFilter || e.courseId === courseFilter) && (!statusFilter || e.status === statusFilter) && (!dateFilter || e.date === dateFilter)).sort((a,b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

  if (!entries.length) {
    list.innerHTML = `<div class="empty">Aucune séance à afficher. Encodez une séance ou ajustez les filtres.</div>`;
    return;
  }

  list.innerHTML = entries.map(e => {
    const course = state.courses.find(c => c.id === e.courseId);
    return `
      <div class="history-item">
        <span class="history-date">${formatDate(e.date)}</span>
        <div>
          <div class="history-course">${escapeHtml(course?.name ?? "Cours supprimé")}</div>
          ${e.note ? `<div class="muted">${escapeHtml(e.note)}</div>` : ""}
        </div>
        <span class="status-pill status-${e.status}">${statusLabels[e.status]}</span>
        <div class="history-actions"><button class="secondary" data-edit="${escapeHtml(e.id)}">Modifier</button><button class="delete-btn" data-delete="${escapeHtml(e.id)}">Supprimer</button></div>
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
  document.getElementById("courseDialog").showModal();
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
  const calendar = { quarters: {}, holidays: [] };
  for (const key of ["Q1", "Q2"]) calendar.quarters[key] = { start: document.getElementById(`${key}Start`).value, end: document.getElementById(`${key}End`).value };
  calendar.holidays = [...document.querySelectorAll(".holiday-row")].map(row => ({ label: row.querySelector("[data-holiday-label]").value.trim(), start: row.querySelector("[data-holiday-start]").value, end: row.querySelector("[data-holiday-end]").value }));
  try { Planning.validateCalendar(calendar); }
  catch (error) { document.getElementById("settingsError").textContent = error.message; return; }
  const courses = state.courses.map(course => {
    const row = [...document.querySelectorAll("[data-course]")].find(row => row.dataset.course === course.id);
    return { ...course, quarter: row.querySelector("[data-course-quarter]").value, totalDays: Number(row.querySelector("[data-course-days]").value), day: [...row.querySelectorAll("[data-weekday]:checked")].map(input => input.value).join(" / ") };
  });
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
    if (!confirm("Importer cette sauvegarde remplacera les cours et l’historique actuels. Continuer ?")) { ev.target.value = ""; return; }
    state = { courses: parsed.courses, entries: parsed.entries, dark: !!parsed.dark, calendar };
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
for (const id of ["historyCourse", "historyStatus", "historyDate"]) document.getElementById(id).addEventListener("change", renderHistory);
document.getElementById("resetFilters").addEventListener("click", () => {
  for (const id of ["historyCourse", "historyStatus", "historyDate"]) document.getElementById(id).value = "";
  renderHistory();
});
document.getElementById("undoBtn").addEventListener("click", () => {
  if (!undoEntries) return;
  state.entries = undoEntries; saveState(); render(); notify("Modification annulée.");
});
document.getElementById("dismissNotice").addEventListener("click", () => { document.getElementById("notice").hidden = true; undoEntries = null; });
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
