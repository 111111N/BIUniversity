import { useCallback, useEffect, useState } from "react";
import { subscribeAssignmentStore } from "./assignmentStore";
import { readAssignmentState } from "./assignmentData";
import { getJournalViewSnapshot, journalKey, subscribeJournalStore } from "./journalStore";
import { getDemoWeekSchedule, getPersonalSchedule } from "./schedule";
import { toLocalDateKey } from "../domain/schedule";
import {
  calculateDashboardJournalMetrics,
  type DashboardJournal,
  type DashboardMembership,
} from "../domain/dashboard";
import { ACADEMIC_GROUPS, refreshAcademicCatalog } from "./academicCatalog";
import { getStudentDashboardTasks } from "../domain/dashboardAssignments";
import { getAssignmentHref } from "../domain/journalNavigation";
import { getSubmissionStatus } from "../domain/assignments";
import { createSubjectLessons } from "./lessons";
import { readManagedScheduleState, subscribeManagedSchedule } from "./managedScheduleStore";
import { readAccountsState, subscribeAccounts } from "./accountStore";
import { subscribeSubjectCatalog } from "./subjectCatalogStore";
import type { CurrentUser } from "../domain/accounts";

export const useDashboardRefresh = () => {
  const [now, setNow] = useState(() => new Date());
  const refresh = useCallback(() => setNow(new Date()), []);
  useEffect(() => {
    const unsubscribeAssignments = subscribeAssignmentStore(refresh);
    const unsubscribeJournal = subscribeJournalStore(refresh);
    const unsubscribeSchedule = subscribeManagedSchedule(refresh);
    const unsubscribeAccounts = subscribeAccounts(refresh);
    const unsubscribeCatalog = subscribeSubjectCatalog(refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      unsubscribeAssignments();
      unsubscribeJournal();
      unsubscribeSchedule();
      unsubscribeAccounts();
      unsubscribeCatalog();
      window.clearInterval(timer);
    };
  }, [refresh]);
  return { now, refresh };
};

export const useDashboardUpdate = () => useDashboardRefresh().now;

const readDashboardSources = (memberships: DashboardMembership[], now: Date, studentId?: string) => {
  const catalogError = refreshAcademicCatalog().error;
  const schedule = readManagedScheduleState();
  const assignments = readAssignmentState();
  const assignmentError = catalogError ? "Учебный каталог недоступен. Список заданий временно недоступен." : assignments.error ? "Не удалось прочитать задания и ответы." : "";
  const scheduleError = catalogError || schedule.error ? "Расписание временно недоступно." : "";
  let journal: ReturnType<typeof calculateDashboardJournalMetrics> | null = null;
  let journalError = "";
  try {
    if (catalogError || schedule.error) throw new Error(catalogError || schedule.error);
    const accounts = readAccountsState();
    if (accounts.error) throw new Error(accounts.error);
    const journals: DashboardJournal[] = memberships.flatMap((membership) => membership.groupIds.map((groupId) => {
      const lessons = createSubjectLessons(membership.subjectId, groupId, now.getTime(), schedule.snapshot.journal);
      const students = getJournalViewSnapshot(localStorage.getItem(journalKey(membership.subjectId, groupId)), membership.subjectId, groupId, { lessons, accounts: accounts.accounts });
      if (!students) throw new Error("Сохранённый журнал повреждён");
      return { subjectId: membership.subjectId, groupId, lessons, students };
    }));
    journal = calculateDashboardJournalMetrics(journals, studentId);
  } catch (error) {
    console.error("Не удалось рассчитать журнальные показатели главной страницы:", error);
    journalError = "Не удалось прочитать данные для показателей журнала.";
  }
  return { assignments, journal, schedule, errors: { assignments: assignmentError, journal: journalError, schedule: scheduleError } };
};

