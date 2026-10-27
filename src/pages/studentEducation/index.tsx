import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { accountService, readAccountsState } from "../../data/accountStore";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import { ACCOUNT_ROLE_LABELS, getStudentGroupId } from "../../domain/accounts";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { getEducationPeriods, getEducationStateAt, getMoscowDateKey, type EducationEventDetails, type EducationState } from "../../domain/studentEducationEvent";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import EducationEventFields, { educationDateLabel, emptyEducationDetails } from "../../components/EducationEventFields";
import DateTimePicker from "../../components/DateTimePicker";
import styles from "./index.module.scss";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import Tabs from "../../components/Tabs";
import EducationTimeline from "./EducationTimeline";
import { educationSectionSearch, getEducationSection, getEducationTimeline, hasAdmissionChanges, type EducationSection } from "./presentation";

const stateLabel = (state: EducationState) => `${state.groupName} · ${STUDENT_ENROLLMENT_LABELS[state.enrollment]}`;
type AdmissionForm = { education: EducationEventDetails; baseline: EducationEventDetails; revision: number; accountRevision: number; actorRevision: number; groupRevision: number };

function EducationHistory({ accountId }: { accountId: string }) {
  const { currentUser, accounts, accountError, refreshAccounts } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const section = getEducationSection(params, hash);
  const state = readAccountsState();
  const account = accounts.find((entry) => entry.id === accountId);
  const actor = accounts.find((entry) => entry.id === currentUser.id);
  const group = catalogue.groups.find((entry) => entry.id === (account && getStudentGroupId(account)));
  const events = state.educationEvents.filter((event) => event.accountId === accountId);
  const periods = getEducationPeriods(events);
  const [date, setDate] = useState(getMoscowDateKey);
  const [form, setForm] = useState<AdmissionForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [limit, setLimit] = useState(20);
  const [periodLimit, setPeriodLimit] = useState(20);
  const timeline = getEducationTimeline(events, limit, hash);
  const linkedId = timeline.linkedId;
  const admissionTrigger = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const wasFormOpen = useRef(false);
  const formOpen = Boolean(form);
  useEffect(() => {
    if (formOpen) { wasFormOpen.current = true; return; }
    if (wasFormOpen.current) { (admissionTrigger.current ?? headingRef.current)?.focus(); wasFormOpen.current = false; }
  }, [formOpen]);
  const atDate = getEducationStateAt(events, date);
  const readError = accountError || catalogue.error || state.error;
  useEffect(() => {
    if (!linkedId || section !== "events" || formOpen || readError) return;
    const frame = requestAnimationFrame(() => document.getElementById(linkedId)?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [linkedId, section, formOpen, readError]);
  const stale = Boolean(form && (form.revision !== state.revision || form.accountRevision !== account?.revision || form.actorRevision !== actor?.revision || form.groupRevision !== catalogue.revision));
  const dirty = Boolean(form && hasAdmissionChanges(form.education, form.baseline));
  useUnsavedChangesWarning(dirty || busy);
  const openAdmission = () => {
    if (!account || !actor || readError) return;
    const education = emptyEducationDetails();
    setForm({ education, baseline: { ...education }, revision: state.revision, accountRevision: account.revision, actorRevision: actor.revision, groupRevision: catalogue.revision }); setError(""); setMessage("");
  };
  const closeForm = () => requestAction(() => { setForm(null); setError(""); });
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!form || !account || stale || busy || readError) return;
    setBusy(true); setError("");
    try { await accountService.confirmAdmission({ actorId: currentUser.id, actorRevision: form.actorRevision, expectedRevision: form.revision, accountId, accountRevision: form.accountRevision, expectedGroupRevision: form.groupRevision, education: form.education }); setForm(null); setMessage("Зачисление подтверждено. Событие и основание сохранены."); }
    catch (failure) { console.error("Не удалось сохранить событие зачисления:", failure); setError(failure instanceof Error ? failure.message : "Не удалось подтвердить зачисление."); }
    finally { setBusy(false); }
  };
  if (!account) return <div className={`pageContainer ${styles.page}`}><Link to="/admin/students">← Реестр студентов</Link><p role="alert">{readError || "Учётная запись не найдена."}</p></div>;
  return <div className={`pageContainer ${styles.page}`}>
    {!form && <>
      <nav className={styles.links} aria-label="Связанные сведения"><Link to="/admin/students">← Реестр студентов</Link><Link to={`/admin/accounts?account=${encodeURIComponent(accountId)}`}>Учётная запись</Link></nav>
      <header className={`${styles.header} ${styles.card}`}><div><h2 ref={headingRef} tabIndex={-1}>{account.name}</h2><p>{account.studentRecord ? `Зачетка ${account.studentRecord.number}` : "Зачетка не выдана"} · {account.login}</p></div>{!readError && <div className={styles.currentState}><span>{account.role === "student" ? "Текущее обучение" : "Тип учётной записи"}</span><strong>{account.role === "student" ? `${group?.name ?? "Группа недоступна"} · ${STUDENT_ENROLLMENT_LABELS[account.enrollmentStatus ?? "studying"]}` : ACCOUNT_ROLE_LABELS[account.role]}</strong></div>}</header>
    </>}
    {readError && <div className={styles.error} role="alert"><p>{readError}</p><button type="button" onClick={() => { refreshAccounts(); catalogue.refresh(); }}>Повторить чтение</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}
    {form ? <RecordEditor title="Подтвердить зачисление" context={`${account.name} · ${group?.name ?? "Группа недоступна"}`} dirty={dirty} busy={busy} onClose={closeForm}>
      <form className={styles.admissionForm} aria-label="Подтверждение зачисления" onSubmit={(event) => void save(event)}>
        <EducationEventFields value={form.education} onChange={(education) => setForm({ ...form, education })} disabled={busy || Boolean(readError)} />
        {stale && <p className={styles.error} role="alert">Сведения изменились. Отмените форму и откройте подтверждение заново; внесённые данные пока остаются в форме.</p>}
        <RecordEditorActions label="Сохранить зачисление" disabled={busy || stale || Boolean(readError) || form.education.basis.trim().length < 3} busy={busy} onCancel={closeForm} hint="Дата создания учётки не заменяет дату зачисления. После сохранения ранние события между уже внесёнными не вставляются." />
      </form>
    </RecordEditor> : !readError && <>
      {!events.length && <section className={styles.card} aria-label="Начало истории обучения"><h3>Дата зачисления не подтверждена</h3><p className={styles.note}>Укажите известные дату и основание. До первого события сведения об обучении за прошлые дни остаются неподтверждёнными.</p>{account.role === "student" && (account.enrollmentStatus ?? "studying") === "studying" && group?.status !== "archived" && <button ref={admissionTrigger} type="button" className={styles.primary} disabled={!group} onClick={openAdmission}>Подтвердить зачисление</button>}</section>}
      <Tabs className={styles.sectionTabs} variant="filter" ariaLabel="История обучения" value={section} items={[{ value: "events", label: "События", count: events.length }, { value: "periods", label: "Периоды" }, { value: "dated", label: "На дату" }]} onChange={(value) => setParams(educationSectionSearch(params, value as EducationSection))} />
      {section === "events" && <>
        {timeline.missingLinkedEvent && <p className={styles.error} role="status">Событие из ссылки недоступно. Ниже показана доступная история этого студента.</p>}
        <EducationTimeline events={timeline.shown} accounts={accounts} linkedId={linkedId} remaining={timeline.remaining} total={events.length} onMore={() => setLimit((value) => value + 20)} />
      </>}
      {section === "dated" && <section className={styles.card} aria-label="Состояние обучения на дату"><h3>Состояние на дату</h3><div className={styles.date}><DateTimePicker showTime={false} allowClear={false} ariaLabel="Дата проверки обучения" value={parseCalendarDate(date)} onChange={(value) => { if (value) setDate(toLocalDateKey(value)); }} /></div><p aria-live="polite">{date > getMoscowDateKey() ? "Для проверки выберите сегодня или прошедшую дату." : atDate ? stateLabel(atDate) : "За выбранный день нет подтверждённых сведений об обучении."}</p>{atDate && date <= getMoscowDateKey() && <Link to={`/admin/groups?group=${encodeURIComponent(atDate.groupId)}&asOf=${date}${atDate.enrollment === "studying" ? "" : "&roster=completed"}`}>Состав группы на выбранную дату</Link>}</section>}
      {section === "periods" && <section className={styles.card} aria-label="Периоды обучения"><h3>Подтверждённые периоды</h3><p className={styles.note}>Дата окончания не входит в период. Если событий за день несколько, действует последнее.</p><ol className={styles.periods}>{periods.slice(-periodLimit).reverse().map((period) => <li key={period.eventId}><span>{educationDateLabel(period.from)} — {period.until ? `до ${educationDateLabel(period.until)}` : "по настоящее время"}</span><strong>{stateLabel(period.state)}</strong></li>)}</ol>{!periods.length && <p className={styles.note}>Подтверждённых периодов пока нет.</p>}{periods.length > periodLimit && <button type="button" onClick={() => setPeriodLimit((value) => value + 20)}>Показать ещё периоды</button>}</section>}
      <details className={styles.help}><summary>Как читать историю обучения</summary><div><p>Дата создания учётки не считается датой зачисления. До первого подтверждённого события состояние за прошлые дни неизвестно.</p><p>Номер зачетки и результаты занятий сохраняются при переводе. Доступ к кабинету меняется отдельно в учётной записи.</p><p>События вносятся за сегодня или прошедшую дату, по порядку. Дата действия определяет обучение, а время внесения показывает, когда сотрудник сохранил запись.</p></div></details>
    </>}
  </div>;
}
export default function StudentEducationPage() { const { accountId = "" } = useParams(); return <EducationHistory key={accountId} accountId={accountId} />; }
