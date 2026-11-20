import { readAccountsState, subscribeAccounts } from "./accountStore";
import { readGroupCatalogState, subscribeGroupCatalog } from "./groupCatalogStore";
import { refreshAcademicCatalog } from "./academicCatalog";
import { readManagedScheduleState, subscribeManagedSchedule } from "./managedScheduleStore";
import { readGroupCalendarsDocument, subscribeGroupCalendars } from "./groupCalendarRead";
import { readTeachingAssignmentsDocument, subscribeTeachingAssignments, TEACHING_ASSIGNMENTS_CHANGE_EVENT } from "./teachingAssignmentsRead";
import { executeAdministrationWrite } from "./administrationWrite";
import { academicPeriodsService } from "./academicPeriodsStore";
import { ACADEMIC_PERIODS_STORAGE_KEY, decodeAcademicPeriodsDocument, emptyAcademicPeriodsDocument } from "../domain/academicPeriods";
import { resolveAssessmentAcademicPeriod } from "../domain/assessmentPeriods";
import { isAccountActive } from "../domain/accounts";
import { isGroupActive } from "../domain/groupCatalog";
import { isSubjectActive } from "../domain/subjectCatalog";
import { calendarClosedMessage } from "../domain/groupCalendars";
import { lessonTypeLabels } from "../domain/academic";
import { appendTeachingAssignment, canTeachLesson, findTeachingAssignment, hasGeneralTeachingMembership, sameTeachingData, TEACHING_ASSIGNMENTS_KEY, type TeachingAssignment, type TeachingAssignmentCommand, type TeachingAssignmentContext } from "../domain/teachingAssignments";

