import type { AccountChange, AccountDraft, AccountsDocument, PortalAccount } from "./accounts";
import type { Person, PersonChange, PersonDraft } from "./personTypes";

const text = (value: unknown, min = 1, max = 256): value is string => typeof value === "string" && value.length >= min && value.length <= max && value.trim() === value && !Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const externalKey = (reference: Person["externalReference"]) => reference ? JSON.stringify([reference.source.normalize("NFKC").toLowerCase(), reference.value]) : "";
export const normalizePersonDraft = (draft: PersonDraft, persons: readonly Person[], excludedId?: string): PersonDraft => {
  if (!draft || typeof draft.name !== "string") throw new Error("Укажите имя человека.");
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (!text(name, 2, 120)) throw new Error("Укажите имя длиной от 2 до 120 символов.");
  const reference = draft.externalReference;
  if (reference && (!text(reference.source, 1, 120) || !text(reference.value, 1, 256))) throw new Error("Укажите источник и значение внешнего ID либо оставьте оба поля пустыми.");
  if (reference && persons.some(person => person.id !== excludedId && externalKey(person.externalReference) === externalKey(reference))) throw new Error("Такой внешний ID уже связан с человеком. Найдите существующую запись по источнику и ID.");
  return { name, ...(reference ? { externalReference: { ...reference } } : {}) };
};
const samePerson = (left: Person, right: Person) => left.id === right.id && left.name === right.name && left.revision === right.revision && left.createdAt === right.createdAt && left.updatedAt === right.updatedAt && left.legacyAccountId === right.legacyAccountId && externalKey(left.externalReference) === externalKey(right.externalReference)
  && left.externalReference?.source === right.externalReference?.source && left.externalReference?.value === right.externalReference?.value;

/** Stable legacy IDs are derived from exact account IDs; matching names never imply one person. */
export const migrateAccountPeople = (state: AccountsDocument): AccountsDocument => state.version === 2 ? state : {
  ...state, version: 2,
  accounts: state.accounts.map(account => ({ ...account, personId: `person:${account.id}` })),
  persons: state.accounts.map(account => ({ id: `person:${account.id}`, name: account.name, revision: 1, legacyAccountId: account.id,
    ...(account.createdAt ? { createdAt: account.createdAt } : {}),
  })), personHistory: [],
};

export const validateAccountPeople = (state: AccountsDocument): AccountsDocument => {
  if (state.version === 1) {
    if (state.persons !== undefined || state.personHistory !== undefined || state.accounts.some(account => account.personId !== undefined)) throw new Error("Связи людей требуют формата учётных записей версии 2.");
    return migrateAccountPeople(state);
  }
  if (!Array.isArray(state.persons) || !Array.isArray(state.personHistory) || state.persons.length > 50_000 || state.personHistory.length > 100_000) throw new Error("Повреждён реестр людей или его история.");
  const persons = new Map<string, Person>(), references = new Set<string>();
  const accounts = new Map(state.accounts.map(account => [account.id, account]));
  const checkPerson = (person: Person) => {
    const legacy = person && typeof person.legacyAccountId === "string" && accounts.has(person.legacyAccountId) && person.id === `person:${person.legacyAccountId}`;
    const validName = legacy ? typeof person.name === "string" && person.name.trim().replace(/\s+/g, " ").length >= 2 && person.name.trim().replace(/\s+/g, " ").length <= 120 : text(person?.name, 2, 120);
    if (!person || typeof person !== "object" || Array.isArray(person) || (!legacy && !text(person.id)) || !validName || !Number.isSafeInteger(person.revision) || person.revision < 1
      || Object.keys(person).some(key => !["id", "name", "revision", "externalReference", "createdAt", "updatedAt", "legacyAccountId"].includes(key))
      || [person.createdAt, person.updatedAt].some(value => value !== undefined && !timestamp(value))
      || person.legacyAccountId !== undefined && !legacy) throw new Error("Повреждена карточка человека.");
    const reference = person.externalReference;
    if (reference !== undefined && (!reference || typeof reference !== "object" || Array.isArray(reference) || Object.keys(reference).length !== 2 || !text(reference.source, 1, 120) || !text(reference.value))) throw new Error("Повреждён внешний ID человека.");
  };
  for (const person of state.persons) {
    checkPerson(person);
    const reference = externalKey(person.externalReference);
    if (persons.has(person.id) || reference && references.has(reference)) throw new Error("Повторяется ID человека или его внешний ID.");
    persons.set(person.id, person); if (reference) references.add(reference);
  }
  for (const account of state.accounts) {
    const person = typeof account.personId === "string" ? persons.get(account.personId) : undefined;
    if (!person || account.name !== person.name) throw new Error("Учётная запись не связана с человеком либо её имя расходится с реестром людей.");
  }
  const ids = new Set<string>(), latest = new Map<string, Person>();
  let previousTime = -Infinity;
  for (const event of state.personHistory) {
    if (!event || typeof event !== "object" || Array.isArray(event) || Object.keys(event).length !== 6 || !["id", "personId", "actorId", "occurredAt", "action", "snapshot"].every(key => Object.hasOwn(event, key))) throw new Error("Повреждена история людей.");
    checkPerson(event.snapshot);
    const person = persons.get(event.personId), previous = latest.get(event.personId);
    if (!text(event.id) || ids.has(event.id) || !person || !accounts.has(event.actorId) || !timestamp(event.occurredAt) || Date.parse(event.occurredAt) < previousTime
      || event.snapshot.id !== person.id || event.snapshot.legacyAccountId !== person.legacyAccountId || event.snapshot.revision !== (previous?.revision ?? (person.legacyAccountId ? 1 : 0)) + 1
      || event.action !== (!previous && !person.legacyAccountId ? "created" : "updated") || event.snapshot.updatedAt !== event.occurredAt
      || event.snapshot.createdAt !== person.createdAt || !timestamp(event.snapshot.createdAt ?? event.occurredAt) || Date.parse(event.occurredAt) < Date.parse(event.snapshot.createdAt ?? event.occurredAt)
      || event.action === "created" && event.snapshot.createdAt !== event.occurredAt) throw new Error("Нарушена последовательность истории людей.");
    ids.add(event.id); latest.set(event.personId, event.snapshot); previousTime = Date.parse(event.occurredAt);
  }
  for (const person of persons.values()) {
    const last = latest.get(person.id);
    if (last ? !samePerson(last, person) : !person.legacyAccountId || person.revision !== 1 || person.updatedAt !== undefined) throw new Error("Карточка человека расходится с историей.");
  }
  return state;
};

