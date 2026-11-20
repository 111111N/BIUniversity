import { archiveSchedulePublication, createEmptyManagedSchedule, decodeManagedSchedule, findScheduleConflicts, getManagedWeekKey, MANAGED_SCHEDULE_KEY, reconcilePublishedJournal, snapshotHasFutureTeaching, validateManagedLesson, type ManagedLesson, type ManagedScheduleSnapshot, type ManagedScheduleWeek } from "../domain/scheduleManagement";
import { ACADEMIC_GROUPS, getAcademicGroupByName, getAcademicSubjectByName, refreshAcademicCatalog, SUBJECT_GROUP_OFFERINGS } from "./academicCatalog";
import { readAccountsState } from "./accountStore";
import { createDemoWeekSchedule } from "./demoSchedule";
import { parseCalendarDate } from "../domain/calendar";
import { getAcademicSubjectDefinition } from "./academicCatalog";
import { executeAdministrationWrite } from "./administrationWrite";
import { isAccountActive } from "../domain/accounts";
import { isGroupActive } from "../domain/groupCatalog";
import { readGroupCatalogDocument } from "./groupCatalogRead";
import { copyScheduleWeek, getScheduleCopyTargetDates, sameScheduleCopyVersions, type ScheduleCopyRequest, type ScheduleCopyVersions } from "../domain/scheduleCopy";
import type { ScheduleConflict } from "../domain/scheduleManagement";
import { sameManagedScheduleVersions, type ManagedScheduleVersions } from "../domain/scheduleVersions";
import { compareSchedulePublication, type PublicationComparison } from "../domain/schedulePublication";
import { readGroupCalendarsDocument } from "./groupCalendarRead";
import { assertCalendarDatesEditable, getCalendarPublicationIssues } from "../domain/groupCalendars";
import { readTeachingAssignmentsDocument } from "./teachingAssignmentsRead";
import { canScheduleTeacher, findTeachingAssignment } from "../domain/teachingAssignments";
import { readScheduleTemplatesDocument } from "./scheduleTemplatesRead";
import { readRoomsDocument } from "./roomsRead";
import { indexRooms, roomLessonIssues, type RoomIndex } from "../domain/rooms";

const CHANGE_EVENT = "bi-university-managed-schedule-change";
export interface ManagedScheduleRead { snapshot: ManagedScheduleSnapshot; error: string }
export const readManagedScheduleState = (): ManagedScheduleRead => {
  try {
    if (typeof localStorage === "undefined") return { snapshot: createEmptyManagedSchedule(), error: "" };
    const raw = localStorage.getItem(MANAGED_SCHEDULE_KEY);
    if (raw === null) return { snapshot: createEmptyManagedSchedule(), error: "" };
    const snapshot = decodeManagedSchedule(raw);
    if (!snapshot) throw new Error("Некорректный формат расписания");
    return { snapshot, error: "" };
  } catch (error) {
    console.error("Не удалось прочитать управляемое расписание. Исходные данные сохранены.", error);
    return { snapshot: createEmptyManagedSchedule(), error: "Не удалось прочитать расписание. Изменения заблокированы, исходные данные сохранены. Обратитесь к настройщику." };
  }
};
export const subscribeManagedSchedule = (listener: () => void) => {
  if (typeof window === "undefined") return () => undefined;
  const handleStorage = (event: StorageEvent) => { if (event.key === MANAGED_SCHEDULE_KEY || event.key === null) listener(); };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => { window.removeEventListener("storage", handleStorage); window.removeEventListener(CHANGE_EVENT, listener); };
};
export const hasFuturePublishedTeaching = (accountId: string) => {
  const state = readManagedScheduleState();
  if (state.error) throw new Error("Проверка назначенных занятий недоступна: восстановите хранилище расписания.");
  return snapshotHasFutureTeaching(state.snapshot, accountId);
};
export const getManagedScheduleWeek = (snapshot: ManagedScheduleSnapshot, weekStart: string, groupId: string): ManagedScheduleWeek => snapshot.drafts.find((week) => week.weekStart === weekStart && week.groupId === groupId)
  ?? snapshot.published.find((week) => week.weekStart === weekStart && week.groupId === groupId) ?? { weekStart, groupId, lessons: [] };

