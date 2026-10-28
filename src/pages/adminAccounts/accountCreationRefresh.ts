import { isAccountActive, type AccountDraft, type PortalAccount } from "../../domain/accounts";

export interface AccountCreationEditor {
  draft: AccountDraft; baseline: string; actorId: string; actorRevision: number; revision: number;
}
export interface AccountCreationSource { accounts: PortalAccount[]; actorId: string; revision: number; error?: string }

export function refreshAccountCreation(editor: AccountCreationEditor, source: AccountCreationSource): AccountCreationEditor {
  if (source.error) throw new Error(source.error);
  const actor = source.accounts.find((account) => account.id === source.actorId);
  if (editor.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)) throw new Error("Пользователь или его права изменились. Ввод сохранён; откройте создание заново под активным настройщиком.");
  return { ...editor, draft: { ...editor.draft, memberships: editor.draft.memberships.map((entry) => ({ ...entry, groupIds: [...entry.groupIds] })) }, revision: source.revision, actorRevision: actor.revision };
}
