import { checkBackupAbort } from "./localBackup";
import type { BackupDocumentIssue } from "./localBackupDocuments";
import { getScheduleRoomKey, MANAGED_SCHEDULE_KEY, type ManagedLesson, type ManagedScheduleSnapshot, type ScheduleConflict } from "./scheduleManagement";

type Mode = "published" | "draft" | "draft-published";
type Kind = ScheduleConflict["kind"];
interface Bucket { kind: Kind; published: ManagedLesson[]; drafts: Map<string, ManagedLesson[]> }
const labels: Record<Kind, string> = { teacher: "преподавателя", group: "группы", room: "аудитории" };
const byStart = (left: ManagedLesson, right: ManagedLesson) => left.startsAt.localeCompare(right.startsAt) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

/** Compare only saved managed lessons. A draft replaces its own group's published week. */
export const inspectArchivedScheduleConflicts = async (schedule: ManagedScheduleSnapshot | undefined, signal?: AbortSignal) => {
  const issues: BackupDocumentIssue[] = [];
  const stats: Record<Mode, number> = { published: 0, draft: 0, "draft-published": 0 };
  const kinds: Record<Kind, number> = { teacher: 0, group: 0, room: 0 };
  const buckets = new Map<string, Bucket>();
  let published = 0; let drafts = 0; let count = 0;
  const step = async () => { if (++count % 128 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0)); checkBackupAbort(signal); };
  checkBackupAbort(signal);
  if (!schedule) return { issues, summary: "Пересечения пар не проверены: расписание отсутствует или не читается. Пары браузера и встроенного расписания не подставлялись." };
  const finding = (mode: Mode, kind: Kind, left: ManagedLesson, right: ManagedLesson) => {
    if (left.id === right.id) return;
    stats[mode]++; kinds[kind]++;
    const ids = mode === "draft-published" ? [left.id, right.id] : [left.id, right.id].sort();
    issues.push({ kind: "schedule", level: mode === "published" ? "error" : "review", code: `${mode}-schedule-conflict-${kind}`,
      referenceId: MANAGED_SCHEDULE_KEY, recordId: JSON.stringify([mode, ...ids]),
      message: mode === "published" ? `В сохранённой публикации пересекается время занятий ${labels[kind]}. Требуется решение перед восстановлением; пары не изменены.`
        : mode === "draft" ? `В сохранённом черновике одной группы пересекается время занятий ${labels[kind]}. Черновик может быть промежуточным; перед публикацией потребуется устранить пересечение. Пары не изменены.`
          : `Пара черновика пересекается по времени с опубликованной парой другой группы по ${kind === "teacher" ? "преподавателю" : kind === "group" ? "группе" : "аудитории"}. По текущим правилам это мешает публикации; черновик и публикация не изменены.`,
    });
  };
  for (const [mode, weeks] of [["published", schedule.published], ["draft", schedule.drafts]] as const) {
    for (const week of weeks) {
      await step();
      for (const lesson of week.lessons) {
        await step(); if (mode === "published") published++; else drafts++;
        const resources: [Kind, string][] = [["teacher", lesson.teacherId], ["group", lesson.groupId], ["room", getScheduleRoomKey(lesson.room)]];
        for (const [kind, resource] of resources) {
          const key = JSON.stringify([kind, lesson.date, resource]);
          let bucket = buckets.get(key);
          if (!bucket) { bucket = { kind, published: [], drafts: new Map() }; buckets.set(key, bucket); }
          if (mode === "published") bucket.published.push(lesson);
          else {
            const group = bucket.drafts.get(lesson.groupId);
            if (group) group.push(lesson); else bucket.drafts.set(lesson.groupId, [lesson]);
          }
        }
      }
    }
  }
  const within = async (lessons: ManagedLesson[], mode: "published" | "draft", kind: Kind) => {
    lessons.sort(byStart);
    for (let index = 0; index < lessons.length; index++) {
      await step(); const left = lessons[index];
      for (let next = index + 1; next < lessons.length && lessons[next].startsAt < left.endsAt; next++) {
        await step(); finding(mode, kind, left, lessons[next]);
      }
    }
  };
  for (const bucket of buckets.values()) {
    await step(); await within(bucket.published, "published", bucket.kind);
    for (const lessons of bucket.drafts.values()) await within(lessons, "draft", bucket.kind);
    if (!bucket.published.length || !bucket.drafts.size || bucket.kind === "group") continue;
    // Opposite-source active sets avoid scanning all draft pairs or all earlier nonoverlapping lessons.
    const events = bucket.published.map((lesson) => ({ lesson, mode: "published" as const }));
    const combined: { lesson: ManagedLesson; mode: "published" | "draft" }[] = [...events];
    for (const lessons of bucket.drafts.values()) for (const lesson of lessons) { await step(); combined.push({ lesson, mode: "draft" }); }
    combined.sort((left, right) => byStart(left.lesson, right.lesson));
    const activePublished = new Set<ManagedLesson>(); const activeDrafts = new Set<ManagedLesson>();
    for (const event of combined) {
      await step(); const opposite = event.mode === "published" ? activeDrafts : activePublished;
      for (const other of opposite) {
        await step();
        if (other.endsAt <= event.lesson.startsAt) { opposite.delete(other); continue; }
        if (other.groupId === event.lesson.groupId) continue;
        finding("draft-published", bucket.kind, event.mode === "draft" ? event.lesson : other, event.mode === "published" ? event.lesson : other);
      }
      (event.mode === "published" ? activePublished : activeDrafts).add(event.lesson);
    }
  }
  checkBackupAbort(signal);
  return { issues, summary: `Проверено опубликованных пар: ${published}; пар черновиков: ${drafts}. Пересечений в публикации: ${stats.published}; внутри черновиков: ${stats.draft}; черновиков с публикацией других групп: ${stats["draft-published"]}. По типам во всех сверках: преподаватель ${kinds.teacher}; группа ${kinds.group}; аудитория ${kinds.room}. Одно пересечение учитывается отдельно по каждому типу. Черновик не сравнивается со своей публикацией и черновиками других групп; история журнала и встроенные пары не подставляются. Проверка не подтверждает готовность к публикации или восстановлению. Пары не изменялись.` };
};
