import { decodeEducationDirectories, EDUCATION_DIRECTORIES_KEY } from "./educationDirectories";
import { decodeCurricula } from "./curricula";
import { CURRICULA_KEY, type GroupCurriculum } from "./curriculumTypes";
import { decodeGroupCalendars } from "./groupCalendars";
import { GROUP_CALENDARS_KEY } from "./groupCalendarTypes";
import { decodeTeachingAssignments, TEACHING_ASSIGNMENTS_KEY } from "./teachingAssignments";
import { decodeRooms, ROOMS_KEY } from "./rooms";
import { decodeScheduleTemplates, SCHEDULE_TEMPLATES_KEY } from "./scheduleTemplates";
import type { DocumentSelectionDefinition } from "./backupDocumentSelection";
import type { BackupDocumentKind } from "./localBackupDocuments";

const KINDS = new Map<string, BackupDocumentKind>([[EDUCATION_DIRECTORIES_KEY, "educationDirectories"], [CURRICULA_KEY, "curricula"], [GROUP_CALENDARS_KEY, "groupCalendars"], [TEACHING_ASSIGNMENTS_KEY, "teachingAssignments"], [ROOMS_KEY, "rooms"], [SCHEDULE_TEMPLATES_KEY, "scheduleTemplates"]]);
export const getBackupSelectionDocumentKind = (key: string) => KINDS.get(key);

export const BACKUP_SELECTION_DOCUMENTS: readonly DocumentSelectionDefinition[] = [
  { key: EDUCATION_DIRECTORIES_KEY, prefix: "bi-university-education-directories-", label: "Программы и формы обучения", decode: decodeEducationDirectories, collections: [{ name: "programs", recordCollection: "education-programs" }, { name: "forms", recordCollection: "study-forms" }, { name: "history", recordCollection: "education-directory-history" }] },
  { key: CURRICULA_KEY, prefix: "bi-university-curricula-", label: "Планы и назначения групп", decode: decodeCurricula, collections: [{ name: "plans", recordCollection: "curriculum-plans" }, { name: "bindings", recordCollection: "group-curricula", id: row => (row as GroupCurriculum).group.id }, { name: "history", recordCollection: "curriculum-history" }] },
  { key: GROUP_CALENDARS_KEY, prefix: "bi-university-group-calendars-", label: "Календари групп", decode: decodeGroupCalendars, collections: [{ name: "calendars", recordCollection: "group-calendars" }, { name: "history", recordCollection: "group-calendar-history" }] },
  { key: TEACHING_ASSIGNMENTS_KEY, prefix: "bi-university-teaching-assignments-", label: "Назначения преподавателей", decode: decodeTeachingAssignments, collections: [{ name: "assignments", recordCollection: "teaching-assignments" }, { name: "history", recordCollection: "teaching-assignment-history" }] },
  { key: ROOMS_KEY, prefix: "bi-university-rooms-", label: "Аудитории", decode: decodeRooms, collections: [{ name: "rooms", recordCollection: "rooms" }, { name: "history", recordCollection: "room-history" }] },
  { key: SCHEDULE_TEMPLATES_KEY, prefix: "bi-university-schedule-templates-", label: "Шаблоны расписания", decode: decodeScheduleTemplates, collections: [{ name: "templates", recordCollection: "schedule-templates" }, { name: "history", recordCollection: "schedule-template-history" }] },
];
