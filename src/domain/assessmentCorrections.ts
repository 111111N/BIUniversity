import type { PortalAccount } from "./accounts";
import type { AssessmentAttempt, AssessmentCommand, AssessmentCorrection, AssessmentCorrectionEvent, AssessmentDocument, AssessmentKind, AssessmentResult } from "./assessmentTypes";

type NormalizeResults = (value: unknown, studentIds: string[], kind: AssessmentKind) => AssessmentResult[];
type CorrectionCommand = Extract<AssessmentCommand, { type: "open-correction" | "save-correction" | "publish-correction" }>;
function fail(): never { throw new Error("Данные исправлений аттестаций повреждены или не согласованы с историей."); }
const text = (value: unknown, min = 1, max = 256): value is string => typeof value === "string" && value.trim() === value && value.length >= min && value.length <= max && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const timestamp = (value: unknown): value is string => typeof value === "string" && value.length <= 40 && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const exact = (value: unknown, keys: string[]) => {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail();
};
export const sameAssessmentResults = (a: AssessmentResult[], b: AssessmentResult[]) => a.length === b.length && a.every((row, index) => {
  const other = b[index];
  return row.studentId === other.studentId && (row.outcome === null ? other.outcome === null : other.outcome !== null && row.outcome.status === other.outcome.status && (row.outcome.status !== "graded" || other.outcome.status === "graded" && row.outcome.grade === other.outcome.grade));
});

export const assessmentPublication = (state: Pick<AssessmentDocument, "corrections">, attempt: AssessmentAttempt, version?: number) => {
  const published = state.corrections.filter((entry) => entry.attemptId === attempt.id && entry.state === "published");
  const number = version ?? (published.at(-1)?.version ?? 1);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error("Укажите корректную версию ведомости.");
  const correction = number === 1 ? undefined : published.find((entry) => entry.version === number);
  if (number !== 1 && !correction) throw new Error("Опубликованная версия ведомости недоступна.");
  return { version: number, results: correction?.results ?? attempt.results, publishedAt: correction?.publishedAt ?? attempt.publishedAt, publishedBy: correction?.publishedBy ?? attempt.publishedBy };
};

/** The base document has already passed its strict validator; original publications remain immutable. */
export const validateAssessmentCorrections = (state: AssessmentDocument, normalize: NormalizeResults): void => {
  if (!Array.isArray(state.corrections) || !Array.isArray(state.correctionHistory) || state.corrections.length > 50_000 || state.correctionHistory.length > 50_000 || state.revision !== state.history.length + state.correctionHistory.length) fail();
  const attempts = new Map(state.assessments.flatMap((assessment) => assessment.attempts.map((attempt) => [attempt.id, { attempt, assessment }] as const)));
  const byId = new Map<string, AssessmentCorrection>();
  const preceding = new Map<string, AssessmentCorrection | undefined>();
  const latest = new Map<string, AssessmentCorrection>();
  let rows = 0;
  for (const correction of state.corrections) {
    exact(correction, ["id", "assessmentId", "attemptId", "version", "reason", "openedAt", "openedBy", "state", "results", "publishedAt", "publishedBy"]);
    const target = attempts.get(correction.attemptId); const previous = latest.get(correction.attemptId);
    if (!target || target.assessment.id !== correction.assessmentId || target.attempt.state !== "published" || !text(correction.id) || byId.has(correction.id) || !text(correction.openedBy) || !text(correction.reason, 2, 500) || !timestamp(correction.openedAt)
      || correction.version !== (previous?.version ?? 1) + 1 || previous?.state === "draft" || Date.parse(correction.openedAt) < Date.parse(previous?.publishedAt ?? target.attempt.publishedAt!)) fail();
    const normalized = normalize(correction.results, target.attempt.studentIds, target.assessment.kind);
    if (!sameAssessmentResults(correction.results, normalized)) fail();
    rows += normalized.length; if (rows > 250_000) fail();
    if (correction.state === "published") {
      if (!timestamp(correction.publishedAt) || correction.publishedBy !== target.attempt.teacherId || Date.parse(correction.publishedAt) < Date.parse(correction.openedAt) || normalized.some((row) => row.outcome === null)) fail();
    } else if (correction.state !== "draft" || correction.publishedAt !== null || correction.publishedBy !== null) fail();
    preceding.set(correction.id, previous); byId.set(correction.id, correction); latest.set(correction.attemptId, correction);
  }
  const ids = new Set(state.history.map((entry) => entry.id));
  const replay = new Map<string, { state: "draft" | "published"; results: AssessmentResult[]; baseline: AssessmentResult[] }>();
  const effective = new Map<string, AssessmentResult[]>();
  let previousTime = -Infinity;
  for (const event of state.correctionHistory) {
    exact(event, ["id", "correctionId", "actorId", "occurredAt", "action", "results", ...(event.action === "opened" ? ["reason"] : [])]);
    const correction = byId.get(event.correctionId); const target = correction && attempts.get(correction.attemptId);
    if (!correction || !target || !text(event.id) || ids.has(event.id) || !text(event.actorId) || !timestamp(event.occurredAt) || Date.parse(event.occurredAt) < previousTime || Date.parse(event.occurredAt) < Date.parse(correction.openedAt)) fail();
    ids.add(event.id); previousTime = Date.parse(event.occurredAt);
    const normalized = normalize(event.results, target.attempt.studentIds, target.assessment.kind);
    if (!sameAssessmentResults(event.results, normalized)) fail(); rows += normalized.length; if (rows > 250_000) fail();
    const current = replay.get(correction.id);
    if (event.action === "opened") {
      const baseline = effective.get(correction.attemptId) ?? target.attempt.results;
      const previous = preceding.get(correction.id);
      if (current || event.id !== correction.id || event.actorId !== correction.openedBy || event.occurredAt !== correction.openedAt || event.reason !== correction.reason || !sameAssessmentResults(normalized, baseline) || previous && replay.get(previous.id)?.state !== "published") fail();
      replay.set(correction.id, { state: "draft", results: normalized, baseline });
    } else if (event.action === "results-saved" || event.action === "published") {
      if (!current || current.state !== "draft" || event.actorId !== target.attempt.teacherId) fail();
      if (event.action === "published") {
        if (event.occurredAt !== correction.publishedAt || event.actorId !== correction.publishedBy || !sameAssessmentResults(normalized, current.results) || normalized.some((row) => row.outcome === null) || sameAssessmentResults(normalized, current.baseline)) fail();
        effective.set(correction.attemptId, normalized);
      }
      replay.set(correction.id, { ...current, state: event.action === "published" ? "published" : "draft", results: normalized });
    } else fail();
  }
  for (const correction of state.corrections) {
    const current = replay.get(correction.id);
    if (!current || current.state !== correction.state || !sameAssessmentResults(current.results, correction.results)) fail();
  }
};

