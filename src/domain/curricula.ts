import { isAccountActive, type PortalAccount } from "./accounts";
import { decodeEducationDirectories, type EducationDirectoriesDocument } from "./educationDirectories";
import { decodeAcademicPeriodsDocument, type AcademicPeriodsDocument } from "./academicPeriods";
import { resolveAssessmentAcademicPeriod, validateAssessmentAcademicPeriod } from "./assessmentPeriods";
import type { SubjectDefinition } from "./subjectCatalog";
import { CURRICULUM_CATEGORIES, CURRICULUM_CONTROLS, CURRICULUM_HOURS, curriculumTotal, type CurriculaDocument, type CurriculumCommand, type CurriculumDraft, type CurriculumEntry, type CurriculumPlan, type GroupCurriculum } from "./curriculumTypes";

function fail(message = "Учебные планы или история их изменений повреждены."): never { throw new Error(message); }
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const text = (value: unknown, min = 1, max = 160): value is string => typeof value === "string" && value.length >= min && value.length <= max && value.trim() === value && !Array.from(value).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
const hours = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000 && Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : object(value) ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}` : JSON.stringify(value);
export const sameCurriculumData = (left: unknown, right: unknown) => canonical(left) === canonical(right);
const validDirectoryRecord = (value: unknown, program: boolean) => exact(value, ["id", "revision", "name", ...(program ? ["code"] : [])]) && text(value.id) && integer(value.revision, 1) && text(value.name, 2) && normalize(value.name) === value.name && (!program || text(value.code, 0, 64) && normalize(value.code) === value.code);
const validEntry = (value: unknown): value is CurriculumEntry => exact(value, ["id", "subject", "semester", "category", "controls", "hours"])
  && text(value.id) && exact(value.subject, ["id", "revision", "name", "shortName"]) && text(value.subject.id) && integer(value.subject.revision) && text(value.subject.name) && text(value.subject.shortName)
  && integer(value.semester, 1, 30) && typeof value.category === "string" && Object.hasOwn(CURRICULUM_CATEGORIES, value.category)
  && Array.isArray(value.controls) && value.controls.length <= Object.keys(CURRICULUM_CONTROLS).length && new Set(value.controls).size === value.controls.length && value.controls.every(control => typeof control === "string" && Object.hasOwn(CURRICULUM_CONTROLS, control))
  && exact(value.hours, Object.keys(CURRICULUM_HOURS)) && Object.values(value.hours).every(hours);
const validPlan = (value: unknown): value is CurriculumPlan => exact(value, ["id", "familyId", "number", "revision", "sourceId", "state", "name", "program", "form", "academicHourMinutes", "hoursPerCredit", "entries"])
  && text(value.id) && text(value.familyId) && integer(value.number, 1) && integer(value.revision, 1) && (value.sourceId === null || text(value.sourceId)) && ["draft", "published"].includes(value.state as string)
  && text(value.name, 2) && normalize(value.name) === value.name && validDirectoryRecord(value.program, true) && validDirectoryRecord(value.form, false)
  && (value.academicHourMinutes === 40 || value.academicHourMinutes === 45) && hours(value.hoursPerCredit) && value.hoursPerCredit * value.academicHourMinutes >= 1440 && value.hoursPerCredit * value.academicHourMinutes <= 1800
  && Array.isArray(value.entries) && value.entries.length <= 500 && value.entries.every(validEntry)
  && new Set(value.entries.map(entry => entry.id)).size === value.entries.length && new Set(value.entries.map(entry => JSON.stringify([entry.subject.id, entry.semester]))).size === value.entries.length
  && (value.state === "draft" || value.entries.length > 0 && value.entries.every(entry => curriculumTotal(entry.hours) > 0));
const validBinding = (value: unknown): value is GroupCurriculum => {
  if (!exact(value, ["group", "revision", "planId", "periods"]) || !exact(value.group, ["id", "revision", "name"]) || !text(value.group.id) || !text(value.group.name) || !integer(value.group.revision) || !integer(value.revision, 1) || !text(value.planId) || !Array.isArray(value.periods) || value.periods.length > 30) return false;
  const semesters = new Set<number>(), terms = new Set<string>();
  let previousEnd = "", previousSemester = 0;
  for (const entry of value.periods) {
    if (!exact(entry, ["semester", "period"]) || !integer(entry.semester, 1, 30) || semesters.has(entry.semester) || entry.semester <= previousSemester) return false;
    const period = validateAssessmentAcademicPeriod(entry.period);
    if (terms.has(period.term.id) || period.term.startsOn <= previousEnd) return false;
    semesters.add(entry.semester); terms.add(period.term.id); previousSemester = entry.semester; previousEnd = period.term.endsOn;
  }
  return true;
};
export const decodeCurricula = (raw: string): CurriculaDocument => {
  if (typeof raw !== "string" || raw.length > 16 * 1024 * 1024) fail("Учебные планы превышают поддерживаемый размер.");
  const value: unknown = JSON.parse(raw);
  if (!exact(value, ["version", "revision", "plans", "bindings", "history"]) || value.version !== 1 || !integer(value.revision) || !Array.isArray(value.plans) || value.plans.length > 10_000 || !Array.isArray(value.bindings) || value.bindings.length > 10_000 || !Array.isArray(value.history) || value.history.length > 20_000 || value.revision !== value.history.length) fail();
  const plans = new Map<string, CurriculumPlan>(), bindings = new Map<string, GroupCurriculum>(), eventIds = new Set<string>();
  const families = new Map<string, CurriculumPlan>();
  let previousTime = "";
  for (const event of value.history) {
    if (!exact(event, ["id", "actorId", "occurredAt", "entity", "before", "after"]) || !text(event.id) || eventIds.has(event.id) || !text(event.actorId) || !timestamp(event.occurredAt) || event.occurredAt < previousTime) fail();
    if (event.entity === "plan") {
      if (!validPlan(event.after) || event.before !== null && !validPlan(event.before)) fail();
      const after = event.after, before = event.before as CurriculumPlan | null, current = plans.get(after.id);
      if (before === null) {
        if (current || after.revision !== 1 || after.state !== "draft") fail();
        const previous = families.get(after.familyId);
        if (!previous) { if (after.number !== 1 || after.sourceId !== null || after.familyId !== after.id) fail(); }
        else if (previous.state !== "published" || after.number !== previous.number + 1 || after.sourceId !== previous.id || !sameCurriculumData(after, { ...previous, id: after.id, sourceId: previous.id, revision: 1, number: after.number, state: "draft" })) fail();
      } else {
        if (!sameCurriculumData(before, current) || before.state !== "draft" || after.revision !== before.revision + 1 || after.familyId !== before.familyId || after.number !== before.number || after.sourceId !== before.sourceId || sameCurriculumData({ ...before, revision: after.revision }, after)) fail();
        if (after.state === "published" && !sameCurriculumData(after, { ...before, revision: after.revision, state: "published" })) fail();
      }
      plans.set(after.id, after); families.set(after.familyId, after);
    } else if (event.entity === "binding") {
      if (!validBinding(event.after) || event.before !== null && !validBinding(event.before)) fail();
      const after = event.after, before = event.before as GroupCurriculum | null, current = bindings.get(after.group.id), plan = plans.get(after.planId);
      if (!plan || plan.state !== "published" || after.periods.some(entry => !plan.entries.some(row => row.semester === entry.semester))) fail();
      if (before === null ? current !== undefined || after.revision !== 1 : !sameCurriculumData(before, current) || before.group.id !== after.group.id || after.revision !== before.revision + 1 || sameCurriculumData({ ...before, revision: after.revision }, after)) fail();
      bindings.set(after.group.id, after);
    } else fail();
    eventIds.add(event.id); previousTime = event.occurredAt;
  }
  for (const [rows, map, valid, getId] of [
    [value.plans, plans, validPlan, (row: CurriculumPlan) => row.id],
    [value.bindings, bindings, validBinding, (row: GroupCurriculum) => row.group.id],
  ] as const) {
    if (rows.length !== map.size) fail();
    const seen = new Set<string>();
    for (const row of rows) {
      if (!valid(row)) fail();
      const recordId = (getId as (value: unknown) => string)(row);
      if (seen.has(recordId) || !sameCurriculumData(row, map.get(recordId))) fail();
      seen.add(recordId);
    }
  }
  return value as unknown as CurriculaDocument;
};

export interface CurriculumDependencies {
  directories: EducationDirectoriesDocument; periods: AcademicPeriodsDocument;
  subjects: { revision: number; rows: SubjectDefinition[] };
  groups: { revision: number; rows: Array<{ id: string; revision: number; name: string; status?: "active" | "archived" }> };
}
const resolveDraft = (draft: CurriculumDraft, dependencies: CurriculumDependencies) => {
  if (!exact(draft, ["name", "programId", "formId", "academicHourMinutes", "hoursPerCredit", "entries"]) || typeof draft.name !== "string" || !Array.isArray(draft.entries)) fail("Проверьте реквизиты и строки учебного плана.");
  const program = dependencies.directories.programs.find(row => row.id === draft.programId), form = dependencies.directories.forms.find(row => row.id === draft.formId);
  if (!program || !form) fail("Выберите программу и форму обучения из справочников.");
  const subjects = new Map(dependencies.subjects.rows.map(row => [row.id, row]));
  const entries = draft.entries.map(entry => {
    if (!validEntry(entry)) fail("Проверьте дисциплины, семестры, формы контроля и часы. Часы должны быть неотрицательными с точностью до сотых.");
    const subject = subjects.get(entry.subject.id);
    if (!subject || subject.status === "archived" || (subject.revision ?? 0) !== entry.subject.revision) fail("Дисциплина изменилась или архивирована. Обновите её выбор в строке плана.");
    return { ...entry, subject: { id: subject.id, revision: subject.revision ?? 0, name: subject.name, shortName: subject.shortName } };
  });
  return { name: normalize(draft.name), program: structuredClone(program), form: structuredClone(form), academicHourMinutes: draft.academicHourMinutes, hoursPerCredit: draft.hoursPerCredit, entries };
};
export const executeCurriculumCommand = (source: CurriculaDocument, command: CurriculumCommand, actor: PortalAccount | undefined, dependencies: CurriculumDependencies, metadata: { id: string; eventId: string; occurredAt: string }): CurriculaDocument => {
  const state = decodeCurricula(JSON.stringify(source));
  dependencies = { ...dependencies, directories: decodeEducationDirectories(JSON.stringify(dependencies.directories)), periods: decodeAcademicPeriodsDocument(JSON.stringify(dependencies.periods)) };
  if (!actor || actor.id !== command.actorId || actor.role !== "configurator" || !isAccountActive(actor)) fail("Управлять учебными планами может только действующий настройщик.");
  if (actor.revision !== command.actorRevision || state.revision !== command.expectedRevision || dependencies.directories.revision !== command.directoriesRevision || dependencies.subjects.revision !== command.subjectsRevision || dependencies.groups.revision !== command.groupsRevision || dependencies.periods.revision !== command.periodsRevision) fail("План, справочники или права изменились. Ввод сохранён; перечитайте актуальные данные перед повторным сохранением.");
  if (!text(metadata.id) || !text(metadata.eventId) || !timestamp(metadata.occurredAt) || metadata.occurredAt < (state.history.at(-1)?.occurredAt ?? "") || metadata.occurredAt < (dependencies.directories.history.at(-1)?.occurredAt ?? "") || metadata.occurredAt < (dependencies.periods.history.at(-1)?.occurredAt ?? "")) fail("Не удалось подготовить идентификатор или время изменения плана.");
  let entity: "plan" | "binding", before: CurriculumPlan | GroupCurriculum | null, after: CurriculumPlan | GroupCurriculum;
  const contextKeys = ["actorId", "actorRevision", "expectedRevision", "directoriesRevision", "subjectsRevision", "groupsRevision", "periodsRevision", "type"];
  if (command.type === "bind") {
    if (!exact(command, [...contextKeys, "groupId", "groupRevision", "bindingRevision", "planId", "periods"]) || !Array.isArray(command.periods) || command.periods.length > 30) fail("Проверьте назначение плана группе.");
    const group = dependencies.groups.rows.find(row => row.id === command.groupId), plan = state.plans.find(row => row.id === command.planId);
    if (!group || group.status === "archived" || group.revision !== command.groupRevision || !plan || plan.state !== "published") fail("Выберите действующую группу и опубликованную версию плана.");
    before = state.bindings.find(row => row.group.id === command.groupId) ?? null;
    if ((before?.revision ?? 0) !== command.bindingRevision) fail("Назначение группы изменилось. Откройте его заново.");
    const periods = command.periods.map(entry => {
      if (!exact(entry, ["semester", "termId"]) || !integer(entry.semester, 1, 30) || !text(entry.termId)) fail("Проверьте календарные семестры группы.");
      return { semester: entry.semester, period: resolveAssessmentAcademicPeriod(dependencies.periods, { termId: entry.termId, expectedRevision: command.periodsRevision }, metadata.occurredAt) };
    }).sort((a, b) => a.semester - b.semester);
    after = { group: { id: group.id, revision: group.revision, name: group.name }, revision: (before?.revision ?? 0) + 1, planId: plan.id, periods }; entity = "binding";
  } else {
    const updating = command.planId !== undefined;
    if (!exact(command, [...contextKeys, ...(updating ? ["planId", "planRevision"] : []), ...(command.type === "save" ? ["draft"] : [])]) || !["save", "publish", "new-version"].includes(command.type)) fail("Неизвестное действие с учебным планом.");
    const target = updating ? state.plans.find(row => row.id === command.planId) : null;
    if (updating && (!target || target.revision !== command.planRevision)) fail("Версия плана изменилась. Откройте актуальную карточку; ввод сохранён.");
    if (command.type === "save") {
      if (target?.state === "published") fail("Опубликованная версия неизменяема. Создайте следующую версию плана.");
      before = target ?? null;
      after = { id: target?.id ?? metadata.id, familyId: target?.familyId ?? metadata.id, number: target?.number ?? 1, revision: (target?.revision ?? 0) + 1, sourceId: target?.sourceId ?? null, state: "draft", ...resolveDraft(command.draft, dependencies) };
    } else if (command.type === "publish") {
      if (!target || target.state !== "draft") fail("Опубликовать можно только черновик плана.");
      const resolved = resolveDraft({ name: target.name, programId: target.program.id, formId: target.form.id, academicHourMinutes: target.academicHourMinutes, hoursPerCredit: target.hoursPerCredit, entries: target.entries }, dependencies);
      if (!sameCurriculumData({ ...target, ...resolved }, target)) fail("Реквизиты программы, формы или дисциплин изменились. Сначала сохраните актуальный черновик.");
      before = target; after = { ...target, revision: target.revision + 1, state: "published" };
    } else {
      const latest = state.plans.filter(row => row.familyId === target?.familyId).sort((a, b) => b.number - a.number)[0];
      if (!target || target.state !== "published" || latest?.id !== target.id) fail("Следующую версию можно создать только из последней опубликованной. Проверьте, нет ли уже нового черновика.");
      before = null; after = { ...structuredClone(target), id: metadata.id, sourceId: target.id, number: target.number + 1, revision: 1, state: "draft" };
    }
    entity = "plan";
  }
  if (before && sameCurriculumData({ ...before, revision: after.revision }, after)) fail("Данные не изменились.");
  if (entity === "plan" && !validPlan(after)) fail("Проверьте название, состав и объём плана. Для публикации нужны строки с ненулевой нагрузкой. Величина зачётной единицы должна соответствовать 24–30 астрономическим часам и быть общей для плана.");
  if (entity === "binding" && !validBinding(after)) fail("Календарные семестры должны идти по порядку без пересечений и повторов.");
  return decodeCurricula(JSON.stringify({ ...state, revision: state.revision + 1,
    ...(entity === "plan" ? { plans: [...state.plans.filter(row => row.id !== (after as CurriculumPlan).id), after] } : { bindings: [...state.bindings.filter(row => row.group.id !== (after as GroupCurriculum).group.id), after] }),
    history: [...state.history, { id: metadata.eventId, actorId: actor.id, occurredAt: metadata.occurredAt, entity, before, after }],
  }));
};
