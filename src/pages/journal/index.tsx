import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { AttendanceTable } from "../../components/Attendance";
import BarChartTop from "../../components/Charts/BarChartTop/withsegments";
import RadarChart from "../../components/Charts/CircleChart/Radar";
import JournalMaterials from "../../components/JournalMaterials";
import {
  calculateAttendanceCounts,
  calculateGradeCounts,
  getTopBottom,
  prepareRadarData,
} from "./chartsCalculation";
import styles from "./index.module.scss";
import { getSubject } from "./data";
import AssignmentCenter from "../../components/AssignmentCenter";
import Tabs from "../../components/Tabs";
import { JOURNAL_PERIOD, useJournal } from "../../data/journalStore";
import { useRole } from "../../components/RoleContext";
import { createSubjectLessons } from "../../data/lessons";
import JournalHistory from "../../components/JournalHistory";
import JournalSummary from "../../components/JournalSummary";
import AttendanceLegend from "../../components/AttendanceLegend";
import LessonTypeFilter from "../../components/LessonTypeFilter";
import type { LessonTypeFilterValue } from "../../components/LessonTypeFilter";
import { createJournalCsv, downloadJournalCsv } from "../../domain/journalExport";
import { changeJournalSection, getJournalSection } from "../../domain/journalNavigation";
import { isPerformanceLesson } from "../../domain/academic";
import { useDashboardUpdate } from "../../data/studentDashboard";
import { formatCount } from "../../domain/formatCount";

const formatIdentifier = (value = "") =>
  decodeURIComponent(value).replaceAll("-", " ");

