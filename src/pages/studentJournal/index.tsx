import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AssignmentCenter from "../../components/AssignmentCenter";
import { AttendanceTable } from "../../components/Attendance";
import JournalMaterials from "../../components/JournalMaterials";
import Tabs from "../../components/Tabs";
import { getSubject, JOURNAL_SUBJECTS } from "../journal/data";
import styles from "../journal/index.module.scss";
import catalogStyles from "../../components/JournalCatalog/index.module.scss";
import { JOURNAL_PERIOD, useJournal } from "../../data/journalStore";
import { useRole } from "../../components/RoleContext";
import { createSubjectLessons } from "../../data/lessons";
import AttendanceLegend from "../../components/AttendanceLegend";
import JournalSummary from "../../components/JournalSummary";
import LessonTypeFilter from "../../components/LessonTypeFilter";
import type { LessonTypeFilterValue } from "../../components/LessonTypeFilter";
import ArrowCircle from "../../components/ArrowCircle";
import { changeJournalSection, getJournalSection } from "../../domain/journalNavigation";
import { useDashboardUpdate } from "../../data/studentDashboard";

const StudentJournal = () => {
  const { subjectId, groupId } = useParams();
  const now = useDashboardUpdate();
  const { currentUser, canAccessJournal } = useRole();
  const subjectMembership = currentUser.memberships.find((membership) => membership.subjectId === subjectId);
  const studentGroup = groupId ?? subjectMembership?.groupIds[0] ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = getJournalSection(searchParams);
  const setActiveSection = (section: string) => setSearchParams((current) => changeJournalSection(current, section));
  const [lessonType, setLessonType] = useState<LessonTypeFilterValue>("all");
  const subject = getSubject(subjectId);
  const subjects = JOURNAL_SUBJECTS.filter((item) => currentUser.memberships.some((membership) => membership.subjectId === item.id));
  const group = subject?.groups.find((item) => item.id === studentGroup);
  const journal = useJournal(subjectId ?? "", studentGroup);
  const student = journal.students.find((item) => item.id === currentUser.id);
  const lessons = useMemo(() => createSubjectLessons(subjectId ?? "", studentGroup), [subjectId, studentGroup, now]);
  const visibleLessons = useMemo(() => lessonType === "all" ? lessons : lessons.filter((lesson) => lesson.type === lessonType), [lessonType, lessons]);

  if (subjectId && (!subject || !group || !canAccessJournal(subjectId, groupId ?? studentGroup))) return (
    <div className={`pageContainer ${styles.page}`}>
      <h1>Дисциплина недоступна</h1>
      <p>Выберите предмет своей группы в журнале.</p>
      <Link to="/journal">Вернуться к журналу</Link>
    </div>
  );

  if (!subject || !group) return (
    <div className={`pageContainer ${catalogStyles.page}`}>
      <header className={catalogStyles.pageHeader}>
        <nav className={catalogStyles.breadcrumbs} aria-label="Навигационная цепочка"><span aria-current="page">Журнал</span></nav>
      </header>
      <div className={catalogStyles.subjectsGrid}>
        {subjects.map((item) => {
          const membershipGroupId = currentUser.memberships.find((membership) => membership.subjectId === item.id)?.groupIds[0] ?? "";
          const membershipGroup = item.groups.find((entry) => entry.id === membershipGroupId);
          return (
          <section className={`${catalogStyles.subjectCard} ${catalogStyles[item.color]}`} key={item.id}>
            <header className={catalogStyles.subjectHeader}>
              <div className={catalogStyles.subjectIcon}>{item.shortName}</div>
              <div><Link className={catalogStyles.subjectLink} to={`/journal/${item.id}`}><h2>{item.name}</h2></Link><p>{item.semester}</p></div>
            </header>
            <div className={catalogStyles.groupsGrid}>
              <Link className={catalogStyles.groupCard} to={`/journal/${item.id}/${membershipGroupId}`}>
                <div className={catalogStyles.groupTopline}><strong>Мой журнал · {membershipGroup?.name ?? membershipGroupId}</strong><ArrowCircle className={catalogStyles.arrow} hoverBackground="var(--subject-accent)" /></div>
                <span>Посещаемость, оценки, задания и материалы</span>
              </Link>
            </div>
          </section>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`pageContainer ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <nav className={styles.breadcrumbs} aria-label="Навигационная цепочка"><Link to="/journal">Журнал</Link><span>/</span><span>{subject.name}</span><span>/</span><span aria-current="page">{group.name}</span></nav>
          <h1>{subject.name}</h1>
          <p>Группа {group.name}</p>
        </div>
      </header>
      <Tabs ariaLabel="Разделы журнала" value={activeSection} onChange={setActiveSection} items={[{ value: "journal", label: "Журнал и прогресс" }, { value: "assignments", label: "Задания" }, { value: "materials", label: "Материалы" }]} />
      {activeSection === "journal" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}><div><span>Электронный журнал</span><h2>Мои результаты</h2></div><strong>{JOURNAL_PERIOD}</strong></div>
        {journal.error && <p className={styles.pageError} role="alert">{journal.error}</p>}
        <div className={styles.tableFilters}><LessonTypeFilter lessons={lessons} value={lessonType} onChange={setLessonType} /><AttendanceLegend /></div>
        {student ? <AttendanceTable students={[student]} readOnly lessons={visibleLessons} /> : <p>Записи студента пока не найдены.</p>}
        {student && <div className={styles.inlineAnalytics}>
          <div className={styles.sectionHeading}><div><span>Личный срез</span><h2>Мой прогресс</h2></div><strong>По текущему фильтру занятий</strong></div>
          <JournalSummary students={[student]} lessons={visibleLessons} period={JOURNAL_PERIOD} />
        </div>}
      </section>}
      {activeSection === "assignments" && <section className={styles.tableSection}>
        <AssignmentCenter key={`${subject.id}:${group.id}`} subject={subject.name} group={group.name} />
      </section>}
      {activeSection === "materials" && <div className={styles.groupMaterials}>
        <JournalMaterials subject={subject} group={group} readOnly />
      </div>}
    </div>
  );
};

export default StudentJournal;

