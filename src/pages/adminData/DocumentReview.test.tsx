import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DocumentReview from "./DocumentReview";
import { inspectBackupDocuments, type BackupDocumentReview } from "../../domain/localBackupDocuments";
import { coreBackupFixture, scheduleConflictBackupFixture, materialBackupFixture, materialIndexBackupFixture, learningBackupFixture, learningFileBackupFixture, journalBackupFixture, plannerBackupFixture, notificationBackupFixture, notificationTargetBackupFixture, settingsBackupFixture, messagingBackupFixture, messagingReplyBackupFixture, messageFileBackupFixture, replaceMessageFileBlob } from "../../testSupport/localBackupDocuments";

describe("archive document review presentation", () => {
  it("keeps area details collapsed while exposing statuses, counts and finding controls", async () => {
    const fixture = coreBackupFixture(); fixture.accounts.accounts[1].memberships[0].subjectId = "missing-subject"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    const checks = html.slice(html.indexOf("<ul"), html.indexOf("</ul>") + 5);
    expect(checks).toContain("<details"); expect(checks).not.toMatch(/<details[^>]*\sopen(?:=|>)/);
    expect(checks).toContain("Учётные записи"); expect(checks).toContain("ошибок: 1");
    expect(html).toContain('aria-label="Тип замечаний к архиву"'); expect(html).toContain('role="tablist"');
    expect(html).toContain("Все области"); expect(html).toContain("Найти замечание по тексту или ID"); expect(html).toContain('placeholder=""');
    expect(html).toContain("Найдено: 1 из 1"); expect(html).toContain('aria-label="Замечания к архиву"');
    expect(html).not.toContain("Иван Петров");
  });
  it.each(["код", "\\u0061"])("shows current unique-index collisions without exposing values or implying future write compatibility: %s", async (field) => {
    const fixture = await materialIndexBackupFixture(); fixture.archive.databases[0].stores[0].indexes[1].name = "index-<script>";
    fixture.archive.databases[0].stores[0].indexes[1].keyPath = [`реквизиты.${field}`, "scope"];
    for (const record of fixture.records) {
      if (record.value.type !== "object") throw new Error("Expected material object");
      record.value.entries.push(["реквизиты", { type: "object", entries: [[field, { type: "string", value: "PRIVATE" }]] }]);
    }
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("сверены текущие ключи: 1; требуют отдельной сверки: 0; конфликтующих записей: 1");
    expect(html).toContain("В сохранённых файловых записях повторяется ключ дополнительного уникального индекса");
    expect(html).toContain("Схема прочитана"); expect(html).toContain("Ошибки в данных: 1"); expect(html).toContain("material-2");
    expect(html).toContain("index-&lt;script&gt;"); expect(html).not.toContain("index-<script>"); expect(html).not.toContain("PRIVATE");
    expect(html).toContain("Отсутствие текущих коллизий не подтверждает совместимость будущих записей");
  });
  it("shows journal-area findings separately without revealing the URL or private catalog IDs", async () => {
    const fixture = notificationTargetBackupFixture(); fixture.notifications[0].id = "notice-<script>";
    fixture.notifications[0].href = "/journal/subject-1/PRIVATE-MISSING?tab=journal"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Учебных областей ссылок журнала: 1; сопоставлено: 0; не подтверждено: 1");
    expect(html).toContain("Дисциплина или группа цели не найдена"); expect(html).toContain("Требуют проверки: 1");
    expect(html).toContain("notice-&lt;script&gt;"); expect(html).not.toContain("notice-<script>");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("tab=journal");
  });
  it("shows a notification target conflict with escaped notice ID and no href or private content", async () => {
    const fixture = notificationTargetBackupFixture(); fixture.notifications[0].id = "notice-<script>";
    fixture.assignments.push({ ...fixture.assignments[0], id: "other-task" }); fixture.submissions[0].assignmentId = "other-task"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Целей заданий и ответов: 1; сопоставлено: 0; не подтверждено: 1");
    expect(html).toContain("Сохранённый ответ из ссылки относится к другому ID задания"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain("notice-&lt;script&gt;"); expect(html).not.toContain("notice-<script>");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("assignment="); expect(html).toContain("а не права получателя");
  });
  it("shows published schedule conflicts without hiding schema readability or exposing lesson details", async () => {
    const fixture = scheduleConflictBackupFixture(); fixture.second.id = "managed:<script>"; fixture.schedule.journal[1].id = fixture.second.id; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Пересечений в публикации: 3; внутри черновиков: 0");
    expect(html).toContain("В сохранённой публикации пересекается время занятий преподавателя");
    expect(html).toContain("Схема прочитана"); expect(html).toContain("Ошибки в данных: 3");
    expect(html).toContain("managed:&lt;script&gt;"); expect(html).not.toContain("managed:<script>"); expect(html).not.toContain("PRIVATE");
    expect(html).toContain("Проверка не подтверждает готовность к публикации или восстановлению");
  });
  it("shows archived group dependencies separately from schema readability and escapes technical IDs", async () => {
    const fixture = coreBackupFixture(); fixture.groups.groups[0].status = "archived";
    fixture.groups.groups[0].name = "PRIVATE GROUP"; fixture.accounts.accounts[2].name = "PRIVATE STUDENT"; fixture.accounts.accounts[2].id = "student-<script>";
    fixture.save(); const before = JSON.stringify(fixture.archive);
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Архивированных групп: 1. Связей с учащимися: 1; назначений преподавателей: 1; пар черновиков: 1");
    expect(html).toContain("Схема прочитана"); expect(html).toContain("Ошибки в данных: 3");
    expect(html).toContain("В архивированной группе сохранён студент"); expect(html).toContain("student-&lt;script&gt;");
    expect(html).not.toContain("student-<script>"); expect(html).not.toContain("PRIVATE");
    expect(html).toContain("не проверка истории архивирования"); expect(JSON.stringify(fixture.archive)).toBe(before);
  });
  it("shows material binary metadata conflicts without exposing names, descriptions or file bytes", async () => {
    const fixture = await materialBackupFixture(); const record = fixture.records[0].value;
    if (record.type !== "object") throw new Error("Expected material"); record.entries.find(([key]) => key === "name")![1] = { type: "string", value: "PRIVATE CONFLICT" };
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Материалы"); expect(html).toContain("Записей материалов: 1; прочитано: 1; не читается: 0");
    expect(html).toContain("Метаданные материала расходятся"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain("material-1"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("base64"); expect(html).toContain("Наличие ID не подтверждает права участников");
  });
  it("shows learning-file conflicts and comparison limits without exposing names or file contents", async () => {
    const fixture = await learningFileBackupFixture(); fixture.assignments[0].attachmentName = "PRIVATE CONFLICT.txt"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Ссылок на учебные файлы из читаемых списков: 1; найдено файлов по ID: 1; сравнено имён: 1");
    expect(html).toContain("Имя вложения в учебной записи не совпадает"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain("task-file"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("base64");
    expect(html).toContain("В файловой записи нет владельца и учебной области"); expect(html).toContain("Сверка материалов, учебных файлов");
  });
  it("shows incomplete captured actor context without filling it from current accounts or exposing names", async () => {
    const fixture = journalBackupFixture(); delete fixture.changes[0].actor.role; delete fixture.changes[0].actor.memberships; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Сохранённый контекст автора: соответствует текущему контракту 0; расходится 0; не хватает данных 1; не определена область 0");
    expect(html).toContain("В событии не сохранена роль или учебные назначения автора"); expect(html).toContain("Требуют проверки: 1");
    expect(html).toContain("Схема прочитана"); expect(html).toContain("change-1"); expect(html).not.toContain("PRIVATE");
    expect(html).toContain("Это сверка утверждений внутри события, а не подтверждение реальных прав на его дату");
  });
  it("shows missing historical actors as review with escaped event IDs and no names", async () => {
    const fixture = journalBackupFixture(); fixture.changes[0].actor.id = "old-teacher"; fixture.changes[0].id = "change-<script>"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Ссылок на ID учёток архива: найдено 1; отсутствует 1; не проверено 0");
    expect(html).toContain("В архиве нет учётной записи с ID автора события журнала"); expect(html).toContain("Требуют проверки: 1");
    expect(html).toContain("change-&lt;script&gt;"); expect(html).not.toContain("change-<script>"); expect(html).not.toContain("PRIVATE");
  });
  it("shows draft-only lesson references separately from readable journal schemas without exposing identities", async () => {
    const fixture = journalBackupFixture(); fixture.schedule.journal.length = 0; fixture.schedule.published.length = 0; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Связей с сохранёнными занятиями своей дисциплины и группы: 0; не подтверждено: 1");
    expect(html).toContain("ID занятия найден только в черновиках расписания"); expect(html).toContain("Требуют проверки: 2");
    expect(html).toContain("Схема прочитана"); expect(html).toContain("change-1"); expect(html).toContain("managed:lesson-1"); expect(html).not.toContain("PRIVATE");
  });
  it("distinguishes readable journal lists from unresolved teaching-area keys without exposing names", async () => {
    const fixture = journalBackupFixture();
    for (const entry of fixture.archive.localStorage) if (entry.key === fixture.journalKey || entry.key === fixture.historyKey) entry.key += ":unknown";
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Поддерживаемых ключей с однозначной парой ID из каталогов архива: 0; учебная область не подтверждена: 1");
    expect(html).toContain("Ключ не удалось однозначно связать с парой ID"); expect(html).toContain("Требуют проверки: 2");
    expect(html).toContain("Схема прочитана"); expect(html).toContain(`${fixture.historyKey}:unknown`); expect(html).not.toContain("PRIVATE");
  });
  it("shows a journal snapshot conflict as review with an event ID and no cell values", async () => {
    const fixture = journalBackupFixture(); fixture.students[0].attendance["managed:lesson-1"] = "sick"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Сверено последних применимых изменений с ячейками архивных журналов: 1; не удалось сверить: 0");
    expect(html).toContain("Результат последнего применимого события не совпадает"); expect(html).toContain("Требуют проверки: 1");
    expect(html).toContain("Схема прочитана"); expect(html).toContain(fixture.historyKey); expect(html).toContain("change-1");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("sick"); expect(html).not.toContain("present");
  });
  it("shows a retained-history gap as review without exposing the two cell values", async () => {
    const fixture = journalBackupFixture(); const original = fixture.changes[0];
    fixture.changes.splice(0, 1, { ...original, id: "change-new", previousValue: "sick", nextValue: "present" }, { ...original, id: "change-old", previousValue: "unmarked", nextValue: "absent" }); fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Сопоставлено пар соседних изменений из читаемых списков: 1"); expect(html).toContain("Предыдущее значение более нового события не совпадает");
    expect(html).toContain("Требуют проверки: 1"); expect(html).toContain("change-new"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("sick");
  });
  it("distinguishes readable history from an invalid grade event without exposing historical names or values", async () => {
    const fixture = journalBackupFixture(); fixture.changes[0].field = "grade"; fixture.changes[0].previousValue = null; fixture.changes[0].nextValue = "PRIVATE INVALID GRADE"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("соответствие значений типу события"); expect(html).toContain("Значения события оценки должны быть целым числом от 2 до 5");
    expect(html).toContain("Схема прочитана"); expect(html).toContain("ошибок: 1"); expect(html).toContain("change-1"); expect(html).not.toContain("PRIVATE");
  });
  it("shows a content conflict and comparison count without exposing file names or bytes", async () => {
    const fixture = await messageFileBackupFixture();
    await replaceMessageFileBlob(fixture.records[1], new File(["PRIVATE FILE BODX"], fixture.peerAttachment.name, { type: fixture.peerAttachment.type }));
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Сопоставлено пар вложений по содержимому: 1"); expect(html).toContain("Содержимое копий вложения одного личного сообщения различается");
    expect(html).toContain("Ошибки в данных: 1"); expect(html).toContain("own-file"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("base64");
  });
  it("shows an attachment scope error with technical IDs and no file names or contents", async () => {
    const fixture = await messageFileBackupFixture(); const value = fixture.records[0].value;
    if (value.type !== "object") throw new Error("Missing file fixture");
    value.entries.find(([key]) => key === "scope")![1] = { type: "string", value: "student:another-owner:teacher-1" };
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Файловых записей: 2; ссылок из читаемых сообщений: 2"); expect(html).toContain("Область файла не совпадает с ящиком и диалогом");
    expect(html).toContain("Ошибки в данных: 1"); expect(html).toContain("own-file"); expect(html).not.toContain("PRIVATE"); expect(html).not.toContain("another-owner");
  });
  it("shows a cyclic reply chain without displaying any message contents", async () => {
    const fixture = messagingReplyBackupFixture();
    Object.assign(fixture.messaging.users["bi-university-messages-v2:student:student-1"].messages["teacher-1"][0], { replyTo: 3 });
    Object.assign(fixture.messaging.users["bi-university-messages-v2:teacher:teacher-1"].messages["student-1"][0], { replyTo: 3 }); fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Цепочки проверяются на циклы и расхождения дат"); expect(html).toContain("замкнутый круг из нескольких сообщений");
    expect(html).toContain("Ошибки в данных: 2"); expect(html).toContain("bi-university-messages-v2:student:student-1"); expect(html).not.toContain("PRIVATE");
  });
  it("shows a conflicting reply source without exposing either original message", async () => {
    const fixture = messagingReplyBackupFixture(); fixture.peerReply.replyTo = 2; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Ссылки ответов сопоставляются по ID доставки сохранённых исходных сообщений");
    expect(html).toContain("Копии с одним ID доставки расходятся: ссылка ответа"); expect(html).toContain("ошибок: 1");
    expect(html).toContain("bi-university-messages-v2:student:student-1"); expect(html).not.toContain("PRIVATE");
  });
  it("shows delivery comparison scope and the conflicting field without displaying private messages", async () => {
    const fixture = messagingBackupFixture();
    fixture.messaging.users["bi-university-messages-v2:teacher:teacher-1"].messages["student-1"][0].text = "PRIVATE CONFLICT"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Сопоставлено пар личных сообщений в общем документе: 1");
    expect(html).toContain("Копии с одним ID доставки расходятся: текст"); expect(html).toContain("ошибок: 1");
    expect(html).toContain("отсутствие второй копии не доказывает сбой отправки"); expect(html).not.toContain("PRIVATE");
  });
  it("shows a messaging summary and exact reply reference without exposing correspondence", async () => {
    const fixture = messagingBackupFixture();
    Object.assign(fixture.messaging.users["bi-university-messages-v2:student:student-1"].messages["teacher-1"][0], { replyTo: 99 }); fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Переписка"); expect(html).toContain("записей: 2"); expect(html).toContain("списков: 1");
    expect(html).toContain("bi-university-messages-v3"); expect(html).toContain("bi-university-messages-v2:student:student-1");
    expect(html).toContain("Исходное сообщение ответа не найдено"); expect(html).not.toContain("PRIVATE");
  });
  it("lists supported schemas and absent learning data without claiming recovery or complete validation", async () => {
    const review = await inspectBackupDocuments(coreBackupFixture().archive, "configurator-demo"); const html = renderToStaticMarkup(<DocumentReview review={review} />);
    for (const text of ["Учётные записи", "Группы", "Дисциплины", "Расписание", "Задания", "Ответы и попытки", "Журналы", "История журналов", "Нет в архиве", "Схема прочитана", "ревизия 1", "Отсутствие замечаний здесь не означает"]) expect(html).toContain(text);
    expect(html).not.toContain("Готов к восстановлению"); expect(html).not.toContain("Восстановить</button>");
  });
  it("summarizes journal lists and exposes an exact damaged list key without student or actor names", async () => {
    const fixture = journalBackupFixture();
    fixture.archive.localStorage.push({ key: `${fixture.journalKey}-other`, raw: "[null]" });
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("списков: 2"); expect(html).toContain("прочитано: 1; не читается: 1");
    expect(html).toContain(`${fixture.journalKey}-other`); expect(html).toContain("История журналов");
    expect(html).toContain("исторический состав группы и права ещё не подтверждены");
    expect(html).not.toContain("PRIVATE");
  });
  it("shows planner keys and escaped task IDs without revealing their titles or descriptions", async () => {
    const fixture = plannerBackupFixture(); fixture.notes[0].id = "<script>record</script>"; fixture.notes[0].endAt = fixture.notes[0].startAt; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Планировщики"); expect(html).toContain("списков: 1"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain(fixture.plannerKey); expect(html).toContain("ID записи: &lt;script&gt;record&lt;/script&gt;");
    expect(html).not.toContain("<script>"); expect(html).not.toContain("PRIVATE");
  });
  it("presents notification errors by ID without rendering their content or opening saved links", async () => {
    const fixture = notificationBackupFixture(); fixture.notifications[0].href = "//PRIVATE.example"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Уведомления"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain("ID записи: notice-1"); expect(html).toContain("Ссылка уведомления не соответствует допустимому внутреннему адресу");
    expect(html).not.toContain("PRIVATE"); expect(html).not.toContain('href="//');
  });
  it("labels scalar settings by keys and shows a bad key without its saved value", async () => {
    const fixture = settingsBackupFixture(); fixture.settings[0].raw = "PRIVATE THEME"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Настройки браузера"); expect(html).toContain("ключей: 6"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain("bi-university-theme"); expect(html).toContain("Настройки не применялись");
    expect(html).not.toContain("PRIVATE");
  });
  it("keeps invalid source reasons and unverified dependencies visible, exposing no raw document contents", async () => {
    const fixture = coreBackupFixture(); fixture.archive.localStorage[0].raw = '{"secret":"private-data"BROKEN';
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Не читается"); expect(html).toContain("Некорректный JSON внутри документа"); expect(html).toContain("Ошибки в данных: 1"); expect(html).toContain("Замечания к документам"); expect(html).not.toContain("private-data");
  });
  it("shows counts and learning findings without displaying answer contents", async () => {
    const fixture = learningBackupFixture(); fixture.submissions[0].assignmentId = "missing-task"; fixture.save();
    const review = await inspectBackupDocuments(fixture.archive, "configurator-demo");
    const html = renderToStaticMarkup(<DocumentReview review={review} />);
    expect(html).toContain("Ответы и попытки"); expect(html).toContain("записей: 1");
    expect(html).toContain("missing-task"); expect(html).toContain("Ошибки в данных: 1");
    expect(html).toContain("Сверка материалов, учебных файлов");
    expect(html).not.toContain("PRIVATE");
  });
  it("shows readable schema status alongside semantic errors without exposing conflicting answers", async () => {
    const fixture = learningBackupFixture(); fixture.submissions[0].text = "PRIVATE CONFLICT"; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html).toContain("Схема прочитана"); expect(html).toContain("Ошибки в данных: 1");
    expect(html.split("</ul>")[0]).toContain("ошибок: 1");
    expect(html).toContain("Поля карточки ответа расходятся с последней попыткой: текст ответа");
    expect(html).toContain("answer-1"); expect(html).not.toContain("PRIVATE");
  });
  it("shows review counts next to the affected document even when its schema is readable", async () => {
    const fixture = learningBackupFixture(); delete fixture.submissions[0].attempts; fixture.submissions[0].attemptCount = 3; fixture.save();
    const html = renderToStaticMarkup(<DocumentReview review={await inspectBackupDocuments(fixture.archive, "configurator-demo")} />);
    expect(html.split("</ul>")[0]).toContain("проверить: 1");
    expect(html.split("</ul>")[0]).not.toContain("ошибок:");
    expect(html).toContain("Счётчик ответа не подтверждается сохранённой историей");
    expect(html).not.toContain("PRIVATE");
  });
  it("paginates all issues beyond 200 without rendering the whole list and escapes reference IDs", () => {
    const review: BackupDocumentReview = { checks: [], counts: { valid: 4, invalid: 0, absent: 0, unchecked: 11, errors: 230, reviews: 0 }, issues: Array.from({ length: 230 }, (_, index) => ({ level: "error", kind: "accounts", code: "missing-group", referenceId: index === 0 ? "<script>bad()</script>" : `id-${index}`, message: "Связь недоступна" })) };
    const html = renderToStaticMarkup(<DocumentReview review={review} />);
    expect((html.match(/<li>/g) ?? []).length).toBe(10); expect(html).toContain("Страница 1 из 23"); expect(html).toContain("Другие локальные записи: 11"); expect(html).not.toContain("id-10");
    expect(html).not.toContain("Показаны первые");
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
  });
});
