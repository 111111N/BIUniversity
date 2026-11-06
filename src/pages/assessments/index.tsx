import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import { useRole } from "../../components/RoleContext";
import { useAssessments } from "../../hooks/useAssessments";
import { ASSESSMENT_KIND_LABELS, assessmentOutcomeLabel, type AssessmentKind } from "../../domain/assessmentTypes";
import type { UserRole } from "../../domain/accounts";
import AssessmentDetails from "./AssessmentDetails";
import AssessmentForm from "./AssessmentForm";
import AssessmentExamples from "./AssessmentExamples";
import { Pagination } from "./SelectionList";
import { displayDate, filterAssessments, paginate } from "./model";
import styles from "./index.module.scss";

function AssessmentWorkspace({ actorId, role, accountError }: { actorId: string; role: UserRole; accountError: string }) {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const { snapshot, loading, error, refresh } = useAssessments(actorId);
  const [query, setQuery] = useState(""); const [kind, setKind] = useState<AssessmentKind | "">(""); const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false); const [message, setMessage] = useState("");
  const sourceError = accountError || error;
  const blocked = loading || Boolean(sourceError);
  const assessment = snapshot?.assessments.find((entry) => entry.id === assessmentId);
  const view = paginate(filterAssessments(snapshot?.assessments ?? [], query, kind), page);
  return <section className={styles.page} aria-label={role === "student" ? "Мои аттестации" : "Аттестации"}>
    <p className={styles.demoNotice}>Демонстрационный учёт: данные сохраняются в этом браузере. Серверное хранение и вход ещё не подключены.</p>
    {sourceError && <div className={styles.error} role="alert"><p>{sourceError}</p><p>Сохранение приостановлено. Ввод в открытой форме сохранён.</p><button type="button" onClick={refresh} disabled={loading}>Повторить загрузку</button></div>}
    {loading && <p className={styles.note} role="status">Обновляем данные аттестаций…</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {snapshot && (assessmentId ? assessment ? <AssessmentDetails key={assessment.id} assessment={assessment} snapshot={snapshot} actorId={actorId} role={role} blocked={blocked} refresh={refresh} onMessage={setMessage} />
      : <div className={styles.empty}><strong>Аттестация недоступна</strong><p>{role === "student" ? "Здесь отображаются только ваши опубликованные результаты." : "У вас нет доступа к этой аттестации или её больше нет в текущем наборе данных."}</p><Link className={styles.back} to="/assessments">К списку аттестаций</Link></div>
      : creating && role === "configurator" ? <AssessmentForm actorId={actorId} snapshot={snapshot} blocked={blocked} onClose={() => setCreating(false)} onSaved={(notice) => { setCreating(false); setMessage(notice); refresh(); }} refresh={refresh} /> : <>
        <div className={styles.toolbar}><SearchField label="Поиск аттестаций" value={query} placeholder="" onChange={(value) => { setQuery(value); setPage(1); }} /><Dropdown label="Вид аттестации" value={kind} options={[{ value: "", label: "Все виды" }, ...Object.entries(ASSESSMENT_KIND_LABELS).map(([value, label]) => ({ value, label }))]} onChange={(value) => { setKind(value as AssessmentKind | ""); setPage(1); }} />{role === "configurator" && <button className={styles.primary} type="button" disabled={blocked} onClick={() => { setCreating(true); setMessage(""); }}>Создать</button>}</div>
        <Link className={styles.back} to="/assessments?example=1">Посмотреть примеры за 4 курса</Link>
        <div className={styles.sectionHeader}><span className={styles.note}>{role === "student" ? "Ваши опубликованные результаты и история попыток" : role === "teacher" ? "Ведомости, назначенные вам для заполнения" : "Аттестации групп и ведомости преподавателей"}</span><Pagination {...view} onChange={setPage} /></div>
        <div className={styles.list}>{view.items.map((entry) => {
          const last = entry.attempts.at(-1);
          const result = last?.results.find((item) => item.studentId === actorId)?.outcome ?? null;
          return <article className={styles.catalogCard} key={entry.id}><div><p className={styles.note}>{ASSESSMENT_KIND_LABELS[entry.kind]} · {entry.groupName} · {entry.period}</p><h2><Link to={`/assessments/${encodeURIComponent(entry.id)}`}>{entry.title}</Link></h2>{entry.subjectName && <p className={styles.note}>{entry.subjectName}</p>}<p className={styles.note}>{last ? `${displayDate(last.date)}, ${last.startsAt} (Москва) · попытка ${last.number}` : "Нет опубликованных попыток"}</p></div><div className={styles.catalogStatus}>{role === "student" && last ? <strong className={result?.status === "failed" || (result?.status === "graded" && result.grade === 2) ? styles.unsuccessful : styles.outcome}>{assessmentOutcomeLabel(result)}</strong> : <span className={last?.state === "published" ? styles.published : styles.badge}>{last?.state === "published" ? "Опубликовано" : "Черновик"}</span>}<Link className={styles.openLink} to={`/assessments/${encodeURIComponent(entry.id)}`}>{role === "student" ? "Результаты и попытки" : "Открыть ведомости"}<span className={styles.visuallyHidden}>: {entry.title}</span></Link></div></article>;
        })}</div>
        {!view.total && <div className={styles.empty}><strong>{query || kind ? "Ничего не найдено" : role === "student" ? "Опубликованных результатов пока нет" : "Аттестаций пока нет"}</strong><p>{query || kind ? "Измените поисковый запрос или вид аттестации." : role === "configurator" ? "Создайте аттестацию, проверьте участников и назначьте преподавателя для заполнения ведомости." : role === "teacher" ? "Здесь появятся ведомости, когда настройщик назначит вас преподавателем." : "После публикации преподавателем здесь появятся ваши результаты, пересдачи и комиссии."}</p></div>}
      </>)}
  </section>;
}

export default function AssessmentsPage() {
  const { currentUser, role, accountError } = useRole();
  const [params] = useSearchParams();
  if (params.get("example") === "1") return <AssessmentExamples actorId={currentUser.id} student={role === "student"} />;
  // A role change must never reuse a projection made for that account's previous permissions.
  return <AssessmentWorkspace key={`${currentUser.id}:${role}`} actorId={currentUser.id} role={role} accountError={accountError} />;
}
