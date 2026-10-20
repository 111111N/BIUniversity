import type { Assignment } from "../data/assignmentStore";
import { isAcademicMembershipMatch, type AcademicMembership } from "../data/academicCatalog";

export type AssignmentForm = Pick<Assignment, "subject" | "group" | "lessonDate" | "lessonType" | "title" | "description" | "deadline" | "status" | "allowLateSubmissions">;

export const getAssignmentFormError = (form: AssignmentForm, memberships: AcademicMembership[]) => {
  if (!form.title.trim() || !form.description.trim()) return "Укажите название и описание задания — не только пробелы.";
  const lesson = Date.parse(form.lessonDate);
  const deadline = Date.parse(form.deadline);
  if (!Number.isFinite(lesson) || !Number.isFinite(deadline)) return "Выберите дату занятия и срок сдачи.";
  if (deadline < lesson) return "Срок сдачи не может быть раньше даты занятия.";
  if (!isAcademicMembershipMatch(memberships, form.subject, form.group)) return "Предмет или группа не назначены вашему профилю.";
  return "";
};

export const getAssignmentVisibility = (status: Assignment["status"]) => status === "published" ? "Студенты увидят задание и смогут отправлять ответы." : status === "closed" ? "Студенты увидят задание и историю ответов, но новые ответы не принимаются." : status === "draft" ? "Черновик виден только преподавателю. Для сдачи его нужно опубликовать." : "Задание будет в архиве преподавателя и не будет видно студентам.";