const Journal = () => {
  const { subjectId, groupId } = useParams();
  const now = useDashboardUpdate();
  const { canAccessJournal, currentUser } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeSection = getJournalSection(searchParams, true);
  const setActiveSection = (section: string) => setSearchParams((current) => changeJournalSection(current, section));
  const [lessonType, setLessonType] = useState<LessonTypeFilterValue>("all");
  const subjectName = getSubject(subjectId)?.name ?? formatIdentifier(subjectId);
  const groupName = getSubject(subjectId)?.groups.find((group) => group.id === groupId)?.name ?? formatIdentifier(groupId).toUpperCase();
  const journal = useJournal(subjectId ?? "", groupId ?? "", currentUser);
  const { students, setStudents } = journal;
  const lessons = useMemo(() => createSubjectLessons(subjectId ?? "", groupId ?? ""), [subjectId, groupId, now]);
  const visibleLessons = useMemo(() => lessonType === "all" ? lessons : lessons.filter((lesson) => lesson.type === lessonType), [lessonType, lessons]);
  const exportJournal = () => downloadJournalCsv(createJournalCsv(students, visibleLessons), `journal-${subjectId}-${groupId}.csv`);

  const chartsData = useMemo(() => {
    const completedLessons = visibleLessons.filter((lesson) => lesson.state === "completed");
    const lessonIds = completedLessons.map((lesson) => lesson.id);
    const attendanceCounts = calculateAttendanceCounts(students, lessonIds);
    const gradeCounts = calculateGradeCounts(students, completedLessons.filter(isPerformanceLesson).map((lesson) => lesson.id));
    return {
      topAttendance: getTopBottom(students, attendanceCounts, true),
      bottomAttendance: getTopBottom(students, attendanceCounts, false),
      topGrades: getTopBottom(students, gradeCounts, true),
      bottomGrades: getTopBottom(students, gradeCounts, false),
      ...prepareRadarData(students, completedLessons),
    };
  }, [students, visibleLessons]);

  if (!subjectId || !groupId || !canAccessJournal(subjectId, groupId)) return (
    <div className={`pageContainer ${styles.page}`}>
      <h1>Журнал недоступен</h1>
      <p>Эта группа или дисциплина не назначена текущему преподавателю.</p>
      <Link to="/journal">Вернуться к журналам</Link>
    </div>
  );

  return (
    <div className={`pageContainer ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <nav className={styles.breadcrumbs} aria-label="Навигационная цепочка">
            <Link to="/journal">Журнал</Link>
            <span>/</span><Link to={`/journal/${subjectId}`}>{subjectName}</Link><span>/</span><span aria-current="page">{groupName}</span>
          </nav>
          <h1>{subjectName}</h1>
          <p>Группа {groupName}</p>
        </div>
        {activeSection === "journal" && <button type="button" className={styles.exportButton} disabled={!students.length || !visibleLessons.length || Boolean(journal.error)} onClick={exportJournal}>Экспортировать CSV</button>}
      </header>

      <Tabs ariaLabel="Разделы журнала" value={activeSection} onChange={setActiveSection} items={[{ value: "journal", label: "Журнал и аналитика" }, { value: "assignments", label: "Задания" }, { value: "materials", label: "Материалы" }, { value: "history", label: "История", count: journal.history.length }]} />
      {journal.historyError && activeSection !== "history" && <p className={styles.pageError} role="alert">{journal.historyError}</p>}

      {activeSection === "journal" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}>
          <div><span>Электронный журнал</span><h2>Студенты группы</h2></div>
          <strong>{formatCount(students.length, ["студент", "студента", "студентов"])} · {JOURNAL_PERIOD}</strong>
        </div>
        {journal.error ? <p className={styles.pageError} role="alert">{journal.error}</p> : journal.lastSavedAt && <p className={styles.saveStatus} role="status">Сохранено {new Date(journal.lastSavedAt).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</p>}
        <div className={styles.tableFilters}><LessonTypeFilter lessons={lessons} value={lessonType} onChange={setLessonType} /><AttendanceLegend /></div>
        <AttendanceTable students={students} setStudents={setStudents} lessons={visibleLessons} />
        <div className={styles.inlineAnalytics}>
          <div className={styles.sectionHeading}><div><span>Срез данных</span><h2>Аналитика группы</h2></div><strong>Проведённые занятия по текущему фильтру</strong></div>
          <JournalSummary students={students} lessons={visibleLessons} period={JOURNAL_PERIOD} />
          <div className={styles.chartsGrid}>
            <div className={styles.chartCard}>
              <h3>Лидеры по посещаемости</h3>
              <BarChartTop labels={chartsData.topAttendance.map((item) => item.s.name)} values={chartsData.topAttendance.map((item) => item.value)} maxValue={chartsData.daysCount} segments={5} height={100} colorMode={8} />
              <RadarChart labels={chartsData.radarLabels} data={chartsData.attendanceRadarData} maxValue={chartsData.maxAttendanceValue} size={300} colorMode={7} />
              <h3>Требуют внимания</h3>
              <BarChartTop labels={chartsData.bottomAttendance.map((item) => item.s.name)} values={chartsData.bottomAttendance.map((item) => item.value)} maxValue={chartsData.daysCount} segments={5} height={100} colorMode={2} />
            </div>
            <div className={styles.chartCard}>
              <p className={styles.chartHint}>Только практики и лабораторные · без оценок занятия не отображаются</p>
              {chartsData.topGrades.length ? <><h3>Лидеры по успеваемости</h3>
              <BarChartTop labels={chartsData.topGrades.map((item) => item.s.name)} values={chartsData.topGrades.map((item) => item.value)} maxValue={5} segments={5} height={100} colorMode={7} />
              <h3>Оценки по занятиям</h3>
              <RadarChart labels={chartsData.gradeRadarLabels} data={chartsData.radarDataGrades} maxValue={chartsData.maxRadarValue} size={300} colorMode={6} />
              <h3>Низкая успеваемость</h3>
              <BarChartTop labels={chartsData.bottomGrades.map((item) => item.s.name)} values={chartsData.bottomGrades.map((item) => item.value)} maxValue={5} segments={5} height={100} colorMode={15} /></> : <p className={styles.chartEmpty}>За выбранные занятия нет оценок для графика.</p>}
            </div>
          </div>
        </div>
      </section>}

      {activeSection === "materials" && <div className={styles.groupMaterials}>
        <JournalMaterials subject={{ id: subjectId, name: subjectName }} group={{ id: groupId, name: groupName }} />
      </div>}

      {activeSection === "assignments" && <section className={styles.tableSection}>
        <div className={styles.sectionHeading}><div><span>По датам занятий</span><h2>Задания и ответы</h2></div></div>
        <AssignmentCenter key={`${subjectId}:${groupId}`} subject={subjectName} group={groupName} />
      </section>}

      {activeSection === "history" && <JournalHistory changes={journal.history} lessons={lessons} error={journal.historyError} />}
    </div>
  );
};

export default Journal;
