import { decodeSubjectCatalog, type SubjectCatalogDocument } from "../domain/subjectCatalog";

export interface AcademicGroup {
  id: string;
  name: string;
  students: number;
  course: number;
}

export interface AcademicSubjectDefinition {
  id: string;
  name: string;
  shortName: string;
  semester: string;
  color: "red" | "purple" | "orange" | "green";
}

export interface AcademicSubject extends AcademicSubjectDefinition {
  groups: Array<AcademicGroup & { attendance: number }>;
}

export interface SubjectGroupOffering {
  subjectId: string;
  groupId: string;
  attendance: number;
}

export interface AcademicMembership {
  subjectId: string;
  groupIds: string[];
}

export const DEMO_SUBJECTS: AcademicSubjectDefinition[] = [
  { id: "theory-of-probability", name: "Теория вероятностей", shortName: "ТВ", semester: "Осенний семестр · 72 часа", color: "red" },
  { id: "mathematical-statistics", name: "Математическая статистика", shortName: "МС", semester: "Осенний семестр · 54 часа", color: "purple" },
  { id: "data-analysis", name: "Анализ данных", shortName: "АД", semester: "Весенний семестр · 108 часов", color: "orange" },
  { id: "discrete-mathematics", name: "Дискретная математика", shortName: "ДМ", semester: "Осенний семестр · 90 часов", color: "green" },
];

export const SUBJECTS: AcademicSubjectDefinition[] = [...DEMO_SUBJECTS];

export const ACADEMIC_GROUPS: AcademicGroup[] = [
  { id: "112-mko", name: "112-МКо", students: 32, course: 2 }, { id: "113-mko", name: "113-МКо", students: 27, course: 2 },
  { id: "211-ivt", name: "211-ИВТ", students: 25, course: 2 }, { id: "311-pmi", name: "311-ПМИ", students: 24, course: 3 },
  { id: "312-pmi", name: "312-ПМИ", students: 26, course: 3 }, { id: "411-bi", name: "411-БИ", students: 22, course: 4 },
  { id: "412-bi", name: "412-БИ", students: 21, course: 4 }, { id: "413-bi", name: "413-БИ", students: 19, course: 4 },
  { id: "111-is", name: "111-ИС", students: 28, course: 1 }, { id: "112-is", name: "112-ИС", students: 29, course: 1 },
];

const DEMO_SUBJECT_GROUP_OFFERINGS: SubjectGroupOffering[] = [
  { subjectId: "theory-of-probability", groupId: "112-mko", attendance: 84 }, { subjectId: "theory-of-probability", groupId: "113-mko", attendance: 79 }, { subjectId: "theory-of-probability", groupId: "211-ivt", attendance: 88 },
  { subjectId: "mathematical-statistics", groupId: "112-mko", attendance: 88 }, { subjectId: "mathematical-statistics", groupId: "311-pmi", attendance: 91 }, { subjectId: "mathematical-statistics", groupId: "312-pmi", attendance: 86 },
  { subjectId: "data-analysis", groupId: "112-mko", attendance: 92 }, { subjectId: "data-analysis", groupId: "411-bi", attendance: 93 }, { subjectId: "data-analysis", groupId: "412-bi", attendance: 89 }, { subjectId: "data-analysis", groupId: "413-bi", attendance: 82 },
  { subjectId: "discrete-mathematics", groupId: "112-mko", attendance: 82 }, { subjectId: "discrete-mathematics", groupId: "111-is", attendance: 76 }, { subjectId: "discrete-mathematics", groupId: "112-is", attendance: 81 },
];

export const SUBJECT_GROUP_OFFERINGS: SubjectGroupOffering[] = [...DEMO_SUBJECT_GROUP_OFFERINGS];
export const ACADEMIC_SUBJECTS: AcademicSubject[] = [];
export const SUBJECT_CATALOG_STORAGE_KEY = "bi-university-subject-catalog-v1";
export const SUBJECT_CATALOG_CHANGE_EVENT = "bi-university-subject-catalog-change";

export const createInitialSubjectCatalogDocument = (): SubjectCatalogDocument => ({ version: 1, revision: 0, subjects: DEMO_SUBJECTS.map((subject) => ({ ...subject })), history: [] });
let cachedRaw: string | null | undefined;
let cachedDocument: SubjectCatalogDocument | undefined;
export const readSubjectCatalogDocument = (): SubjectCatalogDocument => {
  const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(SUBJECT_CATALOG_STORAGE_KEY);
  if (cachedDocument && cachedRaw === raw) return cachedDocument;
  const document = raw === null ? createInitialSubjectCatalogDocument() : decodeSubjectCatalog(raw);
  if (DEMO_SUBJECTS.some((subject) => !document.subjects.some((entry) => entry.id === subject.id))) throw new Error("В каталоге отсутствуют исходные дисциплины. Исходные данные не изменены.");
  cachedRaw = raw;
  cachedDocument = document;
  return document;
};