export const getStudentDashboard = ({
  studentId,
  memberships,
  now,
  studentGroupId,
}: {
  studentId: string;
  memberships: DashboardMembership[];
  now: Date;
  studentGroupId?: string;
}) => {
  const groupId = studentGroupId ?? memberships[0]?.groupIds[0];
  const { assignments, journal, schedule, errors } = readDashboardSources(memberships, now, studentId);
  const groupName = ACADEMIC_GROUPS.find((group) => group.id === groupId)?.name;
  const tasks = errors.assignments ? [] : getStudentDashboardTasks(assignments.assignments, assignments.submissions, memberships, studentId, now);
  const weekSchedule = errors.schedule ? [] : getPersonalSchedule(getDemoWeekSchedule(now, schedule), { id: studentId, role: "student", memberships });
  const todaySchedule = weekSchedule.filter((lesson) => lesson.date === toLocalDateKey(now));
  const nextTask = tasks.find((task) => task.canSubmit);

  return {
    groupName: groupName ?? "Группа не указана",
    errors,
    weekLessons: errors.schedule ? null : weekSchedule.length,
    todayLessons: errors.schedule ? null : todaySchedule.length,
    activeAssignments: errors.assignments ? null : tasks.filter((task) => task.canSubmit).length,
    awaitingReview: errors.assignments ? null : tasks.filter((task) => task.state === "submitted" || task.state === "resubmitted").length,
    tasks,
    attendance: journal?.attendance ?? null,
    averageGrade: journal?.averageGrade ?? null,
    gradesCount: journal?.gradesCount ?? null,
    nextAction: nextTask ? {
      title: nextTask.state === "revision" ? "Исправить работу по комментарию" : nextTask.overdue ? "Сдать работу с опозданием" : "Ближайший учебный дедлайн",
      description: `${nextTask.subject} · ${nextTask.title}. ${nextTask.deadline}`,
      href: nextTask.href,
    } : null,
  };
};

export const getTeacherDashboard = ({ memberships, now, teacher }: { memberships: DashboardMembership[]; now: Date; teacher?: CurrentUser }) => {
  const source = readDashboardSources(memberships, now);
  const { journal, errors } = source;
  const schedule = errors.schedule ? [] : getPersonalSchedule(getDemoWeekSchedule(now, source.schedule), teacher ?? "teacher");
  const today = schedule.filter((lesson) => lesson.date === toLocalDateKey(now));
  const nowTime = now.getTime();
  const conducted = today.filter((lesson) => new Date(`${lesson.date}T${lesson.endTime}:00`).getTime() <= nowTime).length;
  const assignments = errors.assignments ? [] : source.assignments.assignments.filter((assignment) => memberships.some((membership) => membership.subjectId === assignment.subjectId && membership.groupIds.includes(assignment.groupId)));
  const submissions = source.assignments.submissions.filter((submission) => {
    const assignment = assignments.find((item) => item.id === submission.assignmentId);
    return assignment !== undefined;
  });
  const pendingAnswers = submissions.filter((submission) => getSubmissionStatus(submission) === "submitted");
  const pendingReview = pendingAnswers.length;
  const firstReviewAssignment = assignments.find((assignment) => assignment.id === pendingAnswers[0]?.assignmentId);
  const firstDraft = assignments.find((assignment) => assignment.status === "draft");
  const firstWithoutAnswers = assignments.find((assignment) => assignment.status === "published" && !submissions.some((submission) => submission.assignmentId === assignment.id));
  const drafts = assignments.filter((assignment) => assignment.status === "draft").length;
  const assignmentsWithoutAnswers = assignments.filter((assignment) =>
    assignment.status === "published" && !submissions.some((submission) => submission.assignmentId === assignment.id),
  ).length;
  const focus = [
    pendingReview ? {
      level: "urgent" as const,
      title: `Работ на проверку: ${pendingReview}`,
      description: "Ответы студентов готовы к обратной связи",
      action: "Проверить",
      href: firstReviewAssignment ? getAssignmentHref(firstReviewAssignment, pendingAnswers[0].id) : "/journal",
    } : null,
    journal?.unmarked ? {
      level: "warning" as const,
      title: `В журналах не заполнено ${journal.unmarked} отметок`,
      description: "Данные рассчитаны по доступным дисциплинам и группам",
      action: "Заполнить",
      href: "/journal",
    } : null,
    drafts ? {
      level: "normal" as const,
      title: `${drafts} ${drafts === 1 ? "задание осталось" : "задания остались"} в черновиках`,
      description: "Опубликуйте их, когда материалы будут готовы",
      action: "Открыть",
      href: firstDraft ? getAssignmentHref(firstDraft) : "/journal",
    } : assignmentsWithoutAnswers ? {
      level: "normal" as const,
      title: `По ${assignmentsWithoutAnswers} заданиям пока нет ответов`,
      description: "Можно проверить сроки и напомнить группе",
      action: "Посмотреть",
      href: firstWithoutAnswers ? getAssignmentHref(firstWithoutAnswers) : "/journal",
    } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    errors,
    scheduleSource: source.schedule,
    todayLessons: errors.schedule ? null : today.length,
    conductedLessons: errors.schedule ? null : conducted,
    attendanceMarked: journal?.attendanceMarked ?? null,
    gradesCount: journal?.gradesCount ?? null,
    journalCells: journal?.totalCells ?? null,
    gradeCells: journal?.gradeCells ?? null,
    focus,
  };
};
