import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { accountService, readAccountsState } from "../../data/accountStore";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import { getStudentGroupId } from "../../domain/accounts";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { EDUCATION_EVENT_LABELS, getEducationPeriods, getEducationStateAt, getMoscowDateKey, type EducationEventDetails, type EducationState } from "../../domain/studentEducationEvent";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import EducationEventFields, { EducationEventSummary, educationDateLabel, emptyEducationDetails } from "../../components/EducationEventFields";
import DateTimePicker from "../../components/DateTimePicker";
import styles from "./index.module.scss";

const stateLabel = (state: EducationState) => `${state.groupName} · ${STUDENT_ENROLLMENT_LABELS[state.enrollment]}`;
const registeredLabel = (date: string) => new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
type AdmissionForm = { education: EducationEventDetails; revision: number; accountRevision: number; actorRevision: number; groupRevision: number };

function EducationHistory({ accountId }: { accountId: string }) {
  const { currentUser, accounts, accountError } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const { hash } = useLocation();
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
  const linkedEvent = events.find((event) => `#${event.id}` === hash);
  const shownEvents = events.slice(-limit).reverse();
  if (linkedEvent && !shownEvents.some((event) => event.id === linkedEvent.id)) shownEvents.push(linkedEvent);
  const linkedId = linkedEvent?.id;
  useEffect(() => { if (!linkedId) return; const frame = requestAnimationFrame(() => document.getElementById(linkedId)?.scrollIntoView({ block: "start" })); return () => cancelAnimationFrame(frame); }, [linkedId]);
  const atDate = getEducationStateAt(events, date);
  const readError = accountError || catalogue.error || state.error;
  const stale = Boolean(form && (form.revision !== state.revision || form.accountRevision !== account?.revision || form.actorRevision !== actor?.revision || form.groupRevision !== catalogue.revision));
  useUnsavedChangesWarning(Boolean(form) || busy);
  const openAdmission = () => {
    if (!account || !actor || readError) return;
    setForm({ education: emptyEducationDetails(), revision: state.revision, accountRevision: account.revision, actorRevision: actor.revision, groupRevision: catalogue.revision }); setError(""); setMessage("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!form || !account || stale || busy || readError) return;
    setBusy(true); setError("");
    try { await accountService.confirmAdmission({ actorId: currentUser.id, actorRevision: form.actorRevision, expectedRevision: form.revision, accountId, accountRevision: form.accountRevision, expectedGroupRevision: form.groupRevision, education: form.education }); setForm(null); setMessage("Зачисление подтверждено. Событие и основание сохранены."); }
    catch (failure) { console.error("Не удалось сохранить событие зачисления:", failure); setError(failure instanceof Error ? failure.message : "Не удалось подтвердить зачисление."); }
    finally { setBusy(false); }
  };
  if (!account) return <div className={`pageContainer ${styles.page}`}><Link to="/admin/students">← Реестр студентов</Link><p role="alert">{readError || "Учётная запись не найдена."}</p></div>;
  return <div className={`pageContainer ${styles.page}`}>
    <nav className={styles.links} aria-label="Связанные сведения"><Link to="/admin/students">← Реестр студентов</Link><Link to={`/admin/accounts?account=${encodeURIComponent(accountId)}`}>Учётная запись</Link></nav>
    <header className={styles.header}><h2>{account.name}</h2><p>{account.studentRecord ? `Зачетка ${account.studentRecord.number}` : "Зачетка не выдана"} · {account.login}</p></header>
    {readError && <p className={styles.error} role="alert">{readError}</p>}{error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.message} role="status">{message}</p>}
    <section className={styles.card} aria-label="Текущее обучение"><h3>Текущее состояние</h3><p>{group?.name ?? "Группа недоступна"} · {STUDENT_ENROLLMENT_LABELS[account.enrollmentStatus ?? "studying"]}</p><p className={styles.note}>Номер зачетки и результаты занятий сохраняются при переводе. Доступ к кабинету управляется отдельно.</p></section>
    {!events.length && <section className={styles.card} aria-label="Начало истории обучения"><h3>Дата зачисления не подтверждена</h3><p className={styles.note}>Дата создания учётки не считается датой зачисления. Укажите подтверждённую дату и основание, если они известны. До первого события состав группы за прошлый период будет неизвестен.</p>{!form && account.role === "student" && (account.enrollmentStatus ?? "studying") === "studying" && group?.status !== "archived" && <button type="button" className={styles.primary} disabled={Boolean(readError) || !group} onClick={openAdmission}>Подтвердить зачисление</button>}</section>}
    {form && <form className={styles.card} aria-label="Подтверждение зачисления" onSubmit={(event) => void save(event)}><EducationEventFields value={form.education} onChange={(education) => setForm({ ...form, education })} disabled={busy || Boolean(readError)} />{stale && <p className={styles.error} role="alert">Сведения изменились. Отмените форму и откройте подтверждение заново; внесённые данные пока остаются в форме.</p>}<p className={styles.note}>Подтверждается зачисление в текущую группу {group?.name}. После начала истории ранние события автоматически не вставляются между уже внесёнными.</p><div className={styles.links}><button type="submit" className={styles.primary} disabled={busy || stale || Boolean(readError) || form.education.basis.trim().length < 3}>{busy ? "Сохраняем…" : "Сохранить зачисление"}</button><button type="button" disabled={busy} onClick={() => requestAction(() => { setForm(null); setError(""); })}>Отменить</button></div></form>}
    <section className={styles.card} aria-label="Состояние обучения на дату"><h3>Состояние на дату</h3><div className={styles.date}><DateTimePicker showTime={false} allowClear={false} ariaLabel="Дата проверки обучения" value={parseCalendarDate(date)} onChange={(value) => { if (value) setDate(toLocalDateKey(value)); }} /></div><p aria-live="polite">{date > getMoscowDateKey() ? "Для проверки выберите сегодня или прошедшую дату." : atDate ? stateLabel(atDate) : "За выбранный день нет подтверждённых сведений об обучении."}</p>{atDate && date <= getMoscowDateKey() && <Link to={`/admin/groups?group=${encodeURIComponent(atDate.groupId)}&asOf=${date}${atDate.enrollment === "studying" ? "" : "&roster=completed"}`}>Состав группы на выбранную дату</Link>}</section>
    <section className={styles.card} aria-label="Периоды обучения"><h3>Подтверждённые периоды</h3><p className={styles.note}>Конец периода — дата следующего события, не включается в период. При нескольких событиях за день действует последнее.</p><ol className={styles.periods}>{periods.slice(-periodLimit).reverse().map((period) => <li key={period.eventId}><span>{educationDateLabel(period.from)} — {period.until ? `до ${educationDateLabel(period.until)}` : "по настоящее время"}</span><strong>{stateLabel(period.state)}</strong></li>)}</ol>{!periods.length && <p className={styles.note}>Подтверждённых периодов пока нет.</p>}{periods.length > periodLimit && <button type="button" onClick={() => setPeriodLimit((value) => value + 20)}>Показать ещё периоды</button>}</section>
    <section className={styles.timeline} aria-label="События обучения"><h3>События · {events.length}</h3>{shownEvents.map((event) => <article className={styles.card} id={event.id} key={event.id}><header className={styles.eventHeader}><h4>{EDUCATION_EVENT_LABELS[event.kind]}</h4><time dateTime={event.effectiveDate}>{educationDateLabel(event.effectiveDate)}</time></header><div className={styles.states}><div><span>До</span><p>{event.before ? stateLabel(event.before) : "Зачисление подтверждено"}</p></div><div><span>После</span><p>{stateLabel(event.after)}</p></div></div><EducationEventSummary value={event} /><p className={styles.note}>Внесено: {registeredLabel(event.registeredAt)} · {accounts.find((entry) => entry.id === event.actorId)?.name ?? event.actorId}</p>{event.batchId && <Link to={`/admin/students?batch=${encodeURIComponent(event.batchId)}`}>Открыть массовое действие</Link>}</article>)}{!events.length && <p className={styles.note}>Событий пока нет. Перевод, выпуск и отчисление с датой появятся здесь после оформления.</p>}{events.length > limit && <button type="button" onClick={() => setLimit((value) => value + 20)}>Показать ещё события</button>}</section>
  </div>;
}
export default function StudentEducationPage() { const { accountId = "" } = useParams(); return <EducationHistory key={accountId} accountId={accountId} />; }
