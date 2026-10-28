import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { accountService, readAccountsState } from "../../data/accountStore";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import { ACCOUNT_ROLE_LABELS, getStudentGroupId, isAccountActive } from "../../domain/accounts";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { getEducationPeriods, getEducationStateAt, getMoscowDateKey, type EducationState } from "../../domain/studentEducationEvent";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { educationDateLabel, emptyEducationDetails } from "../../components/EducationEventFields";
import DateTimePicker from "../../components/DateTimePicker";
import styles from "./index.module.scss";
import RecordEditor from "../../components/RecordEditor";
import AdmissionEditorForm from "./AdmissionEditorForm";
import AdmissionRefreshPanel from "./AdmissionRefreshPanel";
import { applyAdmissionRefresh, isAdmissionReviewStale, makeAdmissionEditor, prepareAdmissionRefresh, type AdmissionEditor, type AdmissionRefreshReview } from "./admissionRefresh";
import { readGroupCatalogState } from "../../data/groupCatalogStore";
import { getAdmissionRestriction } from "../../domain/studentEducation";
import Tabs from "../../components/Tabs";
import EducationTimeline from "./EducationTimeline";
import { educationSectionSearch, getEducationSection, getEducationTimeline, hasAdmissionChanges, type EducationSection } from "./presentation";

const stateLabel = (state: EducationState) => `${state.groupName} · ${STUDENT_ENROLLMENT_LABELS[state.enrollment]}`;

