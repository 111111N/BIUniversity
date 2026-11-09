import { Link, useParams, useSearchParams } from "react-router-dom";
import Dropdown from "../../components/Dropdown";
import { createAssessmentExamples } from "../../data/assessmentExamples";
import { type AssessmentSnapshot } from "../../domain/assessmentTypes";
import Card from "../../components/Card";
import AssessmentCatalogCard from "./AssessmentCatalogCard";
import AssessmentDetails from "./AssessmentDetails";
import styles from "./index.module.scss";

const noop = () => undefined;
const previewRole = "student";
export default function AssessmentExamples({ actorId, student }: { actorId: string; student: boolean }) {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [params, setParams] = useSearchParams();
  const examples = createAssessmentExamples(actorId);
  const semester = Number(params.get("semester")) || 1;
  const rows = examples.assessments.filter((entry) => entry.recordBook?.semester === semester);
  const assessment = examples.assessments.find((entry) => entry.id === assessmentId);
  const snapshot: AssessmentSnapshot = { ...examples, revision: 0, accountsRevision: 0, actorRevision: 0, groupRevision: 0, subjectRevision: 0, groups: [], subjects: [], students: [] };
  return <div className={styles.page}>
    <div className={styles.warning}><p><strong>Демонстрационные аттестации · 4 курса, 8 семестров</strong></p><p>Это отдельный пример для просмотра. Ведомости и учётные записи браузера не изменяются. Редактирование примера недоступно.</p><Link className={styles.back} to="/assessments">К своим аттестациям</Link>{student && <><br /><Link className={styles.back} to="/cabinet?tab=record-book&example=1">Демонстрационная зачётка студента</Link></>}</div>
    {assessmentId ? assessment ? <><Link className={styles.back} to={`/assessments?example=1&semester=${assessment.recordBook?.semester ?? 1}`}>← К списку примера</Link><AssessmentDetails assessment={assessment} snapshot={snapshot} actorId={actorId} role={previewRole} blocked refresh={noop} onMessage={noop} /></> : <p>Пример аттестации не найден.</p> : <>
      <header className={styles.pageHeader}><div><p className={styles.eyebrow}>Пример учебного пути</p><h1>Аттестации за 4 курса</h1><p className={styles.note}>Экзамены, зачёты и пересдачи — от первого семестра до выпуска.</p></div><span className={styles.badge}>{Math.ceil(semester / 2)} курс · {semester} семестр</span></header>
      <Card className={styles.filterPanel}><Dropdown label="Курс и семестр" value={String(semester)} options={Array.from({ length: 8 }, (_, index) => ({ value: String(index + 1), label: `${Math.ceil((index + 1) / 2)} курс · ${index + 1} семестр` }))} onChange={(value) => setParams({ example: "1", semester: value })} /></Card>
      <div className={styles.sectionHeader}><h2>Ведомости семестра</h2><span className={styles.note}>Всего: {rows.length}</span></div>
      <div className={styles.list}>{rows.map((entry) => <AssessmentCatalogCard key={entry.id} assessment={entry} actorId={actorId} student example />)}</div>
    </>}
  </div>;
}
