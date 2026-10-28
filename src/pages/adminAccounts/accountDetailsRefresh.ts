import { isAccountActive, type AccountDraft, type AccountIdentityField, type PortalAccount } from "../../domain/accounts";

export interface AccountDetailsEditor {
  account: PortalAccount; draft: AccountDraft; baseline: string;
  revision: number; actorId: string; actorRevision: number;
}
export interface AccountDetailsSource {
  revision: number; accounts: PortalAccount[]; actorId: string; error?: string;
}
export interface AccountDetailsReview {
  accountId: string; accountRevision: number; revision: number; actorId: string; actorRevision: number;
  baseRevision: number; baseAccountRevision: number; latest: PortalAccount;
}

const fields: AccountIdentityField[] = ["name", "login", "email"];
const value = (account: Pick<AccountDraft, AccountIdentityField>, field: AccountIdentityField) => account[field] ?? "";
const copyAccount = (account: PortalAccount): PortalAccount => ({ ...account, memberships: account.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })), ...(account.studentRecord ? { studentRecord: { ...account.studentRecord } } : {}) });
export const accountDetailsDraftFrom = (account: PortalAccount): AccountDraft => ({ name: account.name, login: account.login, email: account.email, role: account.role, scheduleName: account.scheduleName, studentGroupId: account.studentGroupId, enrollmentStatus: account.enrollmentStatus, memberships: account.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })) });

const readActor = (editor: AccountDetailsEditor, source: AccountDetailsSource) => {
  if (source.error) throw new Error(source.error);
  const actor = source.accounts.find((account) => account.id === source.actorId);
  if (editor.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Обновление доступно только текущему активному настройщику. Введённые данные оставлены в форме.");
  return actor;
};
export const isAccountDetailsReviewStale = (review: AccountDetailsReview, source: AccountDetailsSource) => {
  const actor = source.accounts.find((account) => account.id === source.actorId);
  return Boolean(source.error) || review.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)
    || review.actorRevision !== actor.revision || review.revision !== source.revision
    || source.accounts.find((account) => account.id === review.accountId)?.revision !== review.accountRevision;
};

export const getAccountDetailsComparison = (editor: AccountDetailsEditor, review: AccountDetailsReview) => fields.map((field) => {
  const mine = value(editor.draft, field); const saved = value(review.latest, field);
  const changedHere = mine !== value(editor.account, field);
  const changedElsewhere = saved !== value(editor.account, field);
  return { field, mine, saved, changedHere, changedElsewhere, conflict: changedHere && changedElsewhere && mine !== saved };
});

const refreshEditor = (editor: AccountDetailsEditor, latest: PortalAccount, source: AccountDetailsSource, choice: "mine" | "saved"): AccountDetailsEditor => {
  const draft = accountDetailsDraftFrom(latest);
  const baseline = JSON.stringify(draft);
  // Retain only edited personal fields. Current role, access, enrolment and assignments stay current.
  if (choice === "mine") for (const field of fields) if (value(editor.draft, field) !== value(editor.account, field)) {
    if (field === "email") draft.email = editor.draft.email;
    else draft[field] = editor.draft[field];
  }
  return { ...editor, account: copyAccount(latest), draft, baseline, revision: source.revision, actorId: source.actorId, actorRevision: source.accounts.find((account) => account.id === source.actorId)!.revision };
};

export function prepareAccountDetailsRefresh(editor: AccountDetailsEditor, source: AccountDetailsSource): { editor: AccountDetailsEditor; review: null } | { editor: null; review: AccountDetailsReview } {
  const actor = readActor(editor, source);
  const latest = source.accounts.find((account) => account.id === editor.account.id);
  if (!latest) throw new Error("Учётная запись больше недоступна. Введённые данные оставлены в форме.");
  if (latest.revision === editor.account.revision) return { editor: refreshEditor(editor, latest, source, "mine"), review: null };
  return { editor: null, review: { accountId: latest.id, accountRevision: latest.revision, revision: source.revision, actorId: source.actorId, actorRevision: actor.revision, baseRevision: editor.revision, baseAccountRevision: editor.account.revision, latest: copyAccount(latest) } };
}

export function applyAccountDetailsRefresh(editor: AccountDetailsEditor, review: AccountDetailsReview, source: AccountDetailsSource, choice: "mine" | "saved"): AccountDetailsEditor {
  readActor(editor, source);
  if (editor.account.id !== review.accountId || editor.account.revision !== review.baseAccountRevision || editor.revision !== review.baseRevision || isAccountDetailsReviewStale(review, source)) throw new Error("Данные сравнения изменились. Обновите сравнение перед выбором варианта.");
  return refreshEditor(editor, review.latest, source, choice);
}