export const getManagedScheduleTeachers = () => {
  try {
    const state = readAccountsState();
    if (state.error) throw new Error(state.error);
    const scopes = readTeachingAssignmentsDocument();
    return state.accounts.filter((account) => account.role === "teacher" && isAccountActive(account)).map((account) => ({ id: account.id, name: account.scheduleName || account.name, memberships: account.memberships, teachingAssignments: scopes.assignments.filter(row => row.teacherId === account.id) }));
  } catch (error) { console.error("Не удалось прочитать назначения преподавателей для расписания:", error); return []; }
};
const getOtherPublishedLessons = (snapshot: ManagedScheduleSnapshot, weekStart: string, groupId: string) => {
  const replacedGroups = new Set(snapshot.published.filter((week) => week.weekStart === weekStart).map((week) => week.groupId));
  replacedGroups.add(groupId);
  const demo = createDemoWeekSchedule(parseCalendarDate(weekStart)!).flatMap((lesson): ManagedLesson[] => {
    const group = getAcademicGroupByName(lesson.group);
    const subject = getAcademicSubjectByName(lesson.subject);
    if (!group || !subject || replacedGroups.has(group.id)) return [];
    return [{ id: `demo:${lesson.id}`, scheduleId: lesson.id, subjectId: subject.id, groupId: group.id, teacherId: lesson.teacherId ?? lesson.teacher ?? "", teacherName: lesson.teacher ?? "", date: lesson.date, startsAt: lesson.startTime, endsAt: lesson.endTime, type: lesson.type === "Лек." ? "lecture" : lesson.type === "Лаб." ? "laboratory" : "practice", room: lesson.location }];
  });
  return [...demo, ...snapshot.published.filter((week) => week.weekStart === weekStart && week.groupId !== groupId).flatMap((week) => week.lessons)];
};
export const getManagedWeekConflicts = (snapshot: ManagedScheduleSnapshot, week: ManagedScheduleWeek, rooms: RoomIndex = indexRooms(readRoomsDocument())) => findScheduleConflicts(week.lessons, getOtherPublishedLessons(snapshot, week.weekStart, week.groupId), rooms);

