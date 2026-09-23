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

  // "Séances comptabilisées" = présent + absent + justifié.
  // Un cours annulé n'entre ni dans la présence actuelle, ni dans les absences.
  const completed = present + absent + justified;
  const presenceRate = completed ? Math.round((present / completed) * 1000) / 10 : 100;
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
  renderSummary();
  renderCourses();
  renderHistory();
  populateCourseSelect();
}

function renderSummary() {
  const all = state.courses.map(metrics);
  const totalEntries = all.reduce((s,m) => s + m.completed, 0);
  const totalPresent = all.reduce((s,m) => s + m.present, 0);
  const totalAbsent = all.reduce((s,m) => s + m.absent, 0);
  const totalAllowed = state.courses.reduce((s,c) => s + maxAbsences(c.totalDays), 0);
  const globalPresence = totalEntries ? Math.round((totalPresent / totalEntries) * 1000) / 10 : 100;

  document.getElementById("summaryGrid").innerHTML = `
    <div class="summary-card"><span>Présence globale</span><strong>${globalPresence}%</strong></div>
    <div class="summary-card"><span>Absences injustifiées</span><strong>${totalAbsent}</strong></div>
    <div class="summary-card"><span>Absences autorisées</span><strong>${totalAllowed}</strong></div>
    <div class="summary-card"><span>Séances encodées</span><strong>${totalEntries}</strong></div>
  `;
}

function renderCourses() {
  const grid = document.getElementById("coursesGrid");
  const template = document.getElementById("courseCardTemplate");
  grid.innerHTML = "";

  state.courses.forEach(course => {
    const node = template.content.cloneNode(true);
    const m = metrics(course);
    const [label, cls] = riskLabel(m);

    node.querySelector(".course-day").textContent = course.day;
    node.querySelector(".course-name").textContent = course.name;
    node.querySelector(".presence-rate").textContent = `${m.presenceRate}%`;
    node.querySelector(".progress-fill").style.width = `${Math.max(0, Math.min(100, m.presenceRate))}%`;
    node.querySelector(".absence-count").textContent = m.absent;
    node.querySelector(".absence-limit").textContent = m.limit;
    node.querySelector(".absence-left").textContent = m.left;

    const badge = node.querySelector(".risk-badge");
    badge.textContent = label;
    badge.classList.add(cls);

    node.querySelector(".details-btn").addEventListener("click", () => showDetails(course.id));
    grid.appendChild(node);
  });
}

function renderHistory() {
  const list = document.getElementById("historyList");
  const entries = [...state.entries].sort((a,b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));

  if (!entries.length) {
    list.innerHTML = `<div class="empty">Aucune séance encodée pour l’instant.</div>`;
    return;
  }

  list.innerHTML = entries.map(e => {
    const course = state.courses.find(c => c.id === e.courseId);
    return `
      <div class="history-item">
        <span class="history-date">${formatDate(e.date)}</span>
        <div>
          <div class="history-course">${course?.name ?? "Cours supprimé"}</div>
          ${e.note ? `<div class="muted">${escapeHtml(e.note)}</div>` : ""}
        </div>
        <span class="status-pill status-${e.status}">${statusLabels[e.status]}</span>
        <button class="delete-btn" data-delete="${e.id}">Supprimer</button>
      </div>
    `;
  }).join("");

  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.entries = state.entries.filter(e => e.id !== btn.dataset.delete);
      saveState();
      render();
    });
  });
}

function populateCourseSelect() {
  const select = document.getElementById("courseSelect");
  select.innerHTML = state.courses.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
}

function showDetails(courseId) {
  const course = state.courses.find(c => c.id === courseId);
  const m = metrics(course);
  const list = entriesFor(course.id).sort((a,b) => b.date.localeCompare(a.date));
  document.getElementById("detailsTitle").textContent = course.name;
  document.getElementById("detailsContent").innerHTML = `
    <div class="detail-stats">
      <div class="detail-stat"><span>Présence</span><strong>${m.presenceRate}%</strong></div>
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
      <div><strong>${c.name}</strong><div class="muted">${c.day}</div></div>
      <label>Jours
        <input type="number" min="1" max="100" step="1" value="${c.totalDays}" data-course-days="${c.id}">
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

document.getElementById("addAttendanceBtn").addEventListener("click", () => {
  document.getElementById("attendanceForm").reset();
  document.getElementById("dateInput").value = todayIso();
  document.getElementById("attendanceDialog").showModal();
});

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

  // Une seule entrée par cours et par date : si elle existe, on la remplace.
  state.entries = state.entries.filter(e => !(e.courseId === courseId && e.date === date));
  state.entries.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    courseId, date, status, note,
    createdAt: new Date().toISOString()
  });

  saveState();
  document.getElementById("attendanceDialog").close();
  render();
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
  if (confirm("Supprimer tout l’historique ? Cette action est irréversible.")) {
    state.entries = [];
    saveState();
    render();
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `presence-cours-backup-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("importInput").addEventListener("change", async (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.courses) || !Array.isArray(parsed.entries)) throw new Error();
    state = { courses: parsed.courses, entries: parsed.entries, dark: !!parsed.dark };
    saveState();
    render();
    alert("Sauvegarde importée.");
  } catch {
    alert("Fichier de sauvegarde invalide.");
  }
  ev.target.value = "";
});

// V3 : pas de Service Worker afin d'éviter qu'une ancienne version reste bloquée en cache.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    registrations.forEach(registration => registration.unregister());
  });
}
if ("caches" in window) {
  caches.keys().then(keys => keys.forEach(key => caches.delete(key)));
}

migrateCourseNames();
render();
