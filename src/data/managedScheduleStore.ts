import { createEmptyManagedSchedule, decodeManagedSchedule, findScheduleConflicts, getManagedWeekKey, MANAGED_SCHEDULE_KEY, reconcilePublishedJournal, snapshotHasFutureTeaching, validateManagedLesson, type ManagedLesson, type ManagedScheduleSnapshot, type ManagedScheduleWeek } from "../domain/scheduleManagement";
import { ACADEMIC_GROUPS, getAcademicGroupByName, getAcademicSubjectByName, refreshAcademicCatalog, SUBJECT_GROUP_OFFERINGS } from "./academicCatalog";
import { readAccountsState } from "./accountStore";
import { createDemoWeekSchedule } from "./demoSchedule";
import { parseCalendarDate } from "../domain/calendar";
import { executeAdministrationWrite } from "./administrationWrite";

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
  const state = readAccountsState();
  return state.accounts.filter((account) => account.role === "teacher").map((account) => ({ id: account.id, name: account.scheduleName || account.name, memberships: account.memberships }));
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
export const getManagedWeekConflicts = (snapshot: ManagedScheduleSnapshot, week: ManagedScheduleWeek) => findScheduleConflicts(week.lessons, getOtherPublishedLessons(snapshot, week.weekStart, week.groupId));

interface ScheduleCommand { actorId: string; expectedRevision: number; weekStart: string; groupId: string }
const updateSnapshot = async (command: ScheduleCommand, mutate: (snapshot: ManagedScheduleSnapshot) => ManagedScheduleSnapshot): Promise<ManagedScheduleSnapshot> => {
  try {
    return await executeAdministrationWrite(() => {
      if (refreshAcademicCatalog().error) throw new Error("Каталог дисциплин недоступен. Изменение расписания остановлено.");
      const accounts = readAccountsState();
      if (accounts.error) throw new Error("Справочник учётных записей недоступен. Изменение расписания остановлено.");
      if (accounts.accounts.find((account) => account.id === command.actorId)?.role !== "configurator") throw new Error("Изменять расписание может только настройщик с актуальным доступом.");
      const { snapshot, error } = readManagedScheduleState();
      if (error) throw new Error(error);
      if (snapshot.revision !== command.expectedRevision) throw new Error("Расписание изменено в другой вкладке. Обновите данные и повторите действие.");
      if (getManagedWeekKey(command.weekStart) !== command.weekStart || !ACADEMIC_GROUPS.some((group) => group.id === command.groupId)) throw new Error("Выберите корректную неделю и группу.");
      const next = mutate(snapshot);
      next.revision = snapshot.revision + 1;
      if (!decodeManagedSchedule(JSON.stringify(next))) throw new Error("Не удалось проверить целостность расписания. Ничего не сохранено.");
      localStorage.setItem(MANAGED_SCHEDULE_KEY, JSON.stringify(next));
      if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
      return next;
    });
  } catch (error) {
    console.error("Не удалось сохранить или опубликовать расписание.", error);
    throw error instanceof Error ? error : new Error("Не удалось изменить расписание. Повторите попытку.");
  }
};
const validateWeek = (week: ManagedScheduleWeek, snapshot: ManagedScheduleSnapshot, publishing: boolean) => {
  const errors = week.lessons.flatMap((lesson) => validateManagedLesson(lesson));
  if (week.lessons.some((lesson) => !SUBJECT_GROUP_OFFERINGS.some((offering) => offering.subjectId === lesson.subjectId && offering.groupId === lesson.groupId))) errors.push("Предмет не назначен выбранной группе.");
  if (week.lessons.some((lesson) => lesson.groupId !== week.groupId || getManagedWeekKey(lesson.date) !== week.weekStart)) errors.push("Все занятия должны относиться к выбранной неделе и группе.");
  const teachers = getManagedScheduleTeachers();
  week.lessons.forEach((lesson) => {
    const teacher = teachers.find((account) => account.id === lesson.teacherId);
    if (!teacher || !teacher.memberships.some((membership) => membership.subjectId === lesson.subjectId && membership.groupIds.includes(lesson.groupId))) errors.push(`${lesson.date}: преподаватель не назначен на предмет и группу.`);
  });
  const used = [...snapshot.published, ...snapshot.drafts].filter((entry) => entry.weekStart !== week.weekStart || entry.groupId !== week.groupId).flatMap((entry) => entry.lessons);
  if (week.lessons.some((lesson) => used.some((entry) => entry.id === lesson.id || entry.scheduleId === lesson.scheduleId))) errors.push("Занятие уже используется в другой неделе. Для копирования создайте новый идентификатор.");
  if (new Set(week.lessons.map((lesson) => lesson.id)).size !== week.lessons.length || new Set(week.lessons.map((lesson) => lesson.scheduleId)).size !== week.lessons.length) errors.push("В расписании повторяются идентификаторы занятий.");
  if (week.lessons.some((lesson) => snapshot.journal.some((entry) => (entry.id === lesson.id && entry.scheduleId !== lesson.scheduleId) || (entry.scheduleId === lesson.scheduleId && entry.id !== lesson.id)))) errors.push("Идентификатор занятия уже связан с другой записью журнала.");
  if (publishing) errors.push(...getManagedWeekConflicts(snapshot, week).map((conflict) => conflict.message));
  if (errors.length) throw new Error([...new Set(errors)].join("\n"));
};
export const saveManagedScheduleDraft = async (command: ScheduleCommand & { lessons: ManagedLesson[] }) => updateSnapshot(command, (snapshot) => {
  const week = { weekStart: command.weekStart, groupId: command.groupId, lessons: structuredClone(command.lessons), updatedBy: command.actorId, updatedAt: new Date().toISOString() };
  validateWeek(week, snapshot, false);
  return { ...snapshot, drafts: [...snapshot.drafts.filter((entry) => entry.weekStart !== week.weekStart || entry.groupId !== week.groupId), week] };
});
export const publishManagedScheduleDraft = async (command: ScheduleCommand) => updateSnapshot(command, (snapshot) => {
  const week = snapshot.drafts.find((entry) => entry.weekStart === command.weekStart && entry.groupId === command.groupId);
  if (!week) throw new Error("Сначала сохраните черновик выбранной недели.");
  validateWeek(week, snapshot, true);
  const previous = snapshot.published.find((entry) => entry.weekStart === command.weekStart && entry.groupId === command.groupId)?.lessons ?? [];
  return { ...snapshot,
    drafts: snapshot.drafts.filter((entry) => entry !== week),
    published: [...snapshot.published.filter((entry) => entry.weekStart !== week.weekStart || entry.groupId !== week.groupId), { ...week, publishedBy: command.actorId, publishedAt: new Date().toISOString() }],
    journal: reconcilePublishedJournal(snapshot.journal, previous, week.lessons),
  };
});

export interface ManagedScheduleService {
  read(): Promise<ManagedScheduleRead>;
  saveDraft(command: ScheduleCommand & { lessons: ManagedLesson[] }): Promise<ManagedScheduleSnapshot>;
  publishDraft(command: ScheduleCommand): Promise<ManagedScheduleSnapshot>;
}
export const managedScheduleService: ManagedScheduleService = { read: async () => readManagedScheduleState(), saveDraft: saveManagedScheduleDraft, publishDraft: publishManagedScheduleDraft };