export interface ScheduleCopyPreview extends ScheduleCopyVersions {
  request: ScheduleCopyRequest;
  lessons: ManagedLesson[];
  conflicts: ScheduleConflict[];
  issues: string[];
  canApply: boolean;
  templateRevision?: number;
  templatesRevision?: number;
}
const readManagedScheduleContext = (actorId: string) => {
  const catalog = refreshAcademicCatalog();
  if (catalog.error) throw new Error("Учебный каталог недоступен. Работа с расписанием приостановлена.");
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find((account) => account.id === actorId);
  if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Работа с расписанием доступна только активному настройщику.");
  const state = readManagedScheduleState();
  if (state.error) throw new Error(state.error);
  const versions: ScheduleCopyVersions = { scheduleRevision: state.snapshot.revision, accountsRevision: accounts.revision, subjectRevision: catalog.revision, groupRevision: readGroupCatalogDocument().revision, calendarRevision: readGroupCalendarsDocument().revision, teachingRevision: readTeachingAssignmentsDocument().revision, roomsRevision: readRoomsDocument().revision };
  return { snapshot: state.snapshot, versions };
};
export const previewManagedScheduleCopy = async (command: { actorId: string; request: ScheduleCopyRequest }): Promise<ScheduleCopyPreview> => {
  try {
    const { snapshot, versions } = readManagedScheduleContext(command.actorId);
    const request = structuredClone(command.request);
    const templates = request.templateId ? readScheduleTemplatesDocument() : undefined, template = templates?.templates.find(row => row.id === request.templateId && row.status === "active");
    if (request.templateId && (!template || request.source !== "publication" || template.publicationId !== request.publicationId)) throw new Error("Шаблон недоступен или изменился. Выберите его заново.");
    if (!ACADEMIC_GROUPS.some((group) => group.id === request.groupId && isGroupActive(group))) throw new Error("Выберите действующую учебную группу.");
    if (!ACADEMIC_GROUPS.some(group => group.id === (request.sourceGroupId ?? request.groupId))) throw new Error("Исходная группа недоступна. Восстановите её справочник перед копированием.");
    let nextId = Date.now() * 1000;
    for (const lesson of [...snapshot.drafts, ...snapshot.published].flatMap((week) => week.lessons).concat(snapshot.journal, snapshot.publications?.flatMap(version => version.week.lessons) ?? [])) nextId = Math.max(nextId, lesson.scheduleId);
    const lessons = copyScheduleWeek(snapshot, request, () => ({ id: `managed:${crypto.randomUUID()}`, scheduleId: ++nextId }));
    const teachers = new Map(getManagedScheduleTeachers().map((teacher) => [teacher.id, teacher]));
    for (const lesson of lessons) lesson.teacherName = teachers.get(lesson.teacherId)?.name ?? lesson.teacherName;
    const week = { groupId: request.groupId, weekStart: request.targetWeekStart, lessons };
    let issues: string[] = [];
    try { validateWeek(week, snapshot, false); }
    catch (error) { if (!(error instanceof Error)) throw error; issues = error.message.split("\n"); }
    let canApply = true;
    try { assertCopyTargetOpen(snapshot, request); }
    catch (error) { if (!(error instanceof Error)) throw error; canApply = false; issues.push(error.message); }
    issues.push(...getCalendarPublicationIssues(readGroupCalendarsDocument(), request.groupId, lessons.map(lesson => lesson.date)));
    return { ...versions, request, lessons, canApply, ...(template && templates ? { templateRevision: template.revision, templatesRevision: templates.revision } : {}), issues: [...new Set(issues)], conflicts: getManagedWeekConflicts(snapshot, week) };
  } catch (error) { console.error("Не удалось подготовить копирование недели:", error); throw error; }
};
const assertCopyTargetOpen = (snapshot: ManagedScheduleSnapshot, request: ScheduleCopyRequest) => {
  if (!ACADEMIC_GROUPS.some(group => group.id === request.groupId && isGroupActive(group))) throw new Error("Группа назначения недоступна для новых черновиков.");
  const dates = [...snapshot.published, ...snapshot.drafts].filter(week => week.groupId === request.groupId && week.weekStart === request.targetWeekStart).flatMap(week => week.lessons.map(lesson => lesson.date));
  assertCalendarDatesEditable(readGroupCalendarsDocument(), request.groupId, [...dates, ...getScheduleCopyTargetDates(snapshot, request)]);
};
export const verifyManagedScheduleCopy = async (command: { actorId: string; versions: ScheduleCopyVersions; request?: ScheduleCopyRequest; templateRevision?: number; templatesRevision?: number }) => {
  try {
    const { snapshot, versions } = readManagedScheduleContext(command.actorId);
    if (!sameScheduleCopyVersions(command.versions, versions)) throw new Error("Расписание, учётки или справочники изменились. Повторите проверку копирования.");
    if (command.request?.templateId) {
      const templates = readScheduleTemplatesDocument(), template = templates.templates.find(row => row.id === command.request?.templateId && row.status === "active");
      if (!template || templates.revision !== command.templatesRevision || template.revision !== command.templateRevision || template.publicationId !== command.request.publicationId || command.request.source !== "publication") throw new Error("Шаблоны изменились после проверки. Выберите актуальную версию и повторите предпросмотр.");
    }
    if (command.request) assertCopyTargetOpen(snapshot, command.request);
  } catch (error) { console.error("Не удалось проверить актуальность копии недели:", error); throw error; }
};

