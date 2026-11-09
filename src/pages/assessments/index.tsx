import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import { useRole } from "../../components/RoleContext";
import { useAssessments } from "../../hooks/useAssessments";
import { ASSESSMENT_KIND_LABELS, type AssessmentKind } from "../../domain/assessmentTypes";
import Card from "../../components/Card";
import AssessmentCatalogCard from "./AssessmentCatalogCard";
import type { UserRole } from "../../domain/accounts";
import AssessmentDetails from "./AssessmentDetails";
import AssessmentForm from "./AssessmentForm";
import AssessmentExamples from "./AssessmentExamples";
import { Pagination } from "./SelectionList";
import { filterAssessments, paginate } from "./model";
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
    {sourceError && <div className={styles.error} role="alert"><p>{sourceError}</p><p>Сохранение приостановлено. Ввод в открытой форме сохранён.</p><button type="button" onClick={refresh} disabled={loading}>Повторить загрузку</button></div>}
    {loading && <p className={styles.note} role="status">Обновляем данные аттестаций…</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {snapshot && (assessmentId ? assessment ? <AssessmentDetails key={assessment.id} assessment={assessment} snapshot={snapshot} actorId={actorId} role={role} blocked={blocked} refresh={refresh} onMessage={setMessage} />
      : <div className={styles.empty}><strong>Аттестация недоступна</strong><p>{role === "student" ? "Здесь отображаются ваши назначенные аттестации и опубликованные результаты." : "У вас нет доступа к этой аттестации или её больше нет в текущем наборе данных."}</p><Link className={styles.back} to="/assessments">К списку аттестаций</Link></div>
      : creating && role === "configurator" ? <AssessmentForm actorId={actorId} snapshot={snapshot} blocked={blocked} onClose={() => setCreating(false)} onSaved={(notice) => { setCreating(false); setMessage(notice); refresh(); }} refresh={refresh} /> : <>
        <header className={styles.pageHeader}>
          <div><h1>{role === "student" ? "Мои аттестации" : "Аттестации"}</h1></div>
          <div className={styles.actions}>{role === "configurator" && <button className={styles.primary} type="button" disabled={blocked} onClick={() => { setCreating(true); setMessage(""); }}>Создать аттестацию</button>}<Link className={styles.back} to="/assessments?example=1">Посмотреть примеры за 4 курса →</Link></div>
        </header>
        <Card className={styles.overview} aria-label="Обзор аттестаций"><div><span>Всего аттестаций</span><strong>{snapshot.assessments.length}</strong></div><div><span>С опубликованной последней попыткой</span><strong>{snapshot.assessments.filter((entry) => entry.attempts.at(-1)?.state === "published").length}</strong></div><div><span>Всего попыток</span><strong>{snapshot.assessments.reduce((sum, entry) => sum + entry.attempts.length, 0)}</strong></div></Card>
        <Card className={styles.filterPanel}><div className={styles.toolbar}><SearchField label="Поиск аттестаций" value={query} placeholder="" onChange={(value) => { setQuery(value); setPage(1); }} /><Dropdown label="Вид аттестации" value={kind} options={[{ value: "", label: "Все виды" }, ...Object.entries(ASSESSMENT_KIND_LABELS).map(([value, label]) => ({ value, label }))]} onChange={(value) => { setKind(value as AssessmentKind | ""); setPage(1); }} /></div>{(query || kind) && <div className={styles.actions}><button type="button" onClick={() => { setQuery(""); setKind(""); setPage(1); }}>Сбросить фильтры</button><span className={styles.note} role="status">Найдено: {view.total}</span></div>}</Card>
        <Pagination {...view} onChange={setPage} />
        <div className={styles.list}>{view.items.map((entry) => <AssessmentCatalogCard key={entry.id} assessment={entry} actorId={actorId} student={role === "student"} />)}</div>
        {!view.total && <div className={styles.empty}><strong>{query || kind ? "Ничего не найдено" : role === "student" ? "Назначенных аттестаций пока нет" : "Аттестаций пока нет"}</strong><p>{query || kind ? "Измените поисковый запрос или вид аттестации." : role === "configurator" ? "Создайте аттестацию, проверьте участников и назначьте преподавателя для заполнения ведомости." : role === "teacher" ? "Здесь появятся ведомости, когда настройщик назначит вас преподавателем." : "Здесь появятся назначенные вам аттестации, а после публикации ведомостей — результаты."}</p></div>}
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
