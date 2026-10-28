import { getStudentGroupId, isAccountActive } from "../../domain/accounts";
import { getEducationOperationRestriction, prepareEducationOperation, type EducationOperation } from "./educationOperationModel";
import type { EducationRefreshEditor, EducationRefreshSource } from "./educationRefresh";

export interface EducationSwitchReview {
  operation: EducationOperation;
  previousOperation: EducationOperation;
  discardedGroup: string;
  actorId: string;
  actorRevision: number;
  accountId: string;
  accountRevision: number;
  revision: number;
  groupRevision: number;
  draftKey: string;
}
const draftKey = (editor: EducationRefreshEditor) => JSON.stringify([editor.draft, editor.education, editor.educationBaseline, editor.baseline]);

export function prepareEducationSwitch(editor: EducationRefreshEditor, operation: EducationOperation, source: EducationRefreshSource): EducationSwitchReview {
  if (source.error || source.groupError) throw new Error(source.error || source.groupError);
  const actor = source.accounts.find((entry) => entry.id === source.actorId);
  const account = source.accounts.find((entry) => entry.id === editor.account.id);
  if (editor.actorId !== source.actorId || !actor || actor.role !== "configurator" || !isAccountActive(actor)
    || actor.revision !== editor.actorRevision || source.revision !== editor.revision || source.groupRevision !== editor.educationGroupRevision
    || !account || account.role !== "student" || account.revision !== editor.account.revision) {
    throw new Error("Учебные данные или права изменились. Обновите проверку перед сменой действия; ввод сохранён.");
  }
  if (operation === editor.educationOperation) throw new Error("Это учебное действие уже выбрано.");
  const restriction = getEducationOperationRestriction(account, operation, source.groups);
  if (restriction) throw new Error(restriction);
  const selected = getStudentGroupId(editor.draft);
  const dropsTarget = editor.educationOperation === "transfer" && selected && selected !== getStudentGroupId(account);
  return {
    operation, previousOperation: editor.educationOperation,
    discardedGroup: dropsTarget ? source.groups.find((group) => group.id === selected)?.name ?? "Недоступная выбранная группа" : "",
    actorId: source.actorId, actorRevision: actor.revision, accountId: account.id, accountRevision: account.revision,
    revision: source.revision, groupRevision: source.groupRevision, draftKey: draftKey(editor),
  };
}

export function applyEducationSwitch(editor: EducationRefreshEditor, review: EducationSwitchReview, source: EducationRefreshSource): EducationRefreshEditor {
  const current = prepareEducationSwitch(editor, review.operation, source);
  if (JSON.stringify(current) !== JSON.stringify(review)) throw new Error("Подготовка смены действия изменилась. Закройте окно и выберите действие заново; ввод сохранён.");
  return {
    ...editor, educationOperation: review.operation,
    draft: prepareEducationOperation(editor.account, editor.draft, review.operation),
    education: { ...editor.education }, educationBaseline: { ...editor.educationBaseline },
  };
}
