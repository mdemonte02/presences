/* Fonctions partagées par le navigateur et les tests Node, sans dépendance. */
(function (root) {
  const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const Q1_IDS = new Set(["web", "os2", "ebusiness", "computers", "math"]);
  function quarterOf(course) {
    return course.quarter === "Q1" || course.quarter === "Q2" ? course.quarter : Q1_IDS.has(course.id) ? "Q1" : "Q2";
  }
  function emptyCalendar() {
    return { quarters: { Q1: { start: "", end: "" }, Q2: { start: "", end: "" } }, holidays: [], exceptions: [] };
  }
  function validDate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function validateCalendar(calendar) {
    if (!calendar || !calendar.quarters || !Array.isArray(calendar.holidays)) throw new Error("Calendrier invalide.");
    for (const key of ["Q1", "Q2"]) {
      const range = calendar.quarters[key];
      if (!range || typeof range.start !== "string" || typeof range.end !== "string") throw new Error("Dates de quadrimestre invalides.");
      if (range.start || range.end) {
        if (!validDate(range.start) || !validDate(range.end) || range.start > range.end) throw new Error(`Renseignez un début et une fin valides pour ${key}.`);
      }
    }
    const { Q1, Q2 } = calendar.quarters;
    if (Q1.start && Q2.start && Q1.start <= Q2.end && Q2.start <= Q1.end) throw new Error("Les dates de Q1 et Q2 ne peuvent pas se chevaucher.");
    for (const holiday of calendar.holidays) {
      if (!holiday || !validDate(holiday.start) || !validDate(holiday.end) || holiday.start > holiday.end || typeof holiday.label !== "string") throw new Error("Chaque congé doit avoir une date de début et de fin valides.");
    }
    return calendar;
  }
  function regularCourses(courses, calendar, quarter, date) {
    if (!validDate(date)) return [];
    const range = calendar.quarters[quarter];
    if ((range.start && date < range.start) || (range.end && date > range.end)) return [];
    if (calendar.holidays.some(holiday => holiday.start <= date && date <= holiday.end)) return [];
    const day = DAYS[new Date(date + "T12:00:00Z").getUTCDay()];
    return courses.filter(course => quarterOf(course) === quarter && course.day.split("/").some(value => value.trim().toLocaleLowerCase("fr-BE") === day.toLocaleLowerCase("fr-BE")));
  }
  function scheduledCourses(courses, calendar, quarter, date) {
    const regular = regularCourses(courses, calendar, quarter, date);
    if (!validDate(date)) return [];
    const range = calendar.quarters[quarter];
    if ((range.start && date < range.start) || (range.end && date > range.end) || calendar.holidays.some(h => h.start <= date && date <= h.end)) return [];
    const exceptions = calendar.exceptions ?? [];
    const removed = new Set(exceptions.filter(e => e.date === date).map(e => e.courseId));
    const added = new Set(exceptions.filter(e => e.action === "move" && e.targetDate === date).map(e => e.courseId));
    return courses.filter(course => quarterOf(course) === quarter && (regular.some(c => c.id === course.id) && !removed.has(course.id) || added.has(course.id)));
  }
  function validateExceptions(calendar, courses) {
    const exceptions = calendar.exceptions ?? [];
    if (!Array.isArray(exceptions)) throw new Error("Changements d’horaire invalides.");
    const sources = new Set(), targets = new Set();
    for (const item of exceptions) {
      const course = courses.find(c => c.id === item.courseId);
      const key = `${item.courseId}/${item.date}`;
      if (!course || !validDate(item.date) || !["cancel", "move"].includes(item.action) || sources.has(key)) throw new Error("Chaque changement doit concerner un cours et une date uniques.");
      if (!regularCourses([course], calendar, quarterOf(course), item.date).length) throw new Error("La date d’origine doit correspondre à une séance prévue hors congés.");
      sources.add(key);
      if (item.action === "move") {
        const target = `${course.id}/${item.targetDate}`;
        const range = calendar.quarters[quarterOf(course)];
        if (!validDate(item.targetDate) || item.date === item.targetDate || (range.start && item.targetDate < range.start) || (range.end && item.targetDate > range.end) || calendar.holidays.some(h => h.start <= item.targetDate && item.targetDate <= h.end)) throw new Error("La nouvelle date doit être différente, dans le quadrimestre et hors congés.");
        if (targets.has(target) || regularCourses([course], calendar, quarterOf(course), item.targetDate).length) throw new Error("Une autre séance de ce cours est déjà prévue à cette date.");
        targets.add(target);
      }
    }
    return exceptions;
  }
  function missingSessions(courses, calendar, quarter, entries, start, end, today) {
    if (!validDate(start) || !validDate(end) || !validDate(today) || start > end) throw new Error("Choisissez une période valide.");
    const days = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (days > 365) throw new Error("Choisissez une période de 366 jours maximum.");
    const encoded = new Set(entries.map(e => `${e.courseId}/${e.date}`));
    const result = [];
    for (let time = Date.parse(start); time <= Date.parse(end); time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      if (date >= today) break;
      for (const course of scheduledCourses(courses, calendar, quarter, date)) {
        if (!encoded.has(`${course.id}/${date}`)) result.push({ courseId: course.id, date });
      }
    }
    return result.reverse();
  }
  function updateEntries(entries, ids, patch) {
    const selected = new Set(ids);
    if (!selected.size || selected.size !== ids.length || ids.some(id => !entries.some(e => e.id === id)) || !["present", "absent", "justified", "cancelled"].includes(patch.status) || (patch.note !== undefined && (typeof patch.note !== "string" || patch.note.length > 120))) throw new Error("Sélection ou correction invalide.");
    return entries.map(entry => selected.has(entry.id) ? { ...entry, status: patch.status, ...(patch.note !== undefined ? { note: patch.note } : {}) } : entry);
  }
  function courseReport(courses, entries) {
    return courses.map(course => {
      const stats = statistics(entries.filter(e => e.courseId === course.id));
      const limit = Math.floor(course.totalDays * 0.4);
      return { id: course.id, name: course.name, ...stats, limit, left: Math.max(0, limit - stats.absent) };
    });
  }
  function sortReport(rows, key, direction = "asc") {
    if (!["name", "present", "justified", "absent", "cancelled", "presenceRate", "limit", "left"].includes(key)) throw new Error("Colonne de tri invalide.");
    const sign = direction === "desc" ? -1 : 1;
    return [...rows].sort((a,b) => {
      if (a[key] === null || b[key] === null) return a[key] === b[key] ? a.name.localeCompare(b.name, "fr") : a[key] === null ? 1 : -1;
      const comparison = typeof a[key] === "string" ? a[key].localeCompare(b[key], "fr") : a[key] - b[key];
      return comparison * sign || a.name.localeCompare(b.name, "fr");
    });
  }
  function toCsv(rows) {
    return "\uFEFF" + rows.map(row => row.map(value => {
      let text = String(value ?? "");
      if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    }).join(";")).join("\r\n");
  }
  function inPeriod(entries, start = "", end = "") {
    return entries.filter(entry => (!start || entry.date >= start) && (!end || entry.date <= end));
  }
  function statistics(entries) {
    const counts = { present: 0, absent: 0, justified: 0, cancelled: 0 };
    for (const entry of entries) if (Object.hasOwn(counts, entry.status)) counts[entry.status]++;
    const completed = counts.present + counts.absent + counts.justified;
    return { ...counts, completed, presenceRate: completed ? Math.round((counts.present + counts.justified) / completed * 1000) / 10 : null };
  }
  function applyBatch(entries, date, rows, courses, createId, createdAt) {
    if (!validDate(date) || !rows.length) throw new Error("Sélectionnez au moins un cours et une date valide.");
    const ids = new Set();
    for (const row of rows) {
      if (!courses.some(course => course.id === row.courseId) || ids.has(row.courseId) || !["present", "absent", "justified", "cancelled"].includes(row.status) || typeof row.note !== "string" || row.note.length > 120) throw new Error("Sélection de séances invalide.");
      ids.add(row.courseId);
    }
    const replacements = rows.map(row => {
      const previous = entries.find(entry => entry.courseId === row.courseId && entry.date === date);
      return { ...row, date, id: previous?.id ?? createId(), createdAt: previous?.createdAt ?? createdAt };
    });
    return [...entries.filter(entry => entry.date !== date || !ids.has(entry.courseId)), ...replacements];
  }
  const api = { DAYS, quarterOf, emptyCalendar, validDate, validateCalendar, scheduledCourses, inPeriod, statistics, applyBatch, validateExceptions, missingSessions, updateEntries, courseReport, sortReport, toCsv };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PresencePlanning = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