export const isAssessmentCorrectionCommand = (command: AssessmentCommand): command is CorrectionCommand => ["open-correction", "save-correction", "publish-correction"].includes(command.type);
export const applyAssessmentCorrection = (state: AssessmentDocument, command: CorrectionCommand, actor: PortalAccount, generated: { historyId: string; occurredAt: string }, normalize: NormalizeResults): AssessmentDocument => {
  const next = structuredClone(state);
  const assessment = next.assessments.find((entry) => entry.id === command.assessmentId);
  const attempt = assessment?.attempts.find((entry) => entry.id === command.attemptId);
  if (!assessment || !attempt || attempt.state !== "published") throw new Error("Исправление доступно только для опубликованной попытки.");
  let correction: AssessmentCorrection;
  let action: AssessmentCorrectionEvent["action"];
  if (command.type === "open-correction") {
    if (actor.role !== "configurator") throw new Error("Разрешить исправление может только настройщик.");
    if (!text(command.reason, 2, 500)) throw new Error("Укажите причину исправления от 2 до 500 символов одной строкой.");
    if (next.corrections.some((entry) => entry.attemptId === attempt.id && entry.state === "draft")) throw new Error("У этой попытки уже есть незавершённое исправление.");
    const publication = assessmentPublication(next, attempt);
    if (Date.parse(generated.occurredAt) < Date.parse(publication.publishedAt!)) throw new Error("Исправление не может предшествовать публикации ведомости.");
    correction = { id: generated.historyId, assessmentId: assessment.id, attemptId: attempt.id, version: publication.version + 1, reason: command.reason, openedAt: generated.occurredAt, openedBy: actor.id, state: "draft", results: structuredClone(publication.results), publishedAt: null, publishedBy: null };
    next.corrections.push(correction); action = "opened";
  } else {
    if (actor.role !== "teacher" || actor.id !== attempt.teacherId) throw new Error("Исправлять и публиковать результат может только назначенный преподаватель после разрешения настройщика.");
    const found = next.corrections.find((entry) => entry.id === command.correctionId && entry.assessmentId === assessment.id && entry.attemptId === attempt.id);
    if (!found || found.state !== "draft") throw new Error("Черновик исправления недоступен или уже опубликован.");
    correction = found;
    if (command.type === "save-correction") { correction.results = structuredClone(normalize(command.results, attempt.studentIds, assessment.kind)); action = "results-saved"; }
    else {
      if (correction.results.some((row) => row.outcome === null)) throw new Error("Заполните результат каждого участника перед публикацией исправления.");
      if (sameAssessmentResults(correction.results, assessmentPublication(next, attempt).results)) throw new Error("Результаты не изменились. Перед публикацией исправьте хотя бы один результат.");
      correction.state = "published"; correction.publishedAt = generated.occurredAt; correction.publishedBy = actor.id; action = "published";
    }
  }
  next.revision += 1;
  next.correctionHistory.push({ id: generated.historyId, correctionId: correction.id, actorId: actor.id, occurredAt: generated.occurredAt, action, results: structuredClone(correction.results), ...(command.type === "open-correction" ? { reason: command.reason } : {}) });
  return next;
};
