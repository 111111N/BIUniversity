import type { AccountsDocument } from "./accounts";
import type { AcademicPeriodsDocument } from "./academicPeriods";
import type { CurriculaDocument } from "./curriculumTypes";
import type { EducationDirectoriesDocument } from "./educationDirectories";
import type { GroupCatalogDocument } from "./groupCatalog";
import type { GroupCalendarsDocument } from "./groupCalendarTypes";
import type { RoomsDocument } from "./rooms";
import type { ManagedScheduleSnapshot } from "./scheduleManagement";
import type { ScheduleTemplatesDocument } from "./scheduleTemplates";
import type { SubjectCatalogDocument } from "./subjectCatalog";
import type { TeachingAssignmentsDocument } from "./teachingAssignments";
import type { BackupDocumentKind } from "./localBackupDocuments";
import { createBackupInspectionWork, createBackupIssueCollector } from "./backupIssueCollector";
import { checkBackupAbort } from "./localBackup";
import { isCanonicalBackupInstant } from "./backupHistoryTime";

export interface ArchivedAuthorSources {
  accounts?: AccountsDocument; groups?: GroupCatalogDocument; subjects?: SubjectCatalogDocument;
  periods?: AcademicPeriodsDocument; directories?: EducationDirectoriesDocument; curricula?: CurriculaDocument;
  calendars?: GroupCalendarsDocument; teaching?: TeachingAssignmentsDocument; rooms?: RoomsDocument;
  schedule?: ManagedScheduleSnapshot; templates?: ScheduleTemplatesDocument;
}
interface AuthoredEvent { id: string; actorId: string; occurredAt: string }
interface History { kind: BackupDocumentKind; tag: string; events: Iterable<AuthoredEvent> }
function* educationHistory(document: AccountsDocument | undefined): Iterable<AuthoredEvent> {
  for (const event of document?.educationEvents ?? []) yield { id: event.id, actorId: event.actorId, occurredAt: event.registeredAt };
}

/** A unique matching creation audit anchors existence, never historical roles or permissions. */
export async function inspectArchivedActorChronology(sources: ArchivedAuthorSources, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("хронологии существования авторов"), work = createBackupInspectionWork("хронологии авторов", signal);
  const finding = (kind: BackupDocumentKind, level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind, level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    await work.step(0);
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff) || !isCanonicalBackupInstant(completedAt)) throw new Error("Не определена точная граница сверки существования авторов исторических действий.");
    const accounts = sources.accounts;
    work.assertRecords(accounts?.accounts.length ?? 0); work.assertRecords(accounts?.history.length ?? 0);
    const creations = new Map<string, { count: number; first: AccountsDocument["history"][number] }>(), auditIds = new Map<string, number>(), anchors = new Map<string, number>();
    for (const event of accounts?.history ?? []) {
      await work.step();
      if (!auditIds.has(event.id)) work.addText(event.id);
      auditIds.set(event.id, (auditIds.get(event.id) ?? 0) + 1);
      if (event.action !== "created") continue;
      const current = creations.get(event.accountId);
      if (!current) { work.addText(event.accountId); creations.set(event.accountId, { count: 1, first: event }); }
      else current.count++;
    }
    for (const account of accounts?.accounts ?? []) {
      await work.step(); const created = creations.get(account.id), time = Date.parse(account.createdAt ?? "");
      // Import/legacy registration cannot establish the person's earlier portal identity.
      if (!created || created.count !== 1 || auditIds.get(created.first.id) !== 1 || created.first.importBatchId !== undefined || created.first.previousRole !== null || !Number.isFinite(time) || !isCanonicalBackupInstant(account.createdAt ?? "") || !isCanonicalBackupInstant(created.first.occurredAt) || time !== Date.parse(created.first.occurredAt)) continue;
      work.addText(account.id); anchors.set(account.id, time);
    }
    const histories: History[] = [
      { kind: "accounts", tag: "account-history", events: accounts?.history ?? [] },
      { kind: "accounts", tag: "person-history", events: accounts?.personHistory ?? [] },
      { kind: "accounts", tag: "education-events", events: educationHistory(accounts) },
      { kind: "groups", tag: "group-history", events: sources.groups?.history ?? [] },
      { kind: "subjects", tag: "subject-history", events: sources.subjects?.history ?? [] },
      { kind: "periods", tag: "period-history", events: sources.periods?.history ?? [] },
      { kind: "educationDirectories", tag: "directory-history", events: sources.directories?.history ?? [] },
      { kind: "curricula", tag: "curriculum-history", events: sources.curricula?.history ?? [] },
      { kind: "groupCalendars", tag: "calendar-history", events: sources.calendars?.history ?? [] },
      { kind: "teachingAssignments", tag: "teaching-history", events: sources.teaching?.history ?? [] },
      { kind: "rooms", tag: "room-history", events: sources.rooms?.history ?? [] },
      { kind: "schedule", tag: "publication-history", events: sources.schedule?.publications ?? [] },
      { kind: "scheduleTemplates", tag: "template-history", events: sources.templates?.history ?? [] },
    ];
    let events = 0, checked = 0, unanchored = 0, future = 0, earlier = 0, uncertainDates = 0;
    for (const source of histories) {
      await work.step(); let rows = 0;
      for (const event of source.events) {
        work.assertRecords(++rows); await work.step(); events++;
        const time = Date.parse(event.occurredAt);
        if (!Number.isFinite(time)) throw new Error("История авторов содержит некорректное время действия. Частичный результат не создан.");
        if (!isCanonicalBackupInstant(event.occurredAt)) {
          uncertainDates++;
          finding(source.kind, "review", "unconfirmed-actor-event-instant", "Формат даты не подтверждает канонический момент действия. Временное противоречие с созданием автора не выводилось из условной полуночи.", JSON.stringify([source.tag, event.id]), event.actorId);
          continue;
        }
        if (time > cutoff) { future++; continue; }
        const created = anchors.get(event.actorId);
        if (created === undefined) { unanchored++; continue; }
        checked++;
        if (time < created) {
          earlier++;
          finding(source.kind, "error", "actor-event-before-account-creation", "Действие автора датировано раньше создания его учётной записи, подтверждённого карточкой и единственным явным событием создания. Наличие ID в текущем справочнике не устраняет это противоречие времени.", JSON.stringify([source.tag, event.id]), event.actorId);
        }
      }
    }
    const summary = `Хронология авторов: подтверждённых дат создания учёток ${anchors.size}; событий ${events}; сопоставлений ${checked}; действий раньше создания ${earlier}; событий без подтверждённой даты создания ${unanchored}; событий после границы ${future}; нестандартных дат ${uncertainDates}. Это проверка существования учётки, а не исторических ролей или полномочий.`;
    if (events) finding("accounts", "review", "unconfirmed-actor-chronology-authority", `${summary} Старые/импортированные учётки и неоднозначный аудит не достраивались; даты вступления в должность, исторические роли и общие назначения остаются неподтверждёнными.`);
    checkBackupAbort(signal);
    return { issues, summary };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось проверить хронологию существования авторов исторических действий:", error);
    throw error;
  }
}
