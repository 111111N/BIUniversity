import type { AccountsDocument } from "../domain/accounts";
import type { GroupCatalogDocument } from "../domain/groupCatalog";
import type { SubjectCatalogDocument } from "../domain/subjectCatalog";
import type { ManagedScheduleSnapshot } from "../domain/scheduleManagement";
import { BACKUP_CORE_DOCUMENTS, BACKUP_LEARNING_DOCUMENTS } from "../domain/localBackupDocuments";
import { backupFixture, backupTime } from "./localBackup";
import type { Assignment, Submission } from "../data/assignmentStore";
import type { Student } from "../components/Attendance/data/students";
import type { JournalChange } from "../data/journalStore";
import { BACKUP_JOURNAL_DOCUMENTS } from "../domain/backupJournalDocuments";
import { getPlannerStorageKey } from "../domain/plannerStorage";
import type { AppNotification } from "../data/notificationStore";
import { createBackupBudget, encodeBackupValue, type BackupValue } from "../domain/localBackup";

export const coreBackupFixture = () => {
  const accounts: AccountsDocument = { version: 1, revision: 1, history: [], accounts: [
    { id: "configurator-demo", name: "Настройщик системы", login: "configurator", role: "configurator", revision: 1, memberships: [] },
    { id: "teacher-1", name: "Иван Петров", login: "teacher", role: "teacher", revision: 1, memberships: [{ subjectId: "subject-1", groupIds: ["group-1"] }] },
    { id: "student-1", name: "Анна Смирнова", login: "student", role: "student", revision: 1, studentGroupId: "group-1", memberships: [{ subjectId: "subject-1", groupIds: ["group-1"] }] },
  ] };
  const groups: GroupCatalogDocument = { version: 1, revision: 1, history: [], groups: [{ id: "group-1", name: "101-ИВТ", course: 1, campus: 1, admissionYear: 2026, revision: 1, createdAt: backupTime, createdBy: "configurator-demo" }] };
  const subjects: SubjectCatalogDocument = { version: 1, revision: 1, history: [], subjects: [{ id: "subject-1", name: "Математика", shortName: "МАТ", semester: "", color: "red" }] };
  const schedule: ManagedScheduleSnapshot = { version: 1, revision: 1, published: [], journal: [], drafts: [{ weekStart: "2026-10-26", groupId: "group-1", lessons: [{
    id: "managed:lesson-1", scheduleId: 1, subjectId: "subject-1", groupId: "group-1", teacherId: "teacher-1", teacherName: "Петров И.П.", date: "2026-10-28", startsAt: "09:00", endsAt: "10:30", type: "practice", room: "101",
  }] }] };
  const archive = backupFixture();
  const documents = { accounts, groups, subjects, schedule };
  const save = () => { archive.localStorage = (Object.entries(documents) as [keyof typeof documents, unknown][]).map(([kind, value]) => ({ key: BACKUP_CORE_DOCUMENTS[kind].key, raw: JSON.stringify(value) })); archive.totals.storageEntries = archive.localStorage.length; return archive; };
  save(); return { archive, accounts, groups, subjects, schedule, save };
};

export const scheduleConflictBackupFixture = () => {
  const state = coreBackupFixture();
  const first = { ...state.schedule.drafts[0].lessons[0], teacherName: "PRIVATE TEACHER", room: "PRIVATE ROOM" };
  const second = { ...first, id: "managed:lesson-2", scheduleId: 2, startsAt: "09:45", endsAt: "11:00" };
  state.schedule.published = [{ ...state.schedule.drafts[0], lessons: [first, second] }];
  state.schedule.journal = [first, second].map((lesson) => ({ ...lesson, journalState: "active" as const }));
  state.schedule.drafts = []; state.save();
  return { ...state, first, second };
};