function EducationHistory({ accountId }: { accountId: string }) {
  const { currentUser, accounts, accountError, refreshAccounts } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const section = getEducationSection(params, hash);
  const state = readAccountsState();
  const account = accounts.find((entry) => entry.id === accountId);
  const actor = state.accounts.find((entry) => entry.id === currentUser.id);
  const group = catalogue.groups.find((entry) => entry.id === (account && getStudentGroupId(account)));
  const events = state.educationEvents.filter((event) => event.accountId === accountId);
  const periods = getEducationPeriods(events);
  const [date, setDate] = useState(getMoscowDateKey);
  const [form, setForm] = useState<AdmissionEditor | null>(null);
  const [review, setReview] = useState<AdmissionRefreshReview | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
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
  const stale = Boolean(form && (form.actorId !== currentUser.id || !actor || actor.role !== "configurator" || !isAccountActive(actor) || form.revision !== state.revision || form.account.revision !== state.accounts.find((entry) => entry.id === accountId)?.revision || form.actorRevision !== actor.revision || form.groupRevision !== catalogue.revision));
  const reviewStale = Boolean(review && isAdmissionReviewStale(review, { ...state, actorId: currentUser.id, groups: catalogue.groups, groupRevision: catalogue.revision, groupError: catalogue.error }));
  const restriction = form ? account ? getAdmissionRestriction(account, state.educationEvents, catalogue.groups) : "Учётная запись студента недоступна. Введённые реквизиты оставлены в форме." : "";
  const dirty = Boolean(form && hasAdmissionChanges(form.education, form.baseline));
  useUnsavedChangesWarning(dirty || busy);
  const admissionSource = () => { const groups = readGroupCatalogState(); return { ...readAccountsState(), actorId: currentUser.id, groups: groups.groups, groupRevision: groups.revision, groupError: groups.error }; };
  const openAdmission = () => {
    if (!account || !actor || readError || busy) return;
    try { setForm(makeAdmissionEditor(accountId, emptyEducationDetails(), admissionSource())); setReview(null); setError(""); setMessage(""); }
    catch (failure) { console.error("Не удалось открыть подтверждение зачисления:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть зачисление. Обновите сведения."); }
  };
  const closeForm = () => requestAction(() => { setForm(null); setReview(null); setError(""); });
  const refreshAdmission = () => {
    if (!form || busy) return;
    try { setReview(prepareAdmissionRefresh(form, admissionSource(), new Date().toISOString())); setError(""); setMessage(""); }
    catch (failure) { console.error("Не удалось обновить проверку зачисления:", failure); setError(failure instanceof Error ? failure.message : "Не удалось обновить проверку. Реквизиты оставлены в форме."); }
  };
  const continueAdmission = () => {
    if (!form || !review || busy) return;
    try { setForm(applyAdmissionRefresh(form, review, admissionSource())); setReview(null); setError(""); setFocusRequest((value) => value + 1); setMessage("Сведения обновлены. Дата и документ сохранены в форме; проверьте их перед отдельной записью зачисления."); }
    catch (failure) { console.error("Не удалось продолжить зачисление после обновления:", failure); setError(failure instanceof Error ? failure.message : "Сравнение изменилось. Обновите его перед продолжением."); }
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!form || !account || stale || busy || readError || review || restriction) return;
    setBusy(true); setError("");
    try { await accountService.confirmAdmission({ actorId: form.actorId, actorRevision: form.actorRevision, expectedRevision: form.revision, accountId: form.account.id, accountRevision: form.account.revision, expectedGroupRevision: form.groupRevision, education: form.education }); setForm(null); setReview(null); setMessage("Зачисление подтверждено. Событие и основание сохранены."); }
    catch (failure) { console.error("Не удалось сохранить событие зачисления:", failure); setError(failure instanceof Error ? failure.message : "Не удалось подтвердить зачисление."); }
    finally { setBusy(false); }
  };
  const shownAccount = account ?? form?.account;
  if (!shownAccount) return <div className={`pageContainer ${styles.page}`}><Link to="/admin/students">← Реестр студентов</Link><p role="alert">{readError || "Учётная запись не найдена."}</p></div>;
  return <div className={`pageContainer ${styles.page}`}>
    {!form && <>
      <nav className={styles.links} aria-label="Связанные сведения"><Link to="/admin/students">← Реестр студентов</Link><Link to={`/admin/accounts?account=${encodeURIComponent(accountId)}`}>Учётная запись</Link></nav>
      <header className={`${styles.header} ${styles.card}`}><div><h2 ref={headingRef} tabIndex={-1}>{shownAccount.name}</h2><p>{shownAccount.studentRecord ? `Зачетка ${shownAccount.studentRecord.number}` : "Зачетка не выдана"} · {shownAccount.login}</p></div>{!readError && <div className={styles.currentState}><span>{shownAccount.role === "student" ? "Текущее обучение" : "Тип учётной записи"}</span><strong>{shownAccount.role === "student" ? `${group?.name ?? "Группа недоступна"} · ${STUDENT_ENROLLMENT_LABELS[shownAccount.enrollmentStatus ?? "studying"]}` : ACCOUNT_ROLE_LABELS[shownAccount.role]}</strong></div>}</header>
    </>}
    {readError && <div className={styles.error} role="alert"><p>{readError}</p><button type="button" onClick={() => { refreshAccounts(); catalogue.refresh(); }}>Повторить чтение</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}
    {form ? <RecordEditor title="Подтвердить зачисление" context={`${form.account.name} · ${form.groupName}`} dirty={dirty} busy={busy} closeLabel="К истории" onClose={closeForm}>
      {review ? <AdmissionRefreshPanel editor={form} review={review} stale={reviewStale} disabled={Boolean(readError) || busy} busy={busy} onContinue={continueAdmission} onRefresh={refreshAdmission} onCancel={() => { setReview(null); setError(""); setFocusRequest((value) => value + 1); }} /> : <AdmissionEditorForm value={form.education} onChange={(education) => { setForm({ ...form, education }); setError(""); setMessage(""); }} disabled={Boolean(readError)} stale={stale} restriction={restriction} busy={busy} focusRequest={focusRequest} onRefresh={refreshAdmission} onSubmit={(event) => void save(event)} onCancel={closeForm} />}
    </RecordEditor> : !readError && <>
      {!events.length && <section className={styles.card} aria-label="Начало истории обучения"><h3>Дата зачисления не подтверждена</h3><p className={styles.note}>Укажите известные дату и основание. До первого события сведения об обучении за прошлые дни остаются неподтверждёнными.</p>{shownAccount.role === "student" && (shownAccount.enrollmentStatus ?? "studying") === "studying" && group?.status !== "archived" && <button ref={admissionTrigger} type="button" className={styles.primary} disabled={!group} onClick={openAdmission}>Подтвердить зачисление</button>}</section>}
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