const sources = (actorId: string) => {
  const accounts = readAccountsState(), groups = readGroupCatalogState(), subjects = refreshAcademicCatalog(), schedule = readManagedScheduleState();
  if (accounts.error || groups.error || subjects.error || schedule.error) throw new Error(accounts.error || groups.error || subjects.error || schedule.error);
  const actor = accounts.accounts.find(row => row.id === actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Назначения по типам занятий доступны только активному настройщику.");
  const raw = localStorage.getItem(ACADEMIC_PERIODS_STORAGE_KEY), periods = raw === null ? emptyAcademicPeriodsDocument() : decodeAcademicPeriodsDocument(raw);
  const calendars = readGroupCalendarsDocument(), state = readTeachingAssignmentsDocument();
  const context: TeachingAssignmentContext = { actorId, actorRevision: actor.revision, expectedRevision: state.revision, accountsRevision: accounts.revision, subjectsRevision: subjects.revision, groupsRevision: groups.revision, periodsRevision: periods.revision, scheduleRevision: schedule.snapshot.revision, calendarRevision: calendars.revision };
  return { actor, accounts, groups, subjects, periods, calendars, schedule: schedule.snapshot, state, context };
};
const checkContext = (expected: TeachingAssignmentContext, actual: TeachingAssignmentContext) => {
  const keys: Array<keyof TeachingAssignmentContext> = ["actorId", "actorRevision", "expectedRevision", "accountsRevision", "subjectsRevision", "groupsRevision", "periodsRevision", "scheduleRevision", "calendarRevision"];
  if (keys.some(key => expected[key] !== actual[key])) throw new Error("Назначения, расписание или справочники изменились. Перепроверьте форму; введённые данные сохранены.");
};
export const teachingAssignmentsService = {
  async read(actorId: string) {
    try {
      const source = sources(actorId);
      return { context: source.context, assignments: source.state.assignments, teachers: source.accounts.accounts.filter(row => row.role === "teacher"), groups: source.groups.groups, subjects: source.subjects.subjects, years: source.periods.years, terms: source.periods.terms };
    } catch (error) { console.error("Не удалось прочитать назначения по типам занятий:", error); throw error; }
  },
  async execute(command: TeachingAssignmentCommand) {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const source = sources(captured.actorId); checkContext(captured, source.context);
        const teacher = source.accounts.accounts.find(row => row.id === captured.teacherId && row.role === "teacher"), subject = source.subjects.subjects.find(row => row.id === captured.subjectId), group = source.groups.groups.find(row => row.id === captured.groupId);
        if (!teacher || !subject || !group || !hasGeneralTeachingMembership(teacher, subject.id, group.id)) throw new Error("Сначала назначьте преподавателю дисциплину и группу в общем назначении. Затем настройте типы занятий.");
        if (!isGroupActive(group) || !isSubjectActive(subject)) throw new Error("Для новых назначений восстановите группу и дисциплину из архива.");
        const before = findTeachingAssignment(source.state, teacher.id, subject.id, group.id);
        if ((before?.revision ?? 0) !== captured.assignmentRevision) throw new Error("Само назначение изменилось. Откройте актуальную карточку; ввод сохранён.");
        if (!Array.isArray(captured.periods) || captured.periods.length > 200 || captured.mode === "general" && captured.periods.length) throw new Error("Проверьте список семестров назначения.");
        if (!["general", "periods"].includes(captured.mode) || captured.periods.some(entry => !entry.termId || !Array.isArray(entry.types) || !entry.types.length || new Set(entry.types).size !== entry.types.length || entry.types.some(type => !Object.hasOwn(lessonTypeLabels, type)))) throw new Error("Для каждой строки выберите семестр и хотя бы один тип занятия.");
        if (new Set(captured.periods.map(entry => entry.termId)).size !== captured.periods.length) throw new Error("Один семестр нельзя добавлять в назначение дважды.");
        const now = new Date().toISOString();
        const after: TeachingAssignment = { id: before?.id ?? crypto.randomUUID(), revision: (before?.revision ?? 0) + 1, teacherId: teacher.id, subjectId: subject.id, groupId: group.id, mode: captured.mode,
          periods: captured.periods.map(entry => ({ period: resolveAssessmentAcademicPeriod(source.periods, { termId: entry.termId, expectedRevision: captured.periodsRevision }, now), types: [...entry.types].sort() })).sort((a, b) => a.period.term.startsOn.localeCompare(b.period.term.startsOn) || a.period.term.id.localeCompare(b.period.term.id)) };
        if (after.periods.some((entry, index) => index > 0 && entry.period.term.startsOn <= after.periods[index - 1].period.term.endsOn)) throw new Error("Семестры назначения не должны пересекаться по датам.");
        if (sameTeachingData({ mode: before?.mode ?? "general", periods: before?.periods ?? [] }, { mode: after.mode, periods: after.periods })) throw new Error("Назначение не изменилось.");
        const locked = source.calendars.calendars.find(calendar => calendar.group.id === group.id && calendar.state === "closed" && (
          (before?.mode ?? "general") !== after.mode || [...(before?.periods ?? []), ...after.periods].some(entry => entry.period.term.id === calendar.period.term.id && !sameTeachingData(before?.periods.find(row => row.period.term.id === entry.period.term.id), after.periods.find(row => row.period.term.id === entry.period.term.id)))
        ));
        if (locked) throw new Error(calendarClosedMessage(locked));
        const next = appendTeachingAssignment(source.state, after, { id: crypto.randomUUID(), actorId: source.actor.id, occurredAt: now });
        const conflicts = source.schedule.published.flatMap(week => week.lessons).filter(lesson => lesson.teacherId === teacher.id && lesson.subjectId === subject.id && lesson.groupId === group.id && Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`) > Date.parse(now) && !canTeachLesson(next, teacher, lesson));
        if (conflicts.length) throw new Error(`Назначение нужно для будущих опубликованных занятий: ${conflicts.length}. Сначала замените преподавателя или тип/дату занятия и опубликуйте изменения.`);
        localStorage.setItem(TEACHING_ASSIGNMENTS_KEY, JSON.stringify(next));
        window.dispatchEvent(new Event(TEACHING_ASSIGNMENTS_CHANGE_EVENT));
      } catch (error) { console.error("Не удалось сохранить назначение по типам занятий. Исходные данные сохранены:", error); throw error; }
    });
  },
  async history(context: TeachingAssignmentContext, id: string, page: number) {
    try {
      const source = sources(context.actorId); checkContext(context, source.context);
      if (!source.state.assignments.some(row => row.id === id)) throw new Error("Назначение недоступно.");
      const events = source.state.history.filter(row => row.after.id === id).reverse(), pages = Math.max(1, Math.ceil(events.length / 20));
      if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error("Выберите корректную страницу истории.");
      const items = events.slice((page - 1) * 20, page * 20), authorIds = new Set(items.map(event => event.actorId));
      return { items, authors: Object.fromEntries(source.accounts.accounts.filter(row => authorIds.has(row.id)).map(row => [row.id, row.name])), total: events.length, page, pages };
    } catch (error) { console.error("Не удалось прочитать историю назначения по типам занятий:", error); throw error; }
  },
  subscribe(listener: () => void) {
    const stops = [subscribeAccounts(listener), subscribeGroupCatalog(listener), subscribeManagedSchedule(listener), subscribeGroupCalendars(listener), subscribeTeachingAssignments(listener), academicPeriodsService.subscribe(listener)];
    // Subject changes also arrive as storage events in other tabs; the catalog publishes this event locally.
    const subjectChange = () => listener();
    window.addEventListener("bi-university-subject-catalog-change", subjectChange);
    return () => { stops.forEach(stop => stop()); window.removeEventListener("bi-university-subject-catalog-change", subjectChange); };
  },
};
export type TeachingAssignmentsSnapshot = Awaited<ReturnType<typeof teachingAssignmentsService.read>>;
