import { SUBJECTS, getAcademicGroup, getAcademicSubjectDefinition } from "./academicCatalog";
import { appendLearningDemoRecords, deleteAssignmentFile, getAssignments, getSubmissions, saveAssignmentFile } from "./assignmentStore";
import { createLearningDemo, createPlannerDemo } from "./demo/learning";
import { materialRepository } from "./materialRepository";
import { appendPlannerDemoNotes } from "./plannerStore";
import { addNotification } from "./notificationStore";
import { getAssignmentHref } from "../domain/journalNavigation";
import { getSubmissionAttempts } from "../domain/assignments";
import { appendJournalDemoRecords } from "./journalStore";
import type { JournalActor } from "./journalStore";

export interface DemoImportResult { assignments: number; submissions: number; tasks: number; materials: number; journals: number; journalCells: number; grades: number; warnings: string[] }
export interface DemoImportOptions { journalActor?: JournalActor }

const runDemoImport = async (anchor: Date, options: DemoImportOptions): Promise<DemoImportResult> => {
  const result: DemoImportResult = { assignments: 0, submissions: 0, tasks: 0, materials: 0, journals: 0, journalCells: 0, grades: 0, warnings: [] };
  const actor = options.journalActor;
  if (actor) {
    const visited = new Set<string>();
    for (const membership of actor.memberships ?? []) {
      for (const groupId of membership.groupIds) {
        const key = `${membership.subjectId}:${groupId}`;
        if (visited.has(key)) continue;
        visited.add(key);
        try {
          const added = appendJournalDemoRecords(membership.subjectId, groupId, actor);
          result.journals += added.journals;
          result.journalCells += added.cells;
          result.grades += added.grades;
        } catch {
          result.warnings.push(`Отметки «${getAcademicSubjectDefinition(membership.subjectId)?.shortName ?? membership.subjectId} · ${getAcademicGroup(groupId)?.name ?? groupId}» не добавлены. Журнал или история недоступны; сохранённые данные не перезаписаны.`);
        }
      }
    }
  }
  const generatedFiles: string[] = [];
  const usedFileIds = () => {
    // Public readers intentionally fall back to defaults on invalid storage.
    // Cleanup must not interpret that fallback as proof a file is unused.
    for (const key of ["bi-university-demo-assignments", "bi-university-demo-submissions"]) {
      const raw = localStorage.getItem(key);
      if (raw !== null && !Array.isArray(JSON.parse(raw))) throw new Error("Не удалось проверить ссылки на файлы");
    }
    return new Set([
      ...getAssignments().flatMap((item) => item.attachmentId ? [item.attachmentId] : []),
      ...getSubmissions().flatMap((item) => getSubmissionAttempts(item).flatMap((attempt) => attempt.attachmentId ? [attempt.attachmentId] : [])),
    ]);
  };
  const cleanupUnusedFiles = async () => {
    if (!generatedFiles.length) return;
    try {
      // Never delete an attachment unless persisted references can be read safely.
      const used = usedFileIds();
      const cleanup = await Promise.allSettled(generatedFiles.filter((id) => !used.has(id)).map(deleteAssignmentFile));
      if (cleanup.some((item) => item.status === "rejected")) result.warnings.push("Не удалось удалить часть временных файлов импорта. Сохранённые вложения не затронуты.");
    } catch { result.warnings.push("Очистка временных файлов отложена: не удалось проверить сохранённые вложения."); }
  };
  try {
    const pack = createLearningDemo(anchor);
    const existingIds = new Set(getAssignments().map((item) => item.id));
    const newAssignments = pack.assignments.filter((item) => !existingIds.has(item.id));
    // Real small UTF-8 files: download actions work without remote assets or fake PDF links.
    for (const assignment of newAssignments.filter((item) => item.groupId === "112-mko" && item.status === "published")) {
      const name = `${assignment.title}.txt`;
      const id = await saveAssignmentFile(new File([`${assignment.title}\n${assignment.subject} · ${assignment.group}\n\n${assignment.description}\n\nЭто учебный демонстрационный файл.`], name, { type: "text/plain;charset=utf-8" }));
      generatedFiles.push(id);
      assignment.attachmentId = id;
      assignment.attachmentName = name;
    }
    const newIds = new Set(newAssignments.map((item) => item.id));
    for (const submission of pack.submissions.filter((item) => newIds.has(item.assignmentId) && item.studentId === "anna-smirnova" && item.status === "submitted")) {
      const name = "Решение — повторная попытка.txt";
      const id = await saveAssignmentFile(new File([submission.text], name, { type: "text/plain;charset=utf-8" }));
      generatedFiles.push(id);
      submission.attachmentId = id;
      submission.attachmentName = name;
      const current = submission.attempts?.[submission.attempts.length - 1];
      if (current) { current.attachmentId = id; current.attachmentName = name; }
    }
    const added = appendLearningDemoRecords(newAssignments, pack.submissions);
    result.assignments = added.assignments;
    result.submissions = added.submissions;
  } catch {
    result.warnings.push("Не удалось добавить задания и ответы. Проверьте доступ к хранилищу браузера.");
  } finally { await cleanupUnusedFiles(); }
  try { result.tasks = appendPlannerDemoNotes(createPlannerDemo(anchor)); }
  catch { result.warnings.push("Задачи не добавлены: проверьте хранилище планировщика."); }

  for (const subject of SUBJECTS) {
    const scope = `group:${subject.id}:112-mko`;
    try {
      const existing = new Set((await materialRepository.list(scope)).map((file) => file.id));
      const templates = [
        { key: "notes", title: "Краткий конспект", category: "Конспект", text: "Основные определения\n\nЗапишите ключевые понятия темы, сопоставьте формулы с примерами и проверьте ограничения их применения.\n\nПосле занятия: решите два примера самостоятельно и подготовьте вопросы." },
        { key: "practice", title: "Сборник тренировочных заданий", category: "Сборник заданий", text: "Практикум\n\n1. Приведите пример применения метода.\n2. Решите задачу своего варианта.\n3. Объясните результат.\n4. Найдите ошибку в альтернативном решении.\n\nНомер варианта совпадает с номером в списке группы." },
        { key: "checklist", title: "Памятка по оформлению работы", category: "Другое", text: "Перед отправкой\n\n□ Указаны группа и автор.\n□ Видны промежуточные вычисления.\n□ Есть итоговый вывод.\n□ Проверены название файла и срок сдачи.\n\nЭто демонстрационные материалы, не официальные требования университета." },
      ];
      for (const [index, template] of templates.entries()) {
        const id = `demo-expanded-v1:material:${subject.id}:${template.key}`;
        if (existing.has(id)) continue;
        const blob = new Blob([`${subject.name}\n112-МКо\n\n${template.text}`], { type: "text/plain;charset=utf-8" });
        await materialRepository.save({ id, name: `${template.title} — ${subject.shortName}.txt`, type: blob.type, size: blob.size, blob, scope, category: template.category, description: "Демонстрационный материал для знакомства с интерфейсом.", pinned: index === 0, uploadedBy: "Елена Волкова", createdAt: anchor.getTime() - index * 86400_000 });
        result.materials++;
      }
    } catch { result.warnings.push(`Материалы «${subject.name}» добавлены не полностью. Можно повторить импорт.`); }
  }
  if (result.assignments) {
    try {
      const assignments = getAssignments();
      for (const subject of SUBJECTS) {
        const assignment = assignments.find((item) => item.id === `demo-expanded-v1:${subject.id}:112-mko:2`);
        if (!assignment) continue;
        addNotification({ recipientUserId: "teacher-elena-volkova", kind: "submission", title: "Демонстрационные работы готовы к проверке", body: `${subject.name} · 112-МКо`, href: getAssignmentHref(assignment), dedupeKey: `demo-expanded-v1:teacher:${subject.id}` });
        addNotification({ recipientUserId: "anna-smirnova", kind: "assignment", title: "В журнале появились учебные задания", body: `${subject.name} · можно посмотреть историю сдачи и результаты`, href: getAssignmentHref(assignment), dedupeKey: `demo-expanded-v1:student:${subject.id}` });
      }
    } catch { result.warnings.push("Уведомления добавлены не полностью. Задания и ответы уже доступны в журнале."); }
  }
  return result;
};

let pendingImport: Promise<DemoImportResult> | null = null;

/** Serialize clicks and cooperating tabs; the pack's stable IDs preserve edited records. */
export const importDemoData = (anchor: Date, options: DemoImportOptions = {}): Promise<DemoImportResult> => {
  if (pendingImport) return pendingImport;
  if (!Number.isFinite(anchor.getTime())) return Promise.reject(new Error("Некорректная дата демонабора"));
  const date = new Date(anchor);
  pendingImport = Promise.resolve(navigator.locks
    ? navigator.locks.request("bi-university-demo-import", () => runDemoImport(date, options))
    : runDemoImport(date, options)).finally(() => { pendingImport = null; });
  return pendingImport;
};
