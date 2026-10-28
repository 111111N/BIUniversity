import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { DropdownOption } from "../../components/Dropdown";
import { getAccountIdentityErrors, getMissingStudentGroupProblem, type AccountDraft, type AccountIdentityField, type PortalAccount } from "../../domain/accounts";
import type { AccountEditorMode } from "./presentation";
import AccountFields from "./AccountFields";
import styles from "./AccountEditorForm.module.scss";

interface Props {
  mode: AccountEditorMode;
  draft: AccountDraft;
  account?: PortalAccount;
  accounts: PortalAccount[];
  groups: DropdownOption[];
  disabled: boolean;
  stale: boolean;
  focusRequest?: number;
  children: ReactNode;
  onChange(patch: Partial<AccountDraft>): void;
  onSubmit(event: FormEvent): void;
}

export default function AccountEditorForm({ mode, draft, account, accounts, groups, disabled, stale, focusRequest = 0, children, onChange, onSubmit }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (focusRequest) formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(); }, [focusRequest]);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<AccountIdentityField, boolean>>>({});
  const [groupTouched, setGroupTouched] = useState(false);
  const groupProblem = mode === "create" || (mode === "role" && account?.role !== "student") ? getMissingStudentGroupProblem(draft) : "";
  const problems = useMemo(() => ["create", "details"].includes(mode) ? getAccountIdentityErrors({ name: draft.name, login: draft.login, email: draft.email }, accounts, account?.id) : [], [mode, draft.name, draft.login, draft.email, accounts, account?.id]);
  const errors = Object.fromEntries(problems.filter((problem) => submitted || touched[problem.field]).map((problem) => [problem.field, problem.message]));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || stale) return;
    setSubmitted(true);
    if (problems.length || groupProblem) { requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    onSubmit(event);
  };
  return <form ref={formRef} className={styles.form} aria-label={mode === "create" ? "Новая учётная запись" : mode === "role" ? "Изменение типа учётной записи" : "Данные учётной записи"} noValidate onSubmit={submit}>
    {submitted && (problems.length > 0 || groupProblem) && <p className={styles.summary} role="alert">Проверьте отмеченные поля. Изменения ещё не сохранены.</p>}
    <AccountFields mode={mode} draft={draft} account={account} groups={groups} disabled={disabled} errors={errors} groupError={submitted || groupTouched ? groupProblem : undefined} onGroupBlur={() => setGroupTouched(true)} onBlur={(field) => setTouched((previous) => ({ ...previous, [field]: true }))} onChange={onChange} />
    {children}
  </form>;
}