const updateReadModel = (subjects: AcademicSubjectDefinition[]) => {
  SUBJECTS.splice(0, SUBJECTS.length, ...subjects);
  const custom = subjects.filter((subject) => !DEMO_SUBJECTS.some((entry) => entry.id === subject.id));
  SUBJECT_GROUP_OFFERINGS.splice(0, SUBJECT_GROUP_OFFERINGS.length, ...DEMO_SUBJECT_GROUP_OFFERINGS,
    ...custom.flatMap((subject) => ACADEMIC_GROUPS.map((group) => ({ subjectId: subject.id, groupId: group.id, attendance: 0 }))));
  const groupsById = new Map(ACADEMIC_GROUPS.map((group) => [group.id, group]));
  const groupsBySubject = new Map<string, AcademicSubject["groups"]>();
  for (const offering of SUBJECT_GROUP_OFFERINGS) {
    const group = groupsById.get(offering.groupId);
    if (!group) continue;
    const groups = groupsBySubject.get(offering.subjectId) ?? [];
    groups.push({ ...group, attendance: offering.attendance });
    groupsBySubject.set(offering.subjectId, groups);
  }
  ACADEMIC_SUBJECTS.splice(0, ACADEMIC_SUBJECTS.length, ...subjects.map((subject) => ({ ...subject, groups: groupsBySubject.get(subject.id) ?? [] })));
};

/** Compatibility views share one persisted source; original IDs and offerings stay unchanged. */
let readModelDocument: SubjectCatalogDocument | undefined;
let catalogWasUnavailable = false;
export const refreshAcademicCatalog = () => {
  try {
    const document = readSubjectCatalogDocument();
    if (readModelDocument !== document || catalogWasUnavailable) updateReadModel(document.subjects);
    readModelDocument = document;
    catalogWasUnavailable = false;
    return { subjects: document.subjects, revision: document.revision, error: "" };
  }
  catch (error) {
    if (!catalogWasUnavailable) {
      console.error("Не удалось прочитать каталог дисциплин. Исходное хранилище не изменено:", error);
      updateReadModel(DEMO_SUBJECTS.map((subject) => ({ ...subject })));
    }
    catalogWasUnavailable = true;
    return { subjects: [...SUBJECTS], revision: 0, error: "Не удалось прочитать каталог дисциплин. Исходные данные не изменены; создание и изменение приостановлены." };
  }
};

refreshAcademicCatalog();
if (typeof window !== "undefined") {
  window.addEventListener(SUBJECT_CATALOG_CHANGE_EVENT, refreshAcademicCatalog);
  window.addEventListener("storage", (event) => { if (event.key === SUBJECT_CATALOG_STORAGE_KEY || event.key === null) refreshAcademicCatalog(); });
}

export const getAcademicGroup = (groupId?: string) => ACADEMIC_GROUPS.find((group) => group.id === groupId);
export const getAcademicGroupByName = (name?: string) => ACADEMIC_GROUPS.find((group) => group.name === name);
export const getAcademicSubjectDefinition = (subjectId?: string) => { refreshAcademicCatalog(); return SUBJECTS.find((subject) => subject.id === subjectId); };
export const getAcademicSubjectByName = (name?: string) => { refreshAcademicCatalog(); return SUBJECTS.find((subject) => subject.name === name); };
export const getSubjectGroups = (subjectId: string) => { refreshAcademicCatalog(); return SUBJECT_GROUP_OFFERINGS
  .filter((offering) => offering.subjectId === subjectId)
  .flatMap((offering) => {
    const group = getAcademicGroup(offering.groupId);
    return group ? [{ ...group, attendance: offering.attendance }] : [];
  }); };

export const getAcademicSubject = (subjectId?: string) => { refreshAcademicCatalog(); return ACADEMIC_SUBJECTS.find((subject) => subject.id === subjectId); };

export const isAcademicMembershipMatch = (memberships: AcademicMembership[], subjectName: string, groupName: string) => {
  const subjectId = getAcademicSubjectByName(subjectName)?.id;
  const groupId = getAcademicGroupByName(groupName)?.id;
  return Boolean(subjectId && groupId && memberships.some((membership) => membership.subjectId === subjectId && membership.groupIds.includes(groupId)));
};

export const getJournalHref = (subjectName: string, groupName?: string) => {
  const subjectId = getAcademicSubjectByName(subjectName)?.id;
  if (!subjectId) return "/journal";
  const groupId = getAcademicGroupByName(groupName)?.id;
  return groupId ? `/journal/${subjectId}/${groupId}` : `/journal/${subjectId}`;
};

export const getJournalHrefById = (subjectId?: string, groupId?: string) => {
  if (!getAcademicSubjectDefinition(subjectId)) return "/journal";
  return groupId && getAcademicGroup(groupId) ? `/journal/${subjectId}/${groupId}` : `/journal/${subjectId}`;
};
