import { createBackupIssueCollector } from "./backupIssueCollector";
import { addBackupText, BACKUP_LIMITS, checkBackupAbort, createBackupBudget } from "./localBackup";
import { getRoomLegacyKeys, type Room, type RoomsDocument } from "./rooms";
import { getScheduleRoomKey } from "./roomKeys";
import type { ManagedLesson, ManagedScheduleSnapshot, SchedulePublicationVersion } from "./scheduleManagement";

const versionKey = (id: string, revision: number | undefined) => JSON.stringify([id, revision]);
const roomScope = (id: string) => JSON.stringify(["id", id]);
const legacyScope = (key: string) => JSON.stringify(["legacy", key]);
const lessonScope = (lesson: ManagedLesson) => lesson.roomId ? roomScope(lesson.roomId) : legacyScope(getScheduleRoomKey(lesson.room));
const weekKey = (version: SchedulePublicationVersion) => JSON.stringify([version.week.groupId, version.week.weekStart]);
interface PublishedLessons { versionId: string; lessons: ManagedLesson[] }

/** Replay exact room/publication histories; legacy labels are blocking candidates, never confirmed room identities. */
export async function inspectArchivedRoomPublicationHistory(document: RoomsDocument | undefined, schedule: ManagedScheduleSnapshot | undefined, completedAt: string, signal?: AbortSignal) {
  const { issues, add } = createBackupIssueCollector("истории аудиторий и публикаций"), budget = createBackupBudget();
  let work = 0, copies = 0, checked = 0, stale = 0, ambiguous = 0, archives = 0, protectedLessons = 0, blocked = 0;
  const step = async () => {
    if (++work > BACKUP_LIMITS.nodes) throw new Error("Сверка аудиторий с историей публикаций превышает предел операций. Частичный результат не создан.");
    if (work % 128 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    checkBackupAbort(signal);
  };
  const finding = (level: "error" | "review", code: string, message: string, recordId?: string, referenceId?: string) => add({ kind: "rooms", level, code, message, ...(recordId === undefined ? {} : { recordId }), ...(referenceId === undefined ? {} : { referenceId }) });
  try {
    checkBackupAbort(signal);
    const history = document?.history ?? [], publications = schedule?.publications ?? [];
    for (const rows of [history, publications]) if (rows.length > BACKUP_LIMITS.records) throw new Error("Источник истории аудиторий и публикаций превышает 25 000 событий. Частичный результат не создан.");
    if (!history.length && !publications.length) return { issues, summary: "История аудиторий и публикаций: читаемых событий нет." };
    const cutoff = Date.parse(completedAt);
    if (!Number.isFinite(cutoff)) throw new Error("Не определена граница исторической сверки аудиторий и публикаций.");
    const versions = new Map<string, { room: Room; time: number }>(), roomTies = new Set<string>();
    let previous = -Infinity;
    for (const event of history) {
      await step(); const time = Date.parse(event.occurredAt), key = versionKey(event.after.id, event.after.revision);
      if (!Number.isFinite(time) || time < previous || versions.has(key)) throw new Error("Нарушен порядок или уникальность исторических ревизий аудиторий.");
      previous = time; versions.set(key, { room: event.after, time }); addBackupText(budget, key);
      const tie = JSON.stringify([time, event.after.id]);
      if (!roomTies.has(tie)) addBackupText(budget, tie);
      roomTies.add(tie);
    }
    const publicationTies = new Map<number, Set<string>>(), publicationScopes = new Set<string>(), baselineIds = new Set<string>();
    const latest = new Map<string, Room>();
    let roomPosition = 0; previous = -Infinity;
    for (const publication of publications) {
      await step(); const time = Date.parse(publication.occurredAt), week = weekKey(publication);
      if (!Number.isFinite(time) || time < previous) throw new Error("Нарушен порядок публикаций при сверке аудиторий.");
      previous = time; copies += publication.week.lessons.length;
      if (copies > BACKUP_LIMITS.records) throw new Error("Копий занятий для сверки аудиторий больше 25 000. Частичный результат не создан.");
      addBackupText(budget, publication.id);
      const weeks = publicationTies.get(time) ?? new Set<string>();
      if (!weeks.has(week)) addBackupText(budget, JSON.stringify([time, week]));
      weeks.add(week); publicationTies.set(time, weeks);
      if (time <= cutoff) while (roomPosition < history.length && Date.parse(history[roomPosition].occurredAt) < time) {
        await step(); const event = history[roomPosition++]; latest.set(event.after.id, event.after);
      }
      const ids = new Set<string>();
      let legacy = false;
      for (const lesson of publication.week.lessons) {
        await step();
        if (ids.has(lesson.id) || publication.origin === "saved-snapshot" && baselineIds.has(lesson.id)) throw new Error("Версия публикации или общий начальный снимок содержат повторяющийся ID занятия. Частичная сверка аудиторий не создана.");
        ids.add(lesson.id); if (publication.origin === "saved-snapshot") baselineIds.add(lesson.id);
        const scope = lessonScope(lesson), tie = JSON.stringify([time, scope]);
        if (!publicationScopes.has(tie)) addBackupText(budget, tie);
        publicationScopes.add(tie);
        addBackupText(budget, JSON.stringify([lesson.id, scope, lesson.roomRevision]));
        if (time > cutoff || publication.origin === "saved-snapshot") continue;
        if (!lesson.roomId) { legacy = true; continue; }
        const declared = versions.get(versionKey(lesson.roomId, lesson.roomRevision));
        // Base room inspection handles missing/foreign snapshots and references from the future.
        if (!declared || declared.room.status !== "active" || declared.room.name !== lesson.room || declared.room.building !== lesson.roomBuilding || declared.time > time) continue;
        if (roomTies.has(JSON.stringify([time, lesson.roomId]))) {
          ambiguous++;
          finding("review", "ambiguous-publication-room-revision", "Публикация и изменение связанной аудитории имеют одинаковое время; актуальная ревизия не выбрана по порядку разных документов.", publication.id, lesson.id);
          continue;
        }
        checked++;
        if (latest.get(lesson.roomId)?.revision !== lesson.roomRevision) {
          stale++;
          finding("error", "stale-publication-room-revision", "Обычная публикация ссылается на уже заменённую ревизию аудитории; действующая проверка требует актуальную карточку на момент публикации.", publication.id, lesson.id);
        }
      }
      if (legacy) finding("review", "unconfirmed-publication-legacy-room", "У занятия сохранено только старое название аудитории. Допустимость сохранения прежней пары без явного ID не подтверждена историей черновиков.", publication.id);
      if (time > cutoff) finding("review", "unchecked-room-publication-after-cutoff", "Публикация позже границы архива не подтверждает исторические зависимости аудитории.", publication.id);
      else if (publication.origin === "saved-snapshot" && publication.week.lessons.length) finding("review", "unconfirmed-baseline-room-selection", "Начальный снимок фиксирует прежние ссылки аудиторий при захвате. Актуальность карточки при исходной публикации по последней ревизии на момент захвата не определялась.", publication.id);
    }
    const active = new Map<string, Map<string, PublishedLessons>>(), weekScopes = new Map<string, Set<string>>(), pastKeys = new Map<string, Set<string>>();
    let publicationPosition = 0;
    for (const event of history) {
      await step(); const time = Date.parse(event.occurredAt), keys = pastKeys.get(event.after.id) ?? new Set<string>();
      // The live archive guard considers every earlier name/alias, including labels from old revisions.
      for (const room of [event.before, event.after]) if (room) for (const key of getRoomLegacyKeys(room)) {
        await step(); if (!keys.has(key)) addBackupText(budget, JSON.stringify([event.after.id, key])); keys.add(key);
      }
      pastKeys.set(event.after.id, keys);
      if (event.before?.status !== "active" || event.after.status !== "archived") continue;
      archives++;
      if (time > cutoff) {
        finding("review", "unchecked-room-archive-after-cutoff", "Архивирование аудитории позже границы архива не сопоставлялось с публикациями.", event.id);
        continue;
      }
      while (publicationPosition < publications.length && Date.parse(publications[publicationPosition].occurredAt) < time) {
        await step(); const publication = publications[publicationPosition++], week = weekKey(publication);
        for (const scope of weekScopes.get(week) ?? []) {
          await step(); const weeks = active.get(scope)!; weeks.delete(week); if (!weeks.size) active.delete(scope);
        }
        const scopes = new Set<string>();
        for (const lesson of publication.week.lessons) {
          await step(); const scope = lessonScope(lesson), weeks = active.get(scope) ?? new Map<string, PublishedLessons>();
          if (!scopes.has(scope)) { weeks.set(week, { versionId: publication.id, lessons: [] }); scopes.add(scope); }
          weeks.get(week)!.lessons.push(lesson); active.set(scope, weeks);
        }
        weekScopes.set(week, scopes);
      }
      const tiedWeeks = publicationTies.get(time);
      let tied = false, eventBlocked = false;
      for (const scope of [roomScope(event.after.id), ...Array.from(keys, legacyScope)]) {
        await step(); if (publicationScopes.has(JSON.stringify([time, scope]))) tied = true;
        for (const [week, publication] of active.get(scope) ?? []) {
          await step(); if (tiedWeeks?.has(week)) { tied = true; continue; }
          for (const lesson of publication.lessons) {
            await step(); const end = Date.parse(`${lesson.date}T${lesson.endsAt}:00+03:00`);
            if (!Number.isFinite(end)) throw new Error("Историческая публикация не содержит корректного времени окончания занятия.");
            if (end <= time) continue;
            protectedLessons++; eventBlocked = true;
            finding("error", lesson.roomId ? "archived-room-needed-by-future-publication" : "archived-room-legacy-candidate-needed", lesson.roomId ? "Аудитория архивирована при существовавшем будущем опубликованном занятии с её точным ID; действующее правило запрещает такое архивирование." : "Старое название будущего опубликованного занятия соответствовало одному из прежних названий этой аудитории. По действующему правилу такой кандидат запрещает архивирование, даже если личность аудитории не подтверждена.", event.id, JSON.stringify([publication.versionId, lesson.id]));
          }
        }
      }
      if (eventBlocked) blocked++;
      if (tied) {
        ambiguous++;
        finding("review", "ambiguous-room-archive-publication-order", "Связанная публикация и архивирование аудитории имеют одинаковое время. Состояние затронутой недели до архивирования не определено порядком разных документов.", event.id);
      }
    }
    if (!document && publications.length) finding("review", "unchecked-room-history-source", "Полный источник аудиторий отсутствует; исторические состояния и прежние названия не подставлялись из текущих карточек.");
    if (archives) finding("review", "unconfirmed-room-archive-drafts-and-coverage", "Проверена только защита будущих занятий из строго предшествующих версий публикаций. История черновиков и полнота раннего расписания не подтверждены; текущие черновики и оставшийся журнал не подставлялись в прошлое.");
    const summary = `История аудиторий и публикаций: копий занятий ${copies}; сверенных актуальных ревизий ${checked}; заменённых ревизий ${stale}; архивирований ${archives}; сопоставлений защищённых будущих занятий ${protectedLessons}; архивирований с известным запретом ${blocked}; неоднозначных событий ${ambiguous}. Исторические права, черновики и полнота ранних данных этим не подтверждены.`;
    finding("review", "room-publication-history-summary", summary);
    checkBackupAbort(signal);
    return { issues, summary };
  } catch (error) {
    if (!(error instanceof Error && error.name === "AbortError")) console.error("Не удалось сверить историю аудиторий с опубликованным расписанием:", error);
    throw error;
  }
}
