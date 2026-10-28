import { useId } from "react";
import Dropdown, { type DropdownOption } from "../../components/Dropdown";
import { ACCOUNT_ROLE_LABELS, getStudentGroupId, type AccountDraft, type AccountIdentityField, type PortalAccount, type UserRole } from "../../domain/accounts";
import type { AccountEditorMode } from "./presentation";
import styles from "./AccountFields.module.scss";

interface Props {
  mode: AccountEditorMode;
  draft: AccountDraft;
  account?: PortalAccount;
  groups: DropdownOption[];
  disabled: boolean;
  errors?: Partial<Record<AccountIdentityField, string>>;
  groupError?: string;
  onBlur?(field: AccountIdentityField): void;
  onGroupBlur?(): void;
  onChange(patch: Partial<AccountDraft>): void;
}
export default function AccountFields({ mode, draft, account, groups, disabled, errors = {}, groupError, onBlur, onGroupBlur, onChange }: Props) {
  const id = useId();
  const field = (name: AccountIdentityField, label: string) => <div className={name === "name" ? styles.name : styles.field}>
    <label htmlFor={`${id}-${name}`}>{label}</label>
    <input id={`${id}-${name}`} name={name} required={name !== "email"} type={name === "email" ? "email" : "text"} minLength={name === "name" ? 2 : name === "login" ? 3 : undefined} maxLength={name === "name" ? 120 : name === "login" ? 64 : 254} value={draft[name] ?? ""} aria-invalid={errors[name] ? true : undefined} aria-describedby={errors[name] ? `${id}-${name}-error` : name === "login" ? `${id}-login-hint` : undefined} onBlur={() => onBlur?.(name)} onChange={(event) => onChange({ [name]: event.target.value })} autoComplete="off" autoCapitalize={name === "name" ? undefined : "none"} spellCheck={name === "name" ? undefined : false} />
    {errors[name] ? <span className={styles.fieldError} id={`${id}-${name}-error`}>{errors[name]}</span> : name === "login" && <span className={styles.hint} id={`${id}-login-hint`}>3–64 символа: латиница, цифры, точка, дефис или подчёркивание.</span>}
  </div>;
  if (mode === "education") return null;
  return <fieldset disabled={disabled} className={styles.fields}>
    <legend className={styles.legend}>{mode === "role" ? "Тип учётной записи" : "Личные данные учётной записи"}</legend>
    {["create", "details"].includes(mode) && <>
      {field("name", "Имя и фамилия (обязательно)")}
      {field("login", "Логин (обязательно)")}
      {field("email", "Электронная почта (необязательно)")}
    </>}
    {["create", "role"].includes(mode) && <Dropdown label="Тип учётной записи" value={draft.role} options={(Object.keys(ACCOUNT_ROLE_LABELS) as UserRole[]).map((value) => ({ value, label: ACCOUNT_ROLE_LABELS[value] }))} onChange={(value) => onChange({ role: value as UserRole, memberships: account?.role === value ? account.memberships : [], studentGroupId: account?.role === value ? account.studentGroupId : undefined, studentCampus: undefined })} disabled={disabled} />}
    {draft.role === "student" && (mode === "create" || (mode === "role" && account?.role !== "student")) && <div onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onGroupBlur?.(); }}><Dropdown searchable label="Учебная группа студента (обязательно)" placeholder="" value={getStudentGroupId(draft) ?? ""} options={groups} error={groupError} onChange={(id) => onChange({ studentGroupId: id, memberships: [] })} disabled={disabled} /></div>}
  </fieldset>;
}
