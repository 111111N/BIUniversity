import { useMemo, useRef, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProfileLink from "../ProfileLink";
import { readAnalyticsNavigation, updateAnalyticsNavigation } from "../../domain/analyticsNavigation";
import { getAcademicGroup, getAcademicSubjectDefinition, getJournalHrefById } from "../../data/academicCatalog";
import { getAssignments, getSubmissions } from "../../data/assignmentStore";
import { readAnalyticsJournals } from "../../data/teacherAnalytics";
import { useDashboardUpdate } from "../../data/studentDashboard";
import { calculateTeacherAnalytics, getAnalyticsRange } from "../../domain/teacherAnalytics";
import { formatDashboardValue } from "../../domain/dashboard";
import { formatCount } from "../../domain/formatCount";
import { toLocalDateKey } from "../../domain/schedule";
import { useRole } from "../RoleContext";
import LineChart from "../Charts/LineChart";
import SelectField from "../SelectField";
import SortControls from "../SortControls";
import WeekPicker from "../WeekPicker";
import Card from "../Card";
import styles from "./index.module.scss";

const PERIODS = [{ value: "semester", label: "С начала семестра" }, { value: "week", label: "Выбранная неделя" }, { value: "month", label: "Текущий месяц" }, { value: "four-weeks", label: "Последние 4 недели" }];
const GRADE_SEGMENTS = [{ label: "Отлично", grade: 5, color: "var(--ui-chart-green)" }, { label: "Хорошо", grade: 4, color: "var(--ui-chart-purple)" }, { label: "Удовл.", grade: 3, color: "var(--ui-chart-amber)" }, { label: "Неудовл.", grade: 2, color: "var(--ui-chart-red)" }];
const polarPoint = (radius: number, angle: number) => { const radians = (angle - 90) * Math.PI / 180; return { x: 55 + radius * Math.cos(radians), y: 55 + radius * Math.sin(radians) }; };
const donutSegmentPath = (start: number, end: number, selected: boolean) => {
  const outer = selected ? 47 : 44;
  const inner = selected ? 31 : 37;
  if (end - start >= 360 - 1e-7) {
    const top = polarPoint(outer, start), bottom = polarPoint(outer, start + 180);
    const innerTop = polarPoint(inner, start), innerBottom = polarPoint(inner, start + 180);
    return `M ${top.x} ${top.y} A ${outer} ${outer} 0 1 1 ${bottom.x} ${bottom.y} A ${outer} ${outer} 0 1 1 ${top.x} ${top.y} Z M ${innerTop.x} ${innerTop.y} A ${inner} ${inner} 0 1 0 ${innerBottom.x} ${innerBottom.y} A ${inner} ${inner} 0 1 0 ${innerTop.x} ${innerTop.y} Z`;
  }
  const gap = Math.min(1.4, (end - start) * .15);
  const outerStart = polarPoint(outer, start + gap), outerEnd = polarPoint(outer, end - gap);
  const innerEnd = polarPoint(inner, end - gap), innerStart = polarPoint(inner, start + gap);
  const largeArc = end - start - gap * 2 > 180 ? 1 : 0;
  return `M ${outerStart.x} ${outerStart.y} A ${outer} ${outer} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y} L ${innerEnd.x} ${innerEnd.y} A ${inner} ${inner} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y} Z`;
};
const formatPercent = (value: number | null) => value === null ? "—" : `${formatDashboardValue(value)}%`;
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });
const weekRange = (date: string, range: { start: Date; end: Date }) => {
  const monday = new Date(`${date}T00:00:00`);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 7);
  sunday.setMilliseconds(-1);
  return { start: new Date(Math.max(monday.getTime(), range.start.getTime())), end: new Date(Math.min(sunday.getTime(), range.end.getTime())) };
};
const formatWeek = (range: { start: Date; end: Date }) => `${dateFormat.format(range.start)} — ${dateFormat.format(range.end)}`;