interface ScheduleCommand { actorId: string; expectedRevision: number; weekStart: string; groupId: string; reviewedVersions?: ManagedScheduleVersions }
const updateSnapshot = async (command: ScheduleCommand, mutate: (snapshot: ManagedScheduleSnapshot) => ManagedScheduleSnapshot): Promise<ManagedScheduleSnapshot> => {
  try {
    return await executeAdministrationWrite(() => {
      const catalog = refreshAcademicCatalog();
      if (catalog.error) throw new Error("Каталог дисциплин недоступен. Изменение расписания остановлено.");
      const accounts = readAccountsState();
      if (accounts.error) throw new Error("Справочник учётных записей недоступен. Изменение расписания остановлено.");
      const actor = accounts.accounts.find((account) => account.id === command.actorId);
      if (!actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Изменять расписание может только активный настройщик с актуальным доступом.");
      const { snapshot, error } = readManagedScheduleState();
      if (error) throw new Error(error);
      if (snapshot.revision !== command.expectedRevision) throw new Error("Расписание изменено в другой вкладке. Обновите данные и повторите действие.");
      const calendars = readGroupCalendarsDocument();
      const teachingRevision = readTeachingAssignmentsDocument().revision;
      const roomsRevision = readRoomsDocument().revision;
      if (command.reviewedVersions && !sameManagedScheduleVersions(command.reviewedVersions, { scheduleRevision: snapshot.revision, accountsRevision: accounts.revision, subjectRevision: catalog.revision, groupRevision: readGroupCatalogDocument().revision, calendarRevision: calendars.revision, teachingRevision, roomsRevision })) throw new Error("Данные изменились после проверки публикации. Обновите предпросмотр и подтвердите актуальные изменения.");
      if (getManagedWeekKey(command.weekStart) !== command.weekStart || !ACADEMIC_GROUPS.some((group) => group.id === command.groupId)) throw new Error("Выберите корректную неделю и группу.");
      if (!isGroupActive(ACADEMIC_GROUPS.find((group) => group.id === command.groupId)!)) throw new Error("Группа находится в архиве. Новые черновики и публикации недоступны.");
      const next = mutate(snapshot);
      // Check both removed and new lessons: deleting a closed-period lesson is also an edit.
      for (const weeks of [snapshot.drafts, snapshot.published, next.drafts, next.published]) {
        const week = weeks.find(row => row.groupId === command.groupId && row.weekStart === command.weekStart);
        if (week) assertCalendarDatesEditable(calendars, command.groupId, week.lessons.map(lesson => lesson.date));
      }
      next.revision = snapshot.revision + 1;
      if (snapshot.version === 2 && (next.version !== 2 || !next.publications || next.publications.length < (snapshot.publications?.length ?? 0) || snapshot.publications?.some((row, index) => JSON.stringify(row) !== JSON.stringify(next.publications![index])))) throw new Error("Сохранённые версии публикаций нельзя изменять или удалять. Ничего не записано.");
      if (!decodeManagedSchedule(JSON.stringify(next))) throw new Error("Не удалось проверить целостность расписания. Ничего не сохранено.");
      localStorage.setItem(MANAGED_SCHEDULE_KEY, JSON.stringify(next));
      if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
      return next;
    });
  } catch (error) {
    console.error("Не удалось сохранить или опубликовать расписание.", error);
    if (error instanceof DOMException && error.name === "QuotaExceededError") throw new Error("Недостаточно места для расписания и архива версий. Черновик и прежние публикации не изменены. Сохраните резервную копию данных перед освобождением места.");
    throw error instanceof Error ? error : new Error("Не удалось изменить расписание. Повторите попытку.");
  }
};
const validateWeek = (week: ManagedScheduleWeek, snapshot: ManagedScheduleSnapshot, publishing: boolean) => {
  const errors = week.lessons.flatMap((lesson) => validateManagedLesson(lesson));
  const roomDocument = readRoomsDocument(), rooms = indexRooms(roomDocument);
  const roomTimes = new Map(roomDocument.history.map(event => [event.after.id, Date.parse(event.occurredAt)])), now = Date.now();
  const previousLessons = new Map([...snapshot.journal, ...snapshot.published.flatMap(row => row.lessons), ...snapshot.drafts.flatMap(row => row.lessons)].map(lesson => [lesson.id, lesson]));
  for (const lesson of week.lessons) {
    const previous = previousLessons.get(lesson.id);
    errors.push(...roomLessonIssues(lesson, rooms, Boolean(previous && !previous.roomId && previous.room === lesson.room)).map(issue => `${lesson.date}, ${lesson.startsAt}: ${issue}`));
    if (lesson.roomId && ((roomTimes.get(lesson.roomId) ?? 0) > now || week.updatedAt && (roomTimes.get(lesson.roomId) ?? 0) > Date.parse(week.updatedAt))) errors.push(`${lesson.date}, ${lesson.startsAt}: версия аудитории датирована позже сохранения пары. Проверьте часы устройства, выберите актуальную аудиторию и сохраните черновик заново.`);
  }
  if (week.lessons.some(lesson => getAcademicSubjectDefinition(lesson.subjectId)?.status === "archived")) errors.push("Архивная дисциплина недоступна для новых занятий. Сначала восстановите дисциплину.");
  if (week.lessons.some((lesson) => !SUBJECT_GROUP_OFFERINGS.some((offering) => offering.subjectId === lesson.subjectId && offering.groupId === lesson.groupId))) errors.push("Предмет не назначен выбранной группе.");
  if (week.lessons.some((lesson) => lesson.groupId !== week.groupId || getManagedWeekKey(lesson.date) !== week.weekStart)) errors.push("Все занятия должны относиться к выбранной неделе и группе.");
  const teachers = getManagedScheduleTeachers();
  week.lessons.forEach((lesson) => {
    const teacher = teachers.find((account) => account.id === lesson.teacherId);
    if (!teacher || !canScheduleTeacher(teacher, lesson)) errors.push(`${lesson.date}: преподаватель не назначен на этот тип занятия, дисциплину и группу в выбранном периоде.`);
  });
  const used = [...snapshot.published, ...snapshot.drafts].filter((entry) => entry.weekStart !== week.weekStart || entry.groupId !== week.groupId).flatMap((entry) => entry.lessons);
  if (week.lessons.some((lesson) => used.some((entry) => entry.id === lesson.id || entry.scheduleId === lesson.scheduleId))) errors.push("Занятие уже используется в другой неделе. Для копирования создайте новый идентификатор.");
  if (new Set(week.lessons.map((lesson) => lesson.id)).size !== week.lessons.length || new Set(week.lessons.map((lesson) => lesson.scheduleId)).size !== week.lessons.length) errors.push("В расписании повторяются идентификаторы занятий.");
  if (week.lessons.some((lesson) => snapshot.journal.some((entry) => (entry.id === lesson.id && entry.scheduleId !== lesson.scheduleId) || (entry.scheduleId === lesson.scheduleId && entry.id !== lesson.id)))) errors.push("Идентификатор занятия уже связан с другой записью журнала.");
  if (publishing) errors.push(...getManagedWeekConflicts(snapshot, week).map((conflict) => conflict.message));
  const calendars = readGroupCalendarsDocument();
  try { assertCalendarDatesEditable(calendars, week.groupId, week.lessons.map(lesson => lesson.date)); }
  catch (error) { if (!(error instanceof Error)) throw error; errors.push(error.message); }
  if (publishing) errors.push(...getCalendarPublicationIssues(calendars, week.groupId, week.lessons.map(lesson => lesson.date)));
  if (errors.length) throw new Error([...new Set(errors)].join("\n"));
};
export const saveManagedScheduleDraft = async (command: ScheduleCommand & { lessons: ManagedLesson[] }) => updateSnapshot(command, (snapshot) => {
  const week = { weekStart: command.weekStart, groupId: command.groupId, lessons: structuredClone(command.lessons), updatedBy: command.actorId, updatedAt: new Date().toISOString() };
  validateWeek(week, snapshot, false);
  return { ...snapshot, drafts: [...snapshot.drafts.filter((entry) => entry.weekStart !== week.weekStart || entry.groupId !== week.groupId), week] };
});
export interface SchedulePublicationPreview extends PublicationComparison {
  versions: ManagedScheduleVersions;
  wasPublished: boolean;
  beforeCount: number;
  afterCount: number;
}
export const previewManagedSchedulePublication = async (command: ScheduleCommand): Promise<SchedulePublicationPreview> => {
  try {
    const { snapshot, versions } = readManagedScheduleContext(command.actorId);
    if (snapshot.revision !== command.expectedRevision) throw new Error("Расписание изменилось. Обновите предпросмотр публикации.");
    if (getManagedWeekKey(command.weekStart) !== command.weekStart || !ACADEMIC_GROUPS.some((group) => group.id === command.groupId && isGroupActive(group))) throw new Error("Выберите корректную неделю и действующую группу.");
    const draft = snapshot.drafts.find((week) => week.weekStart === command.weekStart && week.groupId === command.groupId);
    if (!draft) throw new Error("Сначала сохраните черновик выбранной недели.");
    validateWeek(draft, snapshot, true);
    const published = snapshot.published.find((week) => week.weekStart === command.weekStart && week.groupId === command.groupId);
    const before = published?.lessons ?? [];
    assertCalendarDatesEditable(readGroupCalendarsDocument(), command.groupId, before.map(lesson => lesson.date));
    return { ...compareSchedulePublication(before, draft.lessons), versions, wasPublished: Boolean(published), beforeCount: before.length, afterCount: draft.lessons.length };
  } catch (error) { console.error("Не удалось подготовить сравнение перед публикацией расписания:", error); throw error; }
};
export const publishManagedScheduleDraft = async (command: ScheduleCommand) => updateSnapshot(command, (snapshot) => {
  const week = snapshot.drafts.find((entry) => entry.weekStart === command.weekStart && entry.groupId === command.groupId);
  if (!week) throw new Error("Сначала сохраните черновик выбранной недели.");
  validateWeek(week, snapshot, true);
  const previous = snapshot.published.find((entry) => entry.weekStart === command.weekStart && entry.groupId === command.groupId)?.lessons ?? [];
  const assignments = readTeachingAssignmentsDocument();
  const publishedLessons = week.lessons.map(lesson => {
    const next = { ...lesson }, assignment = findTeachingAssignment(assignments, lesson.teacherId, lesson.subjectId, lesson.groupId);
    delete next.teachingAssignmentId; delete next.teachingAssignmentRevision;
    if (assignment) { next.teachingAssignmentId = assignment.id; next.teachingAssignmentRevision = assignment.revision; }
    return next;
  });
  const publishedWeek = { ...week, lessons: publishedLessons, publishedBy: command.actorId, publishedAt: new Date().toISOString() };
  const archive = archiveSchedulePublication(snapshot, publishedWeek, command.actorId, publishedWeek.publishedAt, () => `publication:${crypto.randomUUID()}`);
  return { ...snapshot,
    ...archive,
    drafts: snapshot.drafts.filter((entry) => entry !== week),
    published: [...snapshot.published.filter((entry) => entry.weekStart !== week.weekStart || entry.groupId !== week.groupId), publishedWeek],
    journal: reconcilePublishedJournal(snapshot.journal, previous, publishedLessons),
  };
});

interface PublicationArchiveScope { actorId: string; groupId: string; weekStart: string }
const checkArchiveScope = (scope: PublicationArchiveScope) => {
  if (getManagedWeekKey(scope.weekStart) !== scope.weekStart || !ACADEMIC_GROUPS.some(group => group.id === scope.groupId)) throw new Error("Выберите существующую группу и корректную неделю для архива публикаций.");
};
export const listManagedSchedulePublications = async (command: PublicationArchiveScope & { page: number }) => {
  try {
    const { snapshot, versions } = readManagedScheduleContext(command.actorId); checkArchiveScope(command);
    const records = (snapshot.publications ?? []).filter(row => row.week.groupId === command.groupId && row.week.weekStart === command.weekStart).reverse(), pages = Math.max(1, Math.ceil(records.length / 20));
    if (!Number.isSafeInteger(command.page) || command.page < 1 || command.page > pages) throw new Error("Выберите корректную страницу архива публикаций.");
    const accounts = readAccountsState();
    if (accounts.error) throw new Error(accounts.error);
    const names = new Map(accounts.accounts.map(row => [row.id, row.name]));
    return { versions, total: records.length, page: command.page, pages, legacy: snapshot.version === 1,
      items: records.slice((command.page - 1) * 20, command.page * 20).map(row => ({ id: row.id, number: row.number, origin: row.origin, occurredAt: row.occurredAt, actorName: names.get(row.actorId) ?? "Учётная запись недоступна", lessons: row.week.lessons.length })) };
  } catch (error) { console.error("Не удалось прочитать архив публикаций расписания:", error); throw error; }
};
export const previewManagedScheduleRestoration = async (command: PublicationArchiveScope & { publicationId: string }) => {
  try {
    const { snapshot, versions } = readManagedScheduleContext(command.actorId); checkArchiveScope(command);
    const record = snapshot.publications?.find(row => row.id === command.publicationId && row.week.groupId === command.groupId && row.week.weekStart === command.weekStart);
    if (!record) throw new Error("Версия публикации недоступна. Обновите архив.");
    const working = getManagedScheduleWeek(snapshot, command.weekStart, command.groupId), calendars = readGroupCalendarsDocument();
    let canRestore = true;
    const issues: string[] = [];
    const group = ACADEMIC_GROUPS.find(row => row.id === command.groupId)!;
    if (!isGroupActive(group)) { canRestore = false; issues.push("Группа в архиве. Версию можно сравнить, восстановление недоступно."); }
    try { assertCalendarDatesEditable(calendars, command.groupId, [...working.lessons, ...record.week.lessons].map(lesson => lesson.date)); }
    catch (error) { if (!(error instanceof Error)) throw error; canRestore = false; issues.push(error.message); }
    try { validateWeek(record.week, snapshot, true); }
    catch (error) { if (!(error instanceof Error)) throw error; issues.push(...error.message.split("\n")); }
    return { ...compareSchedulePublication(working.lessons, record.week.lessons), versions, publicationId: record.id, number: record.number, origin: record.origin, canRestore, issues: [...new Set(issues)], lessons: structuredClone(record.week.lessons), workingCount: working.lessons.length };
  } catch (error) { console.error("Не удалось сравнить архивную публикацию с рабочей неделей:", error); throw error; }
};
export type ScheduleRestorationPreview = Awaited<ReturnType<typeof previewManagedScheduleRestoration>>;
export const verifyManagedScheduleRestoration = async (command: PublicationArchiveScope & { publicationId: string; versions: ManagedScheduleVersions }) => {
  try {
    const preview = await previewManagedScheduleRestoration(command);
    if (!sameManagedScheduleVersions(command.versions, preview.versions)) throw new Error("Источники изменились после сравнения. Повторите просмотр перед восстановлением.");
    if (!preview.canRestore) throw new Error(preview.issues.join("\n") || "Восстановление этой версии сейчас недоступно.");
    return preview.lessons;
  } catch (error) { console.error("Не удалось проверить восстановление публикации в рабочую неделю:", error); throw error; }
};

export interface ManagedScheduleService {
  read(): Promise<ManagedScheduleRead>;
  saveDraft(command: ScheduleCommand & { lessons: ManagedLesson[] }): Promise<ManagedScheduleSnapshot>;
  publishDraft(command: ScheduleCommand): Promise<ManagedScheduleSnapshot>;
}
export const managedScheduleService: ManagedScheduleService = { read: async () => readManagedScheduleState(), saveDraft: saveManagedScheduleDraft, publishDraft: publishManagedScheduleDraft };