export const addPersonRecord = (source: AccountsDocument, draft: PersonDraft, id: string, eventId: string, actorId: string, occurredAt: string): AccountsDocument => {
  const state = migrateAccountPeople(source);
  if (!text(id) || state.persons!.some(person => person.id === id)) throw new Error("Не удалось создать уникальную запись человека.");
  const person: Person = { ...normalizePersonDraft(draft, state.persons!), id, revision: 1, createdAt: occurredAt, updatedAt: occurredAt };
  return { ...state, persons: [...state.persons!, person], personHistory: [...state.personHistory!, { id: eventId, personId: id, actorId, occurredAt, action: "created", snapshot: structuredClone(person) }] };
};

export const attachAccountPerson = (source: AccountsDocument, draft: AccountDraft, accountId: string, eventId: string, actorId: string, occurredAt: string, newPersonId?: string) => {
  const state = migrateAccountPeople(source);
  if (draft.personId !== undefined) {
    const person = state.persons!.find(row => row.id === draft.personId);
    if (!person) throw new Error("Выбранный человек недоступен. Обновите реестр и выберите его заново.");
    if (person.name.trim().replace(/\s+/g, " ") !== draft.name) throw new Error("Имя человека изменилось. Обновите выбор перед созданием учётной записи.");
    return { state, person };
  }
  const id = newPersonId ?? `person:${accountId}`;
  const next = addPersonRecord(state, { name: draft.name }, id, eventId, actorId, occurredAt);
  return { state: next, person: next.persons!.find(row => row.id === id)! };
};

/** Identity edits update every linked account in the same storage transaction; login/contact stay account-specific. */
export const replacePersonRecord = (state: AccountsDocument, person: Person, draft: PersonDraft, eventId: string, actorId: string, occurredAt: string, excludedAccountId?: string): AccountsDocument => {
  const normalized = normalizePersonDraft(draft, state.persons!, person.id);
  const next: Person = { ...person, ...normalized, revision: person.revision + 1, updatedAt: occurredAt };
  if (!normalized.externalReference) delete next.externalReference;
  const changes: AccountChange[] = [];
  const accounts: PortalAccount[] = state.accounts.map(account => {
    if (account.personId !== person.id || account.id === excludedAccountId || account.name === next.name) return account;
    changes.push({ id: `${eventId}:account:${changes.length}`, actorId, accountId: account.id, occurredAt, action: "details-changed", previousRole: account.role, nextRole: account.role, changes: [{ field: "name", before: account.name, after: next.name }] });
    return { ...account, name: next.name, scheduleName: undefined, revision: account.revision + 1, updatedAt: occurredAt };
  });
  const event: PersonChange = { id: eventId, personId: person.id, actorId, occurredAt, action: "updated", snapshot: structuredClone(next) };
  return { ...state, accounts, history: [...state.history, ...changes], persons: state.persons!.map(row => row.id === person.id ? next : row), personHistory: [...state.personHistory!, event] };
};
export const synchronizeAccountPerson = (state: AccountsDocument, accountId: string, change: AccountChange): AccountsDocument => {
  const account = state.accounts.find(row => row.id === accountId), person = state.persons?.find(row => row.id === account?.personId);
  return account && person && person.name !== account.name ? replacePersonRecord(state, person, { name: account.name, externalReference: person.externalReference }, change.id, change.actorId, change.occurredAt, accountId) : state;
};
