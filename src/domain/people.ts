import { authorizeAccountCommand, type AccountCommandContext, type AccountsDocument } from "./accounts";
import { addPersonRecord, migrateAccountPeople, normalizePersonDraft, replacePersonRecord, validateAccountPeople } from "./accountPeople";
import type { PersonDraft } from "./personTypes";
import { matchesSearchText } from "./search";

export interface PeopleQuery { query: string; page: number; personId?: string }
export const queryPeople = (state: AccountsDocument, query: PeopleQuery) => {
  if (typeof query.query !== "string" || query.query.length > 256 || !Number.isSafeInteger(query.page) || query.page < 1) throw new Error("Проверьте поиск и страницу реестра людей.");
  const source = migrateAccountPeople(state);
  const people = source.persons!.filter(person => (!query.personId || person.id === query.personId) && matchesSearchText([person.name, person.id, person.externalReference?.source ?? "", person.externalReference?.value ?? ""].join(" "), query.query))
    .sort((a, b) => a.name.localeCompare(b.name, "ru") || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(people.length / 20)), page = Math.min(query.page, pages);
  const items = people.slice((page - 1) * 20, page * 20), selected = new Set(items.map(person => person.id));
  return { items, total: people.length, page, pages, accounts: source.accounts.filter(account => selected.has(account.personId!)).map(({ id, personId, login, role }) => ({ id, personId: personId!, login, role })) };
};
export type PersonCommand = AccountCommandContext & ({ type: "create"; draft: PersonDraft } | { type: "update"; personId: string; personRevision: number; draft: PersonDraft });
export const applyPersonCommand = (source: AccountsDocument, command: PersonCommand, personId: string, changeId: string, occurredAt: string): AccountsDocument => {
  authorizeAccountCommand(source, command);
  const state = migrateAccountPeople(source);
  let next: AccountsDocument;
  if (command.type === "create") next = addPersonRecord(state, command.draft, personId, changeId, command.actorId, occurredAt);
  else if (command.type === "update") {
    const person = state.persons!.find(row => row.id === command.personId);
    if (!person || person.revision !== command.personRevision) throw new Error("Карточка человека изменилась. Обновите данные перед сохранением.");
    const draft = normalizePersonDraft(command.draft, state.persons!, person.id);
    if (draft.name === person.name && draft.externalReference?.source === person.externalReference?.source && draft.externalReference?.value === person.externalReference?.value) throw new Error("Данные человека не изменились.");
    next = replacePersonRecord(state, person, draft, changeId, command.actorId, occurredAt);
  } else throw new Error("Неизвестное действие в реестре людей.");
  return validateAccountPeople({ ...next, revision: state.revision + 1 });
};