export const materialBackupFixture = async () => {
  const state = coreBackupFixture(); const budget = createBackupBudget();
  const file = new File(["PRIVATE MATERIAL BYTES"], "PRIVATE MATERIAL.txt", { type: "text/plain", lastModified: 42 });
  const material = { id: "material-1", name: file.name, type: file.type, size: file.size, createdAt: Date.parse(backupTime), blob: file, scope: "user:teacher-1", uploadedBy: "PRIVATE AUTHOR", description: "PRIVATE DESCRIPTION", category: "Материал", pinned: true };
  const records = [{ key: await encodeBackupValue(material.id, budget), value: await encodeBackupValue(material, budget) }];
  state.archive.databases[0] = { name: "bi-university-cabinet", version: 2, capturedAt: backupTime, stores: [{ name: "teacher-files", keyPath: "id", autoIncrement: false, indexes: [{ name: "scope", keyPath: "scope", unique: false, multiEntry: false }], records }] };
  state.archive.totals.databaseRecords = 1; state.archive.totals.files = budget.files; state.archive.totals.binaryBytes = budget.binaryBytes;
  return { ...state, file, material, records };
};

export const materialIndexBackupFixture = async () => {
  const state = await materialBackupFixture(); const second = structuredClone(state.records[0]);
  second.key = { type: "string", value: "material-2" };
  if (second.value.type !== "object") throw new Error("Expected material object");
  second.value.entries.find(([key]) => key === "id")![1] = { type: "string", value: "material-2" };
  state.records.push(second);
  state.archive.databases[0].stores[0].indexes.push({ name: "by-name", keyPath: "name", unique: true, multiEntry: false });
  state.archive.totals.databaseRecords = 2; state.archive.totals.files *= 2; state.archive.totals.binaryBytes *= 2;
  return state;
};

export const learningBackupFixture = () => {
  const state = coreBackupFixture();
  const assignments: Assignment[] = [{
    id: "task-1", subjectId: "subject-1", groupId: "group-1", subject: "Математика", group: "101-ИВТ",
    lessonDate: "2026-10-28T09:00", lessonType: "Практика", title: "PRIVATE TASK", description: "PRIVATE CONDITION",
    deadline: "2026-10-29T18:00", status: "published", allowLateSubmissions: false,
    createdAt: "2026-10-27T12:00", updatedAt: "2026-10-27T12:00",
  }];
  const submissions: Submission[] = [{
    id: "answer-1", assignmentId: "task-1", studentId: "student-1", studentName: "PRIVATE NAME",
    sentAt: "2026-10-28T12:00", updatedAt: "2026-10-28T12:00", text: "PRIVATE ATTEMPT", status: "submitted", attemptCount: 1,
    attempts: [{ id: "attempt-1", number: 1, sentAt: "2026-10-28T12:00", updatedAt: "2026-10-28T12:00", text: "PRIVATE ATTEMPT", status: "submitted", submittedLate: false }],
  }];
  const save = () => {
    state.save();
    state.archive.localStorage.push(...Object.entries({ assignments, submissions }).map(([kind, value]) => ({ key: BACKUP_LEARNING_DOCUMENTS[kind as keyof typeof BACKUP_LEARNING_DOCUMENTS].key, raw: JSON.stringify(value) })));
    state.archive.totals.storageEntries = state.archive.localStorage.length;
    return state.archive;
  };
  save(); return { ...state, assignments, submissions, save };
};

export const learningFileBackupFixture = async () => {
  const state = learningBackupFixture(); const budget = createBackupBudget();
  const taskFile = new File(["PRIVATE TASK BYTES"], "PRIVATE TASK FILE.txt", { type: "text/plain", lastModified: 42 });
  const answerFile = new File(["PRIVATE ANSWER BYTES"], "PRIVATE ANSWER FILE.txt", { type: "text/plain", lastModified: 43 });
  Object.assign(state.assignments[0], { attachmentId: "task-file", attachmentName: taskFile.name });
  Object.assign(state.submissions[0], { attachmentId: "answer-file", attachmentName: answerFile.name });
  Object.assign(state.submissions[0].attempts![0], { attachmentId: "answer-file", attachmentName: answerFile.name });
  const records = [];
  for (const [id, file] of [["task-file", taskFile], ["answer-file", answerFile]] as const) records.push({ key: await encodeBackupValue(id, budget), value: await encodeBackupValue(file, budget) });
  state.archive.databases[2] = { name: "bi-university-learning-files", version: 1, capturedAt: backupTime, stores: [{ name: "files", keyPath: null, autoIncrement: false, indexes: [], records }] };
  state.archive.totals.databaseRecords = records.length; state.archive.totals.files = budget.files; state.archive.totals.binaryBytes = budget.binaryBytes;
  state.save(); return { ...state, taskFile, answerFile, records };
};

