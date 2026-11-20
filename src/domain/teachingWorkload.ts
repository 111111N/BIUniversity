import type { PortalAccount } from "./accounts";
import { sameTeachingData, type TeachingAssignment, type TeachingAssignmentsDocument } from "./teachingAssignments";
import type { CurriculaDocument } from "./curriculumTypes";
import { lessonTypeLabels, type LessonType } from "./academic";

const hourKeys = { lecture: "lectures", practice: "practices", laboratory: "labs" } as const;
export interface TeachingWorkloadRow {
  id: string; subjectName: string; groupName: string; periodName: string; planName: string; planNumber: number;
  type: LessonType; hours: number; shared: boolean; academicHourMinutes: number;
}
/** Hours belong to a group and type. Multiple teachers need an explicit split, never an invented equal share. */
export const calculateTeachingWorkload = (teacherId: string, teachers: PortalAccount[], teaching: TeachingAssignmentsDocument, curricula: CurriculaDocument, labels?: { subjects: Record<string, string>; groups: Record<string, string> }) => {
  const teacher = teachers.find(row => row.id === teacherId && row.role === "teacher");
  const rows: TeachingWorkloadRow[] = [], unresolved: string[] = [];
  if (!teacher) return { rows, unresolved: ["Учётная запись преподавателя недоступна."], hours: 0, sharedHours: 0, totalsByMinutes: [] as Array<{ minutes: number; hours: number }> };
  const bindings = new Map(curricula.bindings.map(row => [row.group.id, row])), plans = new Map(curricula.plans.map(row => [row.id, row]));
  const scopes = new Map(teaching.assignments.map(row => [JSON.stringify([row.teacherId, row.subjectId, row.groupId]), row])), scopesByOffering = new Map<string, TeachingAssignment[]>(), teachersByOffering = new Map<string, PortalAccount[]>();
  teaching.assignments.forEach(row => { const key = JSON.stringify([row.subjectId, row.groupId]), entries = scopesByOffering.get(key) ?? []; entries.push(row); scopesByOffering.set(key, entries); });
  teachers.filter(row => row.role === "teacher").forEach(row => row.memberships.forEach(membership => membership.groupIds.forEach(groupId => { const key = JSON.stringify([membership.subjectId, groupId]), entries = teachersByOffering.get(key) ?? []; entries.push(row); teachersByOffering.set(key, entries); })));
  for (const membership of teacher.memberships) for (const groupId of membership.groupIds) {
    const binding = bindings.get(groupId), plan = binding && plans.get(binding.planId);
    if (!binding || !plan || plan.state !== "published") { unresolved.push(`${labels?.subjects[membership.subjectId] ?? "Дисциплина"} · ${labels?.groups[groupId] ?? "группа без сохранённых реквизитов"}: опубликованный план группы не назначен.`); continue; }
    if (!binding.periods.length) { unresolved.push(`${plan.name} · ${binding.group.name}: календарные семестры плана не назначены.`); continue; }
    for (const period of binding.periods) {
      const entry = plan.entries.find(row => row.subject.id === membership.subjectId && row.semester === period.semester);
      if (!entry) continue;
      const offeringKey = JSON.stringify([membership.subjectId, groupId]), applicable = scopesByOffering.get(offeringKey) ?? [];
      const inconsistent = applicable.some(row => row.periods.some(item => item.period.term.id === period.period.term.id && (!sameTeachingData(item.period.year, period.period.year) || !sameTeachingData(item.period.term, period.period.term))));
      if (inconsistent) { unresolved.push(`${entry.subject.name} · ${binding.group.name} · ${period.period.term.name}: снимки периода назначения и плана различаются. Нагрузку нужно перепроверить.`); continue; }
      for (const type of Object.keys(lessonTypeLabels) as LessonType[]) {
        const scope = scopes.get(JSON.stringify([teacher.id, membership.subjectId, groupId]));
        const overlaps = (candidate: PortalAccount) => {
          const record = scopes.get(JSON.stringify([candidate.id, membership.subjectId, groupId]));
          return !record || record.mode === "general" || record.periods.some(item => item.types.includes(type) && item.period.term.startsOn <= period.period.term.endsOn && item.period.term.endsOn >= period.period.term.startsOn);
        };
        const covers = !scope || scope.mode === "general" || scope.periods.some(item => item.types.includes(type) && item.period.term.startsOn <= period.period.term.startsOn && item.period.term.endsOn >= period.period.term.endsOn);
        if (!covers) { if (overlaps(teacher)) unresolved.push(`${entry.subject.name} · ${binding.group.name} · ${lessonTypeLabels[type]}: назначение покрывает только часть семестра; часы не распределены.`); continue; }
        const hours = entry.hours[hourKeys[type]];
        if (!hours) continue;
        const shared = (teachersByOffering.get(offeringKey) ?? []).some(row => row.id !== teacherId && overlaps(row));
        rows.push({ id: JSON.stringify([groupId, membership.subjectId, period.period.term.id, type]), subjectName: entry.subject.name, groupName: binding.group.name, periodName: `${period.period.year.name} · ${period.period.term.name}`, planName: plan.name, planNumber: plan.number, type, hours, shared, academicHourMinutes: plan.academicHourMinutes });
      }
    }
  }
  const centihours = rows.filter(row => !row.shared).reduce((sum, row) => sum + Math.round(row.hours * 100), 0);
  const totals = new Map<number, number>();
  rows.filter(row => !row.shared).forEach(row => totals.set(row.academicHourMinutes, (totals.get(row.academicHourMinutes) ?? 0) + Math.round(row.hours * 100)));
  return { rows, unresolved: [...new Set(unresolved)], hours: centihours / 100, sharedHours: rows.filter(row => row.shared).reduce((sum, row) => sum + Math.round(row.hours * 100), 0) / 100, totalsByMinutes: [...totals].map(([minutes, value]) => ({ minutes, hours: value / 100 })) };
};
export const teachingWorkloadSummary = (source: { data?: ReturnType<typeof calculateTeachingWorkload>; error: string } | null) => {
  const data = source?.data;
  if (!source) return { value: "—", caption: "Расчёт нагрузки…" };
  if (source.error || !data) return { value: "—", caption: "Нагрузка недоступна" };
  if (!data.rows.length) return { value: "—", caption: "Нагрузка по планам пока не определена" };
  if (data.totalsByMinutes.length > 1) return { value: "—", caption: "Разная длительность часа; см. учебный план" };
  if (!data.totalsByMinutes.length) return { value: "—", caption: "Доли совместного ведения не заданы" };
  const total = data.totalsByMinutes[0];
  return { value: total.hours.toLocaleString("ru-RU"), caption: data.sharedHours > 0 || data.unresolved.length ? "Подтверждённые часы; итог неполный" : `академических часов по ${total.minutes} мин` };
};
