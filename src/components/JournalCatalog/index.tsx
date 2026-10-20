import { Link, useParams, useSearchParams } from "react-router-dom";
import { getSubject, JOURNAL_SUBJECTS } from "../../pages/journal/data";
import { matchesSearchText } from "../../domain/search";
import { formatCount } from "../../domain/formatCount";
import { useRole } from "../RoleContext";
import FileStorage from "../FileStorage";
import SearchField from "../SearchField";
import ArrowCircle from "../ArrowCircle";
import styles from "./index.module.scss";

const JournalCatalog = () => {
  const { subjectId } = useParams();
  const { currentUser } = useRole();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const selectedSubject = getSubject(subjectId);
  const subjects = JOURNAL_SUBJECTS.filter((subject) => !subjectId || subject.id === subjectId).flatMap((subject) => {
    const membership = currentUser.memberships.find((item) => item.subjectId === subject.id);
    return membership ? [{ ...subject, groups: subject.groups.filter((group) => membership.groupIds.includes(group.id)) }] : [];
  });
  const groupsCount = subjects.reduce((count, subject) => count + subject.groups.length, 0);
  const filtered = subjects.map((subject) => ({ ...subject, groups: subject.groups.filter((group) => matchesSearchText(`${subject.name} ${subject.shortName} ${group.name}`, query)) })).filter((subject) => subject.groups.length > 0);
  const visibleCount = filtered.reduce((count, subject) => count + subject.groups.length, 0);
  const setQuery = (value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set("q", value); else next.delete("q"); next.delete("filter"); return next; }, { replace: true });

  if (subjectId && (!selectedSubject || !subjects.length)) return <div className={`pageContainer ${styles.page}`}><div className={styles.empty}><h1>Дисциплина недоступна</h1><p>Ссылка устарела или дисциплина не входит в ваши назначения.</p><Link to="/journal">Вернуться к моим журналам →</Link></div></div>;

  return <div className={`pageContainer ${styles.page}`}>
    <header className={styles.pageHeader}>
      <nav className={styles.breadcrumbs} aria-label="Навигационная цепочка">{selectedSubject ? <Link to="/journal">Журнал</Link> : <span aria-current="page">Журнал</span>}{selectedSubject && <><span>/</span><span aria-current="page">{selectedSubject.name}</span></>}</nav>
      {selectedSubject && <h1>{selectedSubject.name}</h1>}
    </header>
    {groupsCount > 0 && <div className={styles.catalogTools}><SearchField label="Найти журнал" value={query} onChange={setQuery} placeholder="Название дисциплины или группы" /></div>}
    {query.trim() && <div className={styles.resultLine}><p role="status">Показано журналов: {visibleCount} из {groupsCount}</p></div>}
    {filtered.length ? <div className={`${styles.subjectsGrid} ${selectedSubject ? styles.singleSubject : ""}`}>
      {filtered.map((subject) => <section className={`${styles.subjectCard} ${styles[subject.color]}`} key={subject.id}>
        <header className={styles.subjectHeader}><div className={styles.subjectIcon}>{subject.shortName}</div><div><Link className={styles.subjectLink} to={`/journal/${subject.id}`}><h2>{subject.name}</h2></Link><p>{subject.semester}</p></div><span className={styles.groupsCounter}>{subject.groups.length} гр.</span></header>
        <div className={styles.groupsGrid}>{subject.groups.map((group) => <Link className={styles.groupCard} to={`/journal/${subject.id}/${group.id}`} key={group.id}><div className={styles.groupTopline}><strong>{group.name}</strong><ArrowCircle className={styles.arrow} hoverBackground="var(--subject-accent)" /></div><span>{group.course} курс · {formatCount(group.students, ["студент", "студента", "студентов"])}</span></Link>)}</div>
      </section>)}
    </div> : <div className={styles.empty}><strong>{groupsCount ? "Журналы не найдены" : "Журналов пока нет"}</strong><p>{groupsCount ? "Измените запрос, чтобы увидеть доступные группы." : "Здесь появятся дисциплины и группы, назначенные преподавателю."}</p>{groupsCount > 0 && <button type="button" onClick={() => setQuery("")}>Показать все журналы</button>}</div>}
    {selectedSubject && subjects.length > 0 && <div className={styles.materials}><FileStorage key={selectedSubject.id} storageKey={`subject:${selectedSubject.id}`} eyebrow="Материалы дисциплины" title="Конспекты и материалы" description={`Общие материалы по дисциплине «${selectedSubject.name}». Доступны студентам всех её групп.`} emptyTitle="Добавьте материалы по предмету" emptyDescription="Конспекты, презентации, методические пособия и литература" /></div>}
  </div>;
};

export default JournalCatalog;
