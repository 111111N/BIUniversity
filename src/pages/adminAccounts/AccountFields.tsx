import Dropdown, { type DropdownOption } from "../../components/Dropdown";
import { ACCOUNT_ROLE_LABELS, getStudentGroupId, type AccountDraft, type PortalAccount, type UserRole } from "../../domain/accounts";
import type { AccountEditorMode } from "./presentation";
import styles from "./index.module.scss";

interface Props {
  mode: AccountEditorMode;
  draft: AccountDraft;
  account?: PortalAccount;
  groups: DropdownOption[];
  disabled: boolean;
  onChange(patch: Partial<AccountDraft>): void;
}
export default function AccountFields({ mode, draft, account, groups, disabled, onChange }: Props) {
  if (mode === "education") return null;
  return <fieldset disabled={disabled} className={styles.fields}>
    {["create", "details"].includes(mode) && <>
      <label>Имя и фамилия<input required minLength={2} maxLength={120} value={draft.name} onChange={(event) => onChange({ name: event.target.value })} autoComplete="off" /></label>
      <label>Логин<input required minLength={3} maxLength={64} value={draft.login} onChange={(event) => onChange({ login: event.target.value })} autoComplete="off" autoCapitalize="none" spellCheck={false} /></label>
      <label>Электронная почта<input type="email" maxLength={254} value={draft.email ?? ""} onChange={(event) => onChange({ email: event.target.value })} autoComplete="off" /></label>
    </>}
    {["create", "role"].includes(mode) && <Dropdown label="Тип учётной записи" value={draft.role} options={(Object.keys(ACCOUNT_ROLE_LABELS) as UserRole[]).map((value) => ({ value, label: ACCOUNT_ROLE_LABELS[value] }))} onChange={(value) => onChange({ role: value as UserRole, memberships: account?.role === value ? account.memberships : [], studentGroupId: account?.role === value ? account.studentGroupId : undefined, studentCampus: undefined })} disabled={disabled} />}
    {draft.role === "student" && (mode === "create" || (mode === "role" && account?.role !== "student")) && <Dropdown searchable label="Учебная группа студента" placeholder="" value={getStudentGroupId(draft) ?? ""} options={groups} onChange={(id) => onChange({ studentGroupId: id, memberships: [] })} disabled={disabled} />}
  </fieldset>;
}
