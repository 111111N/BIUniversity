import { useEffect, useState } from "react";
import { getAssignments, getSubmissions, subscribeAssignmentStore } from "./assignmentStore";
import { getJournalSnapshot, subscribeJournalStore } from "./journalStore";
import { getDemoWeekSchedule, getPersonalSchedule } from "./schedule";
import { toLocalDateKey } from "../domain/schedule";
import {
  calculateDashboardJournalMetrics,
  type DashboardJournal,
  type DashboardMembership,
} from "../domain/dashboard";
import { getAcademicGroup } from "./academicCatalog";
import { getStudentDashboardTasks } from "../domain/dashboardAssignments";
import { getAssignmentHref } from "../domain/journalNavigation";
import { getSubmissionStatus } from "../domain/assignments";
import { createSubjectLessons } from "./lessons";

export const useDashboardUpdate = () => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const unsubscribeAssignments = subscribeAssignmentStore(refresh);
    const unsubscribeJournal = subscribeJournalStore(refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      unsubscribeAssignments();
      unsubscribeJournal();
      window.clearInterval(timer);
    };
  }, []);
  return now;
};

const readJournal = (subjectId: string, groupId: string): DashboardJournal => {
  return { subjectId, groupId, students: getJournalSnapshot(subjectId, groupId), lessons: createSubjectLessons(subjectId, groupId) };
};

const readMembershipJournals = (memberships: DashboardMembership[]) => memberships.flatMap(
  (membership) => membership.groupIds.map((groupId) => readJournal(membership.subjectId, groupId)),
);

export const getStudentDashboard = ({
  studentId,
  memberships,
  now,
}: {
  studentId: string;
  memberships: DashboardMembership[];
  now: Date;
}) => {
  const groupId = memberships[0]?.groupIds[0];
  const groupName = getAcademicGroup(groupId)?.name;
  const journals = readMembershipJournals(memberships);
  const journal = calculateDashboardJournalMetrics(journals, studentId);
  const tasks = getStudentDashboardTasks(getAssignments(), getSubmissions(), memberships, studentId, now);
  const weekSchedule = getPersonalSchedule(getDemoWeekSchedule(now), "student");
  const todaySchedule = weekSchedule.filter((lesson) => lesson.date === toLocalDateKey(now));
  const nextTask = tasks.find((task) => task.canSubmit);

  return {
    groupName: groupName ?? "Группа не указана",
    weekLessons: weekSchedule.length,
    todayLessons: todaySchedule.length,
    activeAssignments: tasks.filter((task) => task.canSubmit).length,
    awaitingReview: tasks.filter((task) => task.state === "submitted" || task.state === "resubmitted").length,
    tasks,
    attendance: journal.attendance,
    averageGrade: journal.averageGrade,
    gradesCount: journal.gradesCount,
    nextAction: nextTask ? {
      title: nextTask.state === "revision" ? "Исправить работу по комментарию" : nextTask.overdue ? "Сдать работу с опозданием" : "Ближайший учебный дедлайн",
      description: `${nextTask.subject} · ${nextTask.title}. ${nextTask.deadline}`,
      href: nextTask.href,
    } : null,
  };
};

export const getTeacherDashboard = ({ memberships, now }: { memberships: DashboardMembership[]; now: Date }) => {
  const schedule = getPersonalSchedule(getDemoWeekSchedule(now), "teacher");
  const today = schedule.filter((lesson) => lesson.date === toLocalDateKey(now));
  const nowTime = now.getTime();
  const conducted = today.filter((lesson) => new Date(`${lesson.date}T${lesson.endTime}:00`).getTime() <= nowTime).length;
  const journal = calculateDashboardJournalMetrics(readMembershipJournals(memberships));
  const assignments = getAssignments().filter((assignment) => memberships.some((membership) => membership.subjectId === assignment.subjectId && membership.groupIds.includes(assignment.groupId)));
  const submissions = getSubmissions().filter((submission) => {
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
    journal.unmarked ? {
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
    todayLessons: today.length,
    conductedLessons: conducted,
    attendanceMarked: journal.attendanceMarked,
    gradesCount: journal.gradesCount,
    journalCells: journal.totalCells,
    gradeCells: journal.gradeCells,
    focus,
  };
};
