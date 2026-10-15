/* Fonctions partagées par le navigateur et les tests Node, sans dépendance. */
(function (root) {
  const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const Q1_IDS = new Set(["web", "os2", "ebusiness", "computers", "math"]);
  function quarterOf(course) {
    return course.quarter === "Q1" || course.quarter === "Q2" ? course.quarter : Q1_IDS.has(course.id) ? "Q1" : "Q2";
  }
  function emptyCalendar() {
    return { quarters: { Q1: { start: "", end: "" }, Q2: { start: "", end: "" } }, holidays: [] };
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
  function scheduledCourses(courses, calendar, quarter, date) {
    if (!validDate(date)) return [];
    const range = calendar.quarters[quarter];
    if ((range.start && date < range.start) || (range.end && date > range.end)) return [];
    if (calendar.holidays.some(holiday => holiday.start <= date && date <= holiday.end)) return [];
    const day = DAYS[new Date(date + "T12:00:00Z").getUTCDay()];
    return courses.filter(course => quarterOf(course) === quarter && course.day.split("/").some(value => value.trim().toLocaleLowerCase("fr-BE") === day.toLocaleLowerCase("fr-BE")));
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
  const api = { DAYS, quarterOf, emptyCalendar, validDate, validateCalendar, scheduledCourses, inPeriod, statistics, applyBatch };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PresencePlanning = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
