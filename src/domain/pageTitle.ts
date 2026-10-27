import type { UserRole } from "../components/RoleContext";
import { getAcademicSubjectDefinition } from "../data/academicCatalog";

export const getPortalPageTitle = (pathname: string, role: UserRole) => {
  const path = pathname.replace(/\/+$/, "") || "/";
  let title: string;
  if (path.startsWith("/journal/")) {
    const subject = getAcademicSubjectDefinition(path.split("/")[2]);
    title = subject ? `${subject.name} — Журнал` : "Журнал";
  } else if (path.startsWith("/students/")) title = "Профиль студента";
  else if (path.startsWith("/teachers/")) title = "Профиль преподавателя";
  else {
    const pages: Record<string, string> = { "/": role === "configurator" ? "Настройка расписания" : "Главная", "/admin/schedule": "Настройка расписания", "/admin/accounts": "Учётные записи", "/admin/checks": "Проверка данных", "/schedule": "Расписание", "/planner": "Планировщик", "/journal": "Журнал", "/stats": "Статистика", "/messages": "Сообщения", "/notifications": "Уведомления", "/cabinet": role === "student" ? "Мой профиль" : "Кабинет преподавателя" };
    title = path.startsWith("/admin/students/") ? "История обучения" : path === "/admin/students" ? "Реестр студентов" : path === "/admin/teachers" ? "Реестр преподавателей" : path === "/admin/accounts/import" ? "Импорт студентов" : path === "/admin/groups" ? "Учебные группы" : path === "/admin/subjects" ? "Дисциплины" : pages[path] ?? "Страница не найдена";
  }
  return `${title} · BIUniversity`;
};