const TeacherStatistics = () => {
  const { currentUser } = useRole();
  const now = useDashboardUpdate();
  const [params, setParams] = useSearchParams();
  const { subjectId, groupId, period, selectedWeek, selectedGrade, drillWeek, showAllRisks, attendanceSort, gradeSort } = readAnalyticsNavigation(params, currentUser.memberships, now);
  const updateFilters = (changes: Record<string, string | null>) => {
    setParams((current) => updateAnalyticsNavigation(current, changes));
  };
  const setSelectedGrade = (index: number | null) => updateFilters({ grade: index === null ? null : String(GRADE_SEGMENTS[index].grade) });
  const setDrillWeek = (date: string | null) => updateFilters({ drill: date });
  const segmentRefs = useRef<Array<SVGGElement | null>>([]);
  const { journals, warnings } = useMemo(() => readAnalyticsJournals(currentUser.memberships, now.getTime()), [currentUser.memberships, now]);
  const subjects = currentUser.memberships.flatMap((membership) => { const subject = getAcademicSubjectDefinition(membership.subjectId); return subject ? [subject] : []; });
  const groups = Array.from(new Set(currentUser.memberships.filter((membership) => subjectId === "all" || membership.subjectId === subjectId).flatMap((membership) => membership.groupIds))).flatMap((id) => { const group = getAcademicGroup(id); return group ? [group] : []; });
  const baseRange = getAnalyticsRange(period, now, selectedWeek);
  const drilledRange = drillWeek ? weekRange(drillWeek, baseRange) : null;
  const range = drilledRange && drilledRange.start <= drilledRange.end ? drilledRange : baseRange;
  const scopedJournals = useMemo(() => journals.filter((journal) => (subjectId === "all" || journal.subjectId === subjectId) && (groupId === "all" || journal.groupId === groupId)), [journals, subjectId, groupId]);
  const selected = selectedGrade;
  const rangeStart = range.start.getTime(), rangeEnd = range.end.getTime();
  const baseStart = baseRange.start.getTime(), baseEnd = baseRange.end.getTime();
  const { gradeContext, trend, assignments, submissions } = useMemo(() => {
    const assignments = getAssignments(), submissions = getSubmissions();
    const scopedRange = { start: new Date(rangeStart), end: new Date(rangeEnd) };
    const gradeContext = calculateTeacherAnalytics(scopedJournals, assignments, submissions, scopedRange);
    return {
      gradeContext,
      assignments,
      submissions,
      trend: calculateTeacherAnalytics(scopedJournals, assignments, submissions, { start: new Date(baseStart), end: new Date(baseEnd) }, undefined, period === "week" ? "day" : "week").trend,
    };
  }, [scopedJournals, rangeStart, rangeEnd, baseStart, baseEnd, period]);
  const analytics = useMemo(() => selected === null ? gradeContext : calculateTeacherAnalytics(
    scopedJournals, assignments, submissions,
    { start: new Date(rangeStart), end: new Date(rangeEnd) }, GRADE_SEGMENTS[selected].grade
  ), [selected, gradeContext, scopedJournals, assignments, submissions, rangeStart, rangeEnd]);
  const attendanceGroups = [...analytics.groupMetrics].sort((a, b) => a.attendance === null ? b.attendance === null ? 0 : 1 : b.attendance === null ? -1 : attendanceSort === "asc" ? a.attendance - b.attendance : b.attendance - a.attendance);
  const gradeGroups = analytics.groupMetrics.filter((group): group is typeof group & { average: number } => group.average !== null).sort((a, b) => gradeSort === "asc" ? a.average - b.average : b.average - a.average);
  const completion = analytics.work.expected ? analytics.work.received / analytics.work.expected * 100 : null;
  const activeTrend = (period !== "week" ? trend.find((point) => point.date === drillWeek && point.value !== null) : undefined) ?? trend.filter((point) => point.value !== null).at(-1);
  const trendTitle = period === "week" ? "Посещаемость по дням" : "Посещаемость по неделям";
  const trendLabel = (date: string) => period === "week" ? dateFormat.format(new Date(`${date}T12:00:00`)) : formatWeek(weekRange(date, baseRange));
  const gradeShare = (index: number) => gradeContext.distribution[index] && !gradeContext.shares[index] ? "<1%" : `${gradeContext.shares[index]}%`;
  const moveSegment = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); setSelectedGrade(selected === index ? null : index); return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const available = gradeContext.distribution.flatMap((count, item) => count ? [item] : []);
    const position = available.indexOf(index);
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (position + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length;
    segmentRefs.current[available[next]]?.focus();
  };

  return <div className={styles.dashboard}>
    <section className={styles.filterControls} aria-label="Фильтры статистики">
    <div className={styles.filters}>
      <SelectField variant="navigation" label="Дисциплина" value={subjectId} onChange={(value) => { updateFilters({ subject: value, group: null, grade: null }); }} options={[{ value: "all", label: "Все дисциплины" }, ...subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
      <SelectField variant="navigation" label="Группа" value={groupId} onChange={(value) => { updateFilters({ group: value, grade: null }); }} options={[{ value: "all", label: "Все группы" }, ...groups.map((group) => ({ value: group.id, label: group.name }))]} />
      <SelectField variant="navigation" label="Период" value={period} onChange={(value) => { updateFilters({ period: value, drill: null, grade: null }); }} options={PERIODS} />
    </div>
    {period === "week" && <WeekPicker value={selectedWeek} onWeekChange={(date) => { updateFilters({ week: toLocalDateKey(date), drill: null, grade: null }); }} />}
    <div className={styles.activeFilters} aria-label="Активные фильтры" aria-hidden={selected === null && !drillWeek} style={{ visibility: selected === null && !drillWeek ? "hidden" : undefined }}><span>Фильтры:</span>{selected !== null && <button type="button" onClick={() => setSelectedGrade(null)}>Оценка {GRADE_SEGMENTS[selected].grade} ×</button>}{drillWeek && <button type="button" onClick={() => setDrillWeek(null)}>{formatWeek(range)} ×</button>}<button type="button" onClick={() => { updateFilters({ grade: null, drill: null }); }}>Сбросить всё</button></div>
    {warnings.length > 0 && <p className={styles.dataWarning} role="alert">Не удалось прочитать журналы: {warnings.join(", ")}. Они исключены из расчётов; сохранённые записи не изменены.</p>}
    </section>
    <section className={styles.metrics} aria-label="Ключевые показатели">
      <Card as="article"><span>Студентов</span><strong>{analytics.students}</strong><small>{formatCount(analytics.groups, ["группа", "группы", "групп"])} · {formatCount(analytics.journals, ["журнал", "журнала", "журналов"])}</small></Card>
      <Card as="article"><span>Посещаемость</span><strong>{formatPercent(analytics.attendance)}</strong><small>{analytics.marked ? formatCount(analytics.marked, ["отметка", "отметки", "отметок"]) : "Нет отметок"}</small></Card>
      <Card as="article"><span>Средний балл</span><strong>{formatDashboardValue(analytics.averageGrade, 2)}</strong><small>{analytics.gradesCount ? formatCount(analytics.gradesCount, ["оценка", "оценки", "оценок"]) : "Нет оценок"}</small></Card>
      <Card as="article" className={styles.riskMetric}><span>Требуют внимания</span><strong>{analytics.risks.length}</strong></Card>
    </section>

    <div className={styles.mainGrid}>
      <Card as="section" className={styles.chartCard} aria-label="Распределение результатов">
        <header><h2>Распределение результатов</h2><strong className={styles.sampleCount}>{gradeContext.gradesCount}</strong></header>
        {gradeContext.gradesCount ? <><div className={styles.gradeChart}>
          <div className={styles.donutWrap}><svg className={`${styles.donut} ${selected !== null ? styles.filteredDonut : ""}`} viewBox="0 0 110 110" role="group" aria-label="Распределение оценок журнала">
            {GRADE_SEGMENTS.map((segment, index) => {
              if (!gradeContext.distribution[index]) return null;
              const start = gradeContext.distribution.slice(0, index).reduce((sum, count) => sum + count, 0) / gradeContext.gradesCount * 360;
              const end = start + gradeContext.distribution[index] / gradeContext.gradesCount * 360;
              const toggle = () => setSelectedGrade(selected === index ? null : index);
              const outlinePath = donutSegmentPath(start, end, false);
              const expandedPath = donutSegmentPath(start, end, true);
              return <g key={segment.grade} ref={(node) => { segmentRefs.current[index] = node; }} className={styles.segmentGroup} style={{ color: segment.color }} role="button" tabIndex={0} aria-pressed={selected === index} onClick={toggle} onKeyDown={(event) => moveSegment(event, index)} aria-label={`Оценка ${segment.grade}, ${segment.label}: ${gradeContext.distribution[index]}, ${gradeShare(index)}. ${selected === index ? "Снять фильтр" : "Фильтровать данные"}`}>
                <path className={styles.hitSegment} d={expandedPath} />
                {/* Форма и размытие слоёв постоянны; при наведении и выборе меняется только прозрачность. */}
                <g className={styles.segmentVisual} aria-hidden="true">
                  <path className={styles.donutSegment} d={outlinePath} />
                  <path className={styles.mutedSegment} d={outlinePath} />
                  <path className={styles.hoverSegment} d={outlinePath} />
                  <path className={styles.selectedGlow} d={expandedPath} />
                  <path className={styles.selectedSegment} d={expandedPath} />
                </g>
              </g>;
            })}
          </svg><div className={styles.donutValue}><strong>{selected === null ? "100%" : gradeShare(selected)}</strong><span>{selected === null ? "Все оценки" : `${formatCount(gradeContext.distribution[selected], ["оценка", "оценки", "оценок"])} «${GRADE_SEGMENTS[selected].grade}»`}</span></div></div>
          <div className={styles.legend}>{GRADE_SEGMENTS.map((segment, index) => <button type="button" disabled={!gradeContext.distribution[index] && selected !== index} aria-pressed={selected === index} className={selected === index ? styles.activeLegend : ""} onClick={() => setSelectedGrade(selected === index ? null : index)} key={segment.grade}><i style={{ background: segment.color }} /><span>{segment.grade} · {segment.label}<small>{formatCount(gradeContext.distribution[index], ["оценка", "оценки", "оценок"])}</small></span><strong>{gradeShare(index)}</strong></button>)}</div>
        </div></> : <div className={styles.chartEmpty}><strong>Нет оценок за практики и лабораторные</strong><Link to="/journal">Открыть журнал →</Link></div>}
      </Card>
      <Card as="section" className={`${styles.chartCard} ${styles.trendCard}`} aria-label={trendTitle}><header><h2>{trendTitle}</h2><div className={styles.trendValue}><strong>{formatPercent(activeTrend?.value ?? null)}</strong><small>{activeTrend ? `${period !== "week" && drillWeek === activeTrend.date ? "Выбрано: " : "Последняя: "}${trendLabel(activeTrend.date)}` : "Нет отметок"}</small></div></header>
        {trend.length ? <LineChart label={trendTitle} data={trend.map((point) => point.value === null ? null : Math.round(point.value * 10) / 10)} labels={trend.map((point) => trendLabel(point.date))} axisLabels={trend.map((point) => dateFormat.format(period === "week" ? new Date(`${point.date}T12:00:00`) : weekRange(point.date, baseRange).start))} length={trend.length} height={260} selectedIndex={period === "week" ? null : trend.findIndex((point) => point.date === drillWeek)} onPointSelect={period === "week" ? undefined : (index) => setDrillWeek(drillWeek === trend[index].date ? null : trend[index].date)} /> : <div className={styles.chartEmpty}><strong>Нет данных для динамики</strong></div>}
      </Card>
    </div>

    <div className={styles.middleGrid}>
      <Card as="section" className={`${styles.chartCard} ${styles.riskCard}`} aria-label="Студенты, требующие внимания"><header><h2>Требуют внимания</h2>{analytics.risks.length > 4 && <button type="button" aria-expanded={showAllRisks} onClick={() => updateFilters({ risks: showAllRisks ? null : "all" })}>{showAllRisks ? "Свернуть" : `Все ${analytics.risks.length}`}</button>}</header>
        <div className={styles.riskList}>{analytics.risks.slice(0, showAllRisks ? analytics.risks.length : 4).map((student) => <div key={student.key}><span>{student.initials}</span><p><strong><ProfileLink to={`/students/${encodeURIComponent(student.id)}?groupId=${encodeURIComponent(student.groupId)}`} title="Открыть профиль студента">{student.name}</ProfileLink> <em><Link to={getJournalHrefById(student.subjectId, student.groupId)} title="Открыть журнал группы">{student.groupName}</Link></em></strong><small>{student.reasons.join(" · ")}</small></p><b className={student.level === "Средний" ? styles.medium : ""}>{student.level}</b></div>)}{!analytics.risks.length && <p className={styles.emptyRisk}>По доступным данным за этот период сигналов риска нет.</p>}</div>
      </Card>
      <Card as="section" className={`${styles.chartCard} ${styles.workCard}`} aria-label="Выполнение работ"><header><h2>Выполнение работ</h2><strong>{formatPercent(completion)}</strong></header>
        <p className={styles.chartHint}>{analytics.work.received} из {analytics.work.expected} ожидаемых ответов · заданий: {analytics.work.assignments}</p>
        <div className={styles.workProgress} role="progressbar" aria-label="Получено ответов" aria-valuemin={0} aria-valuemax={Math.max(analytics.work.expected, 1)} aria-valuenow={analytics.work.received}><i style={{ width: `${completion ?? 0}%` }} /></div>
        <div className={styles.workStats}><div><span>Первый ответ вовремя</span><strong>{analytics.work.onTime}</strong></div><div><span>На проверке</span><strong>{analytics.work.waiting}</strong></div><div><span>Без ответа после срока</span><strong>{analytics.work.overdue}</strong></div><div><span>На доработке</span><strong>{analytics.work.revision}</strong></div><div><span>Проверено</span><strong>{analytics.work.graded}</strong></div><Link to={subjectId !== "all" && groupId !== "all" ? `${getJournalHrefById(subjectId, groupId)}?tab=assignments` : "/journal"}><strong>Задания →</strong><span>{subjectId !== "all" && groupId !== "all" ? "Открыть задания группы" : "Выбрать журнал группы"}</span></Link></div>
      </Card>
    </div>

    <div className={styles.lowerGrid}>
      <Card as="section" className={styles.chartCard} aria-label="Посещаемость по журналам"><header><h2>Посещаемость</h2><SortControls value={attendanceSort} onChange={(value) => updateFilters({ attendanceSort: value })} /></header>{attendanceGroups.length ? <div className={styles.groupBars}>{attendanceGroups.map((group) => <Link className={styles.groupBar} to={getJournalHrefById(group.subjectId, group.groupId)} key={group.id} title={`${group.subjectName} · открыть журнал`}><span>{group.groupName}<small>{group.subjectShortName}</small></span><div><i style={{ width: `${group.attendance ?? 0}%` }} /></div><strong>{formatPercent(group.attendance)}</strong></Link>)}</div> : <p className={styles.chartHint}>Нет журналов для сравнения.</p>}</Card>
      <Card as="section" className={styles.chartCard} aria-label="Средний балл по журналам"><header><h2>Средний балл</h2><SortControls value={gradeSort} onChange={(value) => updateFilters({ gradeSort: value })} /></header>{gradeGroups.length ? <div className={styles.groupBars}>{gradeGroups.map((group) => <Link className={styles.groupBar} to={getJournalHrefById(group.subjectId, group.groupId)} key={group.id} title={`${group.subjectName} · открыть журнал`}><span>{group.groupName}<small>{group.subjectShortName}</small></span><div><i style={{ width: `${group.average / 5 * 100}%` }} /></div><strong>{formatDashboardValue(group.average, 2)}</strong></Link>)}</div> : <p className={styles.chartHint}>Нет оценок для сравнения.</p>}</Card>
    </div>
  </div>;
};

export default TeacherStatistics;