export const journalBackupFixture = () => {
  const state = learningBackupFixture();
  const lesson = state.schedule.drafts[0].lessons[0];
  state.schedule.published.push({ ...state.schedule.drafts[0], lessons: [{ ...lesson }] });
  state.schedule.journal.push({ ...lesson, journalState: "active" });
  const students: Student[] = [{ id: "student-1", name: "PRIVATE JOURNAL NAME", attendance: { [lesson.id]: "present" }, grades: { [lesson.id]: 5 } }];
  const changes: JournalChange[] = [{
    id: "change-1", changedAt: "2026-10-28T12:00:00.000Z", actor: { id: "teacher-1", name: "PRIVATE ACTOR", role: "teacher", memberships: [{ subjectId: "subject-1", groupIds: ["group-1"] }] },
    studentId: "student-1", studentName: "PRIVATE HISTORY NAME", lessonId: lesson.id, field: "attendance", previousValue: "unmarked", nextValue: "present",
  }];
  const journalKey = `${BACKUP_JOURNAL_DOCUMENTS.journals.key}subject-1:group-1`;
  const historyKey = `${BACKUP_JOURNAL_DOCUMENTS.journalHistory.key}subject-1:group-1`;
  const save = () => {
    state.save();
    state.archive.localStorage.push({ key: journalKey, raw: JSON.stringify({ version: 2, students }) }, { key: historyKey, raw: JSON.stringify(changes) });
    state.archive.totals.storageEntries = state.archive.localStorage.length;
    return state.archive;
  };
  save(); return { ...state, students, changes, journalKey, historyKey, save };
};

export const plannerBackupFixture = () => {
  const state = journalBackupFixture();
  const notes = [{ id: "note-1", title: "PRIVATE NOTE TITLE", text: "PRIVATE NOTE TEXT", createdAt: "2026-10-29T00:00:00.000Z", startAt: "2026-10-29T12:00:00.000Z", endAt: "2026-10-29T13:00:00.000Z", completed: false, priority: "medium", category: "personal" }];
  const plannerKey = getPlannerStorageKey("student-1");
  const save = () => {
    state.save(); state.archive.localStorage.push({ key: plannerKey, raw: JSON.stringify(notes) });
    state.archive.totals.storageEntries = state.archive.localStorage.length; return state.archive;
  };
  save(); return { ...state, notes, plannerKey, save };
};

export const notificationBackupFixture = () => {
  const state = plannerBackupFixture();
  const notifications: AppNotification[] = [{ id: "notice-1", recipientUserId: "student-1", kind: "schedule", title: "PRIVATE NOTICE TITLE", body: "PRIVATE NOTICE BODY", href: "/schedule?date=2026-10-29", createdAt: "2026-10-29T10:00:00.000Z", read: false }];
  const notificationKey = "bi-university-demo-notifications";
  const save = () => {
    state.save(); state.archive.localStorage.push({ key: notificationKey, raw: JSON.stringify({ version: 2, items: notifications }) });
    state.archive.totals.storageEntries = state.archive.localStorage.length; return state.archive;
  };
  save(); return { ...state, notifications, notificationKey, save };
};

export const notificationTargetBackupFixture = () => {
  const state = notificationBackupFixture();
  state.notifications[0].href = "/journal/subject-1/group-1?tab=assignments&assignment=task-1&submission=answer-1";
  state.save(); return state;
};

export const settingsBackupFixture = () => {
  const state = notificationBackupFixture();
  const settings = [
    { key: "bi-university-theme", raw: "light" },
    { key: "bi-university-demo-account", raw: "configurator-demo" },
    { key: "bi-university-demo-role", raw: "configurator" },
    { key: "bi-university-planner-view", raw: "board" },
    { key: "bi-university-schedule-view:teacher:teacher-1", raw: "grid" },
    { key: "bi-university-schedule-view:student:student-1", raw: "list" },
  ];
  const save = () => {
    state.save(); state.archive.localStorage.push(...settings.map((entry) => ({ ...entry })));
    state.archive.totals.storageEntries = state.archive.localStorage.length; return state.archive;
  };
  save(); return { ...state, settings, save };
};

