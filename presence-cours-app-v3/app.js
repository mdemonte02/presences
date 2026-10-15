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
const q1Ids = new Set(["web", "os2", "ebusiness", "computers", "math"]);
function visibleCourses() { return state.courses.filter(c => q1Ids.has(c.id) === (selectedQuarter === "Q1")); }
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
    return { courses: structuredClone(DEFAULT_COURSES), entries: [], dark: false };
  }
  try {
    const parsed = JSON.parse(saved);
    return {
      courses: Array.isArray(parsed.courses) ? parsed.courses : structuredClone(DEFAULT_COURSES),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      dark: !!parsed.dark
    };
  } catch {
    return { courses: structuredClone(DEFAULT_COURSES), entries: [], dark: false };
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
  const day = new Intl.DateTimeFormat("fr-BE", { weekday: "long" }).format(new Date(date + "T12:00:00"));
  document.getElementById("todayDate").textContent = `${formatDate(date)} · ${selectedQuarter}`;
  const list = document.getElementById("todayCourses");
  list.replaceChildren();
  const courses = visibleCourses().filter(course => course.day.split("/").some(value => value.trim().toLocaleLowerCase("fr-BE") === day));
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

    node.querySelector(".course-day").textContent = course.day;
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
  const course = state.courses.find(c => c.id === courseId);
  const m = metrics(course);
  const list = entriesFor(course.id).sort((a,b) => b.date.localeCompare(a.date));
  document.getElementById("detailsTitle").textContent = course.name;
  document.getElementById("detailsContent").innerHTML = `
    <div class="detail-stats">
      <div class="detail-stat"><span>Présence sur les séances encodées</span><strong>${m.completed ? m.presenceRate + "%" : "—"}</strong></div>
      <div class="detail-stat"><span>Absences injustifiées</span><strong>${m.absent} / ${m.limit}</strong></div>
      <div class="detail-stat"><span>Encore disponibles</span><strong>${m.left}</strong></div>
    </div>
    <p class="muted">${course.totalDays} jours prévus · ${m.completed} séance(s) comptabilisée(s) · ${m.justified} justifiée(s) · ${m.cancelled} annulée(s)</p>
    <div class="detail-history">
      ${list.length ? list.map(e => `
        <div class="history-item">
          <span class="history-date">${formatDate(e.date)}</span>
          <span>${e.note ? escapeHtml(e.note) : "—"}</span>
          <span class="status-pill status-${e.status}">${statusLabels[e.status]}</span>
        </div>
      `).join("") : `<div class="empty">Aucune séance pour ce cours.</div>`}
    </div>
  `;
  document.getElementById("detailsDialog").showModal();
}

function openCourseSettings() {
  const wrap = document.getElementById("courseSettingsList");
  wrap.innerHTML = state.courses.map(c => `
    <div class="settings-row">
      <div><strong>${escapeHtml(c.name)}</strong><div class="muted">${escapeHtml(c.day)}</div></div>
      <label>Jours
        <input type="number" min="1" max="100" step="1" value="${c.totalDays}" data-course-days="${escapeHtml(c.id)}">
      </label>
    </div>
  `).join("");
  document.getElementById("courseDialog").showModal();
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
  document.querySelectorAll("[data-course-days]").forEach(input => {
    const course = state.courses.find(c => c.id === input.dataset.courseDays);
    const val = Number(input.value);
    if (course && Number.isFinite(val) && val >= 1) course.totalDays = Math.round(val);
  });
  saveState();
  document.getElementById("courseDialog").close();
  render();
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
      ids.add(c.id);
    }
    const entryIds = new Set(), sessions = new Set();
    for (const e of parsed.entries) {
      const session = `${e.courseId}/${e.date}`;
      if (typeof e.id !== "string" || entryIds.has(e.id) || sessions.has(session) || !ids.has(e.courseId) || !Object.hasOwn(statusLabels, e.status) || typeof e.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || !Number.isFinite(Date.parse(e.date)) || new Date(e.date).toISOString().slice(0,10) !== e.date || typeof e.note !== "string" || typeof e.createdAt !== "string") throw new Error();
      entryIds.add(e.id); sessions.add(session);
    }
    if (!confirm("Importer cette sauvegarde remplacera les cours et l’historique actuels. Continuer ?")) { ev.target.value = ""; return; }
    state = { courses: parsed.courses, entries: parsed.entries, dark: !!parsed.dark };
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
