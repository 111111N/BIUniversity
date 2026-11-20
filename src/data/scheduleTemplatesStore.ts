import { readAccountsState, subscribeAccounts } from "./accountStore";
import { readManagedScheduleState, subscribeManagedSchedule } from "./managedScheduleStore";
import { readScheduleTemplatesDocument, subscribeScheduleTemplates, SCHEDULE_TEMPLATES_CHANGE_EVENT } from "./scheduleTemplatesRead";
import { executeAdministrationWrite } from "./administrationWrite";
import { isAccountActive } from "../domain/accounts";
import { subscribeSubjectCatalog } from "./subjectCatalogStore";
import { appendScheduleTemplate, normalizeTemplateName, templateNameKey, SCHEDULE_TEMPLATES_KEY, type ScheduleTemplate, type ScheduleTemplateCommand, type ScheduleTemplateContext } from "../domain/scheduleTemplates";

const sources = (actorId: string) => {
  const accounts = readAccountsState();
  if (accounts.error) throw new Error(accounts.error);
  const actor = accounts.accounts.find(row => row.id === actorId && row.role === "configurator" && isAccountActive(row));
  if (!actor) throw new Error("Шаблоны расписания доступны только активному настройщику.");
  const schedule = readManagedScheduleState();
  if (schedule.error) throw new Error(schedule.error);
  const state = readScheduleTemplatesDocument(), context: ScheduleTemplateContext = { actorId, actorRevision: actor.revision, expectedRevision: state.revision, accountsRevision: accounts.revision, scheduleRevision: schedule.snapshot.revision };
  return { actor, accounts, schedule: schedule.snapshot, state, context };
};
const checkContext = (expected: ScheduleTemplateContext, actual: ScheduleTemplateContext) => {
  if ((["actorId", "actorRevision", "expectedRevision", "accountsRevision", "scheduleRevision"] as const).some(key => expected[key] !== actual[key])) throw new Error("Шаблоны, расписание или доступ изменились. Обновите проверку; введённые данные сохранены.");
};
export const scheduleTemplatesService = {
  async read(actorId: string) {
    try { const source = sources(actorId), publications = new Map(source.schedule.publications?.map(row => [row.id, row])); return { context: source.context, templates: source.state.templates.map(row => { const publication = publications.get(row.publicationId); return { ...row, source: publication ? { groupId: publication.week.groupId, weekStart: publication.week.weekStart, number: publication.number, lessons: publication.week.lessons.length } : null }; }) }; }
    catch (error) { console.error("Не удалось прочитать шаблоны расписания:", error); throw error; }
  },
  async execute(command: ScheduleTemplateCommand) {
    const captured = structuredClone(command);
    return executeAdministrationWrite(() => {
      try {
        const source = sources(captured.actorId); checkContext(captured, source.context);
        if (source.state.history.length >= 20000 || captured.type === "create" && source.state.templates.length >= 5000) throw new Error("Достигнут предел локального справочника шаблонов. Исходные записи сохранены; требуется перенос хранилища на сервер.");
        const before = captured.type === "create" ? null : source.state.templates.find(row => row.id === captured.templateId);
        if (captured.type !== "create" && (!before || before.revision !== captured.templateRevision)) throw new Error("Шаблон изменился. Откройте актуальную карточку; ввод сохранён.");
        if (captured.type === "restore" && !source.schedule.publications?.some(row => row.id === before!.publicationId && row.week.lessons.length > 0)) throw new Error("Исходная публикация недоступна. Восстановите её источник перед возвращением шаблона.");
        const occurredAt = new Date().toISOString();
        if ((source.state.history.at(-1)?.occurredAt ?? "") > occurredAt) throw new Error("Время изменения шаблона предшествует последнему событию. Проверьте системные часы; исходные данные сохранены.");
        if (captured.type === "create") {
          const publication = source.schedule.publications?.find(row => row.id === captured.publicationId);
          if (!publication) throw new Error("Исходная версия публикации недоступна. Выберите её заново в архиве.");
          if (!publication.week.lessons.length) throw new Error("В выбранной публикации нет занятий для шаблона.");
          if (publication.occurredAt > occurredAt) throw new Error("Время сохранения шаблона предшествует исходной публикации. Проверьте системные часы.");
        }
        const name = captured.type === "create" || captured.type === "rename" ? normalizeTemplateName(captured.name) : before!.name;
        if (name.length < 2 || name.length > 160 || Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error("Укажите название шаблона длиной от 2 до 160 символов.");
        if (captured.type === "archive" && before!.status === "archived" || captured.type === "restore" && before!.status === "active" || captured.type === "rename" && before!.name === name) throw new Error("Шаблон не изменился.");
        const status = captured.type === "archive" ? "archived" : captured.type === "restore" || captured.type === "create" ? "active" : before!.status;
        if (status === "active" && source.state.templates.some(row => row.id !== before?.id && row.status === "active" && templateNameKey(row.name) === templateNameKey(name))) throw new Error("Действующий шаблон с таким названием уже существует. Укажите другое название.");
        const after: ScheduleTemplate = { id: before?.id ?? crypto.randomUUID(), revision: (before?.revision ?? 0) + 1, name, publicationId: captured.type === "create" ? captured.publicationId : before!.publicationId, status };
        const next = appendScheduleTemplate(source.state, after, { id: crypto.randomUUID(), actorId: source.actor.id, occurredAt });
        localStorage.setItem(SCHEDULE_TEMPLATES_KEY, JSON.stringify(next)); window.dispatchEvent(new Event(SCHEDULE_TEMPLATES_CHANGE_EVENT));
      } catch (error) { console.error("Не удалось сохранить шаблон расписания. Исходные данные сохранены:", error); throw error; }
    });
  },
  async history(context: ScheduleTemplateContext, templateId: string, page: number) {
    try {
      const source = sources(context.actorId); checkContext(context, source.context);
      if (!source.state.templates.some(row => row.id === templateId)) throw new Error("Шаблон недоступен.");
      const all = source.state.history.filter(row => row.after.id === templateId).reverse(), pages = Math.max(1, Math.ceil(all.length / 20));
      if (!Number.isSafeInteger(page) || page < 1 || page > pages) throw new Error("Выберите корректную страницу истории.");
      return { items: all.slice((page - 1) * 20, page * 20).map(event => ({ ...event, actorName: source.accounts.accounts.find(row => row.id === event.actorId)?.name ?? "Учётная запись недоступна" })), page, pages };
    } catch (error) { console.error("Не удалось прочитать историю шаблона:", error); throw error; }
  },
  subscribe(listener: () => void) { const stops = [subscribeAccounts(listener), subscribeManagedSchedule(listener), subscribeScheduleTemplates(listener), subscribeSubjectCatalog(listener)]; return () => stops.forEach(stop => stop()); },
};
export type ScheduleTemplatesSnapshot = Awaited<ReturnType<typeof scheduleTemplatesService.read>>;