export const messagingBackupFixture = () => {
  const state = settingsBackupFixture();
  const messaging = { version: 1, users: {
    "bi-university-messages-v2:student:student-1": { dialogIds: ["teacher-1"], messages: { "teacher-1": [{ id: 1, incoming: false, text: "PRIVATE MESSAGE BODY", time: "12:00", deliveryId: "delivery-1" }] }, unread: { students: 0, teachers: 0, groups: 0 } },
    "bi-university-messages-v2:teacher:teacher-1": { dialogIds: ["student-1"], messages: { "student-1": [{ id: 1, incoming: true, text: "PRIVATE MESSAGE BODY", time: "12:00", deliveryId: "delivery-1" }] }, unread: { students: 1, teachers: 0, groups: 0 } },
  } };
  const messagingKey = "bi-university-messages-v3";
  const save = () => {
    state.save(); state.archive.localStorage.push({ key: messagingKey, raw: JSON.stringify(messaging) });
    state.archive.totals.storageEntries = state.archive.localStorage.length; return state.archive;
  };
  save(); return { ...state, messaging, messagingKey, save };
};

export const messagingReplyBackupFixture = () => {
  const state = messagingBackupFixture();
  const own = state.messaging.users["bi-university-messages-v2:student:student-1"].messages["teacher-1"];
  const peer = state.messaging.users["bi-university-messages-v2:teacher:teacher-1"].messages["student-1"];
  const ownReply = { ...own[0], id: 3, deliveryId: "delivery-3", replyTo: 1 };
  const peerReply = { ...peer[0], id: 3, deliveryId: "delivery-3", replyTo: 1 };
  own.push({ ...own[0], id: 2, deliveryId: "delivery-2", text: "PRIVATE OTHER ORIGINAL" }, ownReply);
  peer.push({ ...peer[0], id: 2, deliveryId: "delivery-2", text: "PRIVATE OTHER ORIGINAL" }, peerReply);
  state.save(); return { ...state, ownReply, peerReply };
};

export const messageFileBackupFixture = async () => {
  const state = messagingBackupFixture(); const budget = createBackupBudget();
  const blob = new File(["PRIVATE FILE BODY"], "PRIVATE FILE NAME", { type: "text/plain", lastModified: 42 });
  const ownAttachment = { id: "own-file", name: blob.name, type: blob.type, size: blob.size };
  const peerAttachment = { ...ownAttachment, id: "peer-file" };
  Object.assign(state.messaging.users["bi-university-messages-v2:student:student-1"].messages["teacher-1"][0], { attachments: [ownAttachment] });
  Object.assign(state.messaging.users["bi-university-messages-v2:teacher:teacher-1"].messages["student-1"][0], { attachments: [peerAttachment] });
  const records = [];
  for (const [attachment, scope] of [[ownAttachment, "student:student-1:teacher-1"], [peerAttachment, "teacher:teacher-1:student-1"]] as const) {
    records.push({ key: await encodeBackupValue(attachment.id, budget), value: await encodeBackupValue({ ...attachment, scope, blob }, budget) });
  }
  state.archive.databases[1] = { name: "bi-university-message-files", version: 1, capturedAt: backupTime, stores: [{ name: "attachments", keyPath: "id", autoIncrement: false, indexes: [], records }] };
  state.archive.totals.databaseRecords = records.length; state.archive.totals.files = budget.files; state.archive.totals.binaryBytes = budget.binaryBytes;
  state.save(); return { ...state, ownAttachment, peerAttachment, records };
};

export const replaceMessageFileBlob = async (entry: { value: BackupValue }, blob: Blob) => {
  if (entry.value.type !== "object") throw new Error("Missing file fixture");
  const field = entry.value.entries.find(([key]) => key === "blob");
  if (!field) throw new Error("Missing blob fixture");
  field[1] = await encodeBackupValue(blob, createBackupBudget());
};
