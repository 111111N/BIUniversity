import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProfileLink from "../ProfileLink";
import { readAnalyticsNavigation, updateAnalyticsNavigation } from "../../domain/analyticsNavigation";
import { getAcademicGroup, getAcademicSubjectDefinition, getJournalHrefById } from "../../data/academicCatalog";
import { getAssignments, getSubmissions } from "../../data/assignmentStore";
import { readAnalyticsJournals } from "../../data/teacherAnalytics";
import { useDashboardUpdate } from "../../data/studentDashboard";
import { calculateTeacherAnalytics, createAnalyticsCsv, getAnalyticsRange } from "../../domain/teacherAnalytics";
import { formatDashboardValue } from "../../domain/dashboard";
import { formatCount } from "../../domain/formatCount";
import { downloadJournalCsv } from "../../domain/journalExport";
import { toLocalDateKey } from "../../domain/schedule";
import { useRole } from "../RoleContext";
import LineChart from "../Charts/LineChart";
import SelectField from "../SelectField";
import SortControls from "../SortControls";
import WeekPicker from "../WeekPicker";
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
const dateFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
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
    setExportMessage("");
  };
  const setSelectedGrade = (index: number | null) => updateFilters({ grade: index === null ? null : String(GRADE_SEGMENTS[index].grade) });
  const setDrillWeek = (date: string | null) => updateFilters({ drill: date });
  const [exportMessage, setExportMessage] = useState("");
  const segmentRefs = useRef<Array<SVGGElement | null>>([]);
  const { journals, warnings } = useMemo(() => readAnalyticsJournals(currentUser.memberships), [currentUser.memberships, now]);
  const subjects = currentUser.memberships.flatMap((membership) => { const subject = getAcademicSubjectDefinition(membership.subjectId); return subject ? [subject] : []; });
  const groups = Array.from(new Set(currentUser.memberships.filter((membership) => subjectId === "all" || membership.subjectId === subjectId).flatMap((membership) => membership.groupIds))).flatMap((id) => { const group = getAcademicGroup(id); return group ? [group] : []; });
  const baseRange = getAnalyticsRange(period, now, selectedWeek);
  const drilledRange = drillWeek ? weekRange(drillWeek, baseRange) : null;
  const range = drilledRange && drilledRange.start <= drilledRange.end ? drilledRange : baseRange;
  const scopedJournals = useMemo(() => journals.filter((journal) => (subjectId === "all" || journal.subjectId === subjectId) && (groupId === "all" || journal.groupId === groupId)), [journals, subjectId, groupId]);
  const selected = selectedGrade;
  const rangeStart = range.start.getTime(), rangeEnd = range.end.getTime();
  const baseStart = baseRange.start.getTime(), baseEnd = baseRange.end.getTime();
  const { gradeContext, analytics, trend } = useMemo(() => {
    const assignments = getAssignments(), submissions = getSubmissions();
    const scopedRange = { start: new Date(rangeStart), end: new Date(rangeEnd) };
    const gradeContext = calculateTeacherAnalytics(scopedJournals, assignments, submissions, scopedRange);
    return {
      gradeContext,
      analytics: selected === null ? gradeContext : calculateTeacherAnalytics(scopedJournals, assignments, submissions, scopedRange, GRADE_SEGMENTS[selected].grade),
      trend: calculateTeacherAnalytics(scopedJournals, assignments, submissions, { start: new Date(baseStart), end: new Date(baseEnd) }).trend,
    };
  }, [scopedJournals, rangeStart, rangeEnd, baseStart, baseEnd, selected]);
  const rangeLabel = `${dateFormat.format(range.start)} — ${dateFormat.format(range.end)} ${range.end.getFullYear()}`;
  const attendanceGroups = [...analytics.groupMetrics].sort((a, b) => a.attendance === null ? b.attendance === null ? 0 : 1 : b.attendance === null ? -1 : attendanceSort === "asc" ? a.attendance - b.attendance : b.attendance - a.attendance);
  const gradeGroups = analytics.groupMetrics.filter((group): group is typeof group & { average: number } => group.average !== null).sort((a, b) => gradeSort === "asc" ? a.average - b.average : b.average - a.average);
  const completion = analytics.work.expected ? analytics.work.received / analytics.work.expected * 100 : null;
  const activeTrend = trend.find((point) => point.date === drillWeek) ?? trend.at(-1);
  const gradeShare = (index: number) => gradeContext.distribution[index] && !gradeContext.shares[index] ? "<1%" : `${gradeContext.shares[index]}%`;
  const moveSegment = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); setSelectedGrade(selected === index ? null : index); setExportMessage(""); return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const available = gradeContext.distribution.flatMap((count, item) => count ? [item] : []);
    const position = available.indexOf(index);
    const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : (position + (event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1) + available.length) % available.length;
    segmentRefs.current[available[next]]?.focus();
  };
  const exportReport = () => {
    try {
      const context = `${getAcademicSubjectDefinition(subjectId)?.name ?? "Все дисциплины"} · ${getAcademicGroup(groupId)?.name ?? "Все группы"}${selected !== null ? ` · Оценка ${GRADE_SEGMENTS[selected].grade}` : ""}${warnings.length ? " · Не все журналы доступны для чтения" : ""}`;
      downloadJournalCsv(createAnalyticsCsv(analytics, range, context), `statistics-${period}-${toLocalDateKey(period === "week" || drillWeek ? range.start : now)}${selected !== null ? `-grade-${GRADE_SEGMENTS[selected].grade}` : ""}.csv`);
      setExportMessage("CSV подготовлен. Скачивание зависит от настроек браузера.");
    } catch { setExportMessage("Не удалось подготовить отчёт. Попробуйте ещё раз."); }
  };

  return <div className={styles.dashboard}>
    <div className={styles.filters}>
      <SelectField variant="main" label="Дисциплина" value={subjectId} onChange={(value) => { updateFilters({ subject: value, group: null, grade: null }); }} options={[{ value: "all", label: "Все дисциплины" }, ...subjects.map((subject) => ({ value: subject.id, label: subject.name }))]} />
      <SelectField variant="main" label="Группа" value={groupId} onChange={(value) => { updateFilters({ group: value, grade: null }); }} options={[{ value: "all", label: "Все группы" }, ...groups.map((group) => ({ value: group.id, label: group.name }))]} />
      <SelectField variant="main" label="Период" value={period} onChange={(value) => { updateFilters({ period: value, drill: null, grade: null }); }} options={PERIODS} />
    </div>
    {period === "week" && <WeekPicker value={selectedWeek} onWeekChange={(date) => { updateFilters({ week: toLocalDateKey(date), drill: null, grade: null }); }} />}
    {(selected !== null || drillWeek) && <div className={styles.activeFilters} aria-label="Активные фильтры"><span>Фильтры:</span>{selected !== null && <button type="button" onClick={() => { setSelectedGrade(null); setExportMessage(""); }}>Оценка {GRADE_SEGMENTS[selected].grade} ×</button>}{drillWeek && <button type="button" onClick={() => { setDrillWeek(null); setExportMessage(""); }}>{formatWeek(range)} ×</button>}<button type="button" onClick={() => { updateFilters({ grade: null, drill: null }); }}>Сбросить всё</button>{selected !== null && <small>Посещаемость, работы и риски — по студентам, получившим эту оценку за период. Баллы — только выбранная оценка.</small>}</div>}
    <div className={styles.contextBar}><div><strong>{rangeLabel}</strong><span>Локальные учебные данные · обновляются вместе с журналом</span></div><button type="button" onClick={exportReport}>Скачать отчёт CSV <span aria-hidden="true">↓</span></button></div>
    {exportMessage && <p className={styles.exportStatus} role="status">{exportMessage}</p>}
    {warnings.length > 0 && <p className={styles.dataWarning} role="alert">Не удалось прочитать журналы: {warnings.join(", ")}. Они исключены из расчётов; сохранённые записи не изменены.</p>}
    <section className={styles.metrics} aria-label="Ключевые показатели">
      <article><span>Студентов</span><strong>{analytics.students}</strong><small>Без повторов · {formatCount(analytics.groups, ["группа", "группы", "групп"])} · {formatCount(analytics.journals, ["журнал", "журнала", "журналов"])}</small></article>
      <article><span>Посещаемость</span><strong>{formatPercent(analytics.attendance)}</strong><small>{analytics.marked ? `По ${formatCount(analytics.marked, ["заполненной отметке", "заполненным отметкам", "заполненным отметкам"])}` : "За период нет отметок посещаемости"}</small></article>
      <article><span>Средний балл</span><strong>{formatDashboardValue(analytics.averageGrade, 2)}</strong><small>{analytics.gradesCount ? `По ${formatCount(analytics.gradesCount, ["оценке", "оценкам", "оценкам"])} · практики и лабораторные` : "За практики и лабораторные оценок нет"}</small></article>
      <article className={styles.riskMetric}><span>Требуют внимания</span><strong>{analytics.risks.length}</strong><small>По отметкам и просроченным работам</small></article>
    </section>
    <details className={styles.methodology}><summary>Как считаются показатели</summary><p>Посещаемость — доля присутствий среди заполненных отметок проведённых занятий. Уважительная причина и пропуск входят в знаменатель; «не отмечено» — нет. Средний балл и распределение учитывают только выставленные оценки 5, 4, 3 и 2 за проведённые практики и лабораторные за период. Лекции и занятия без оценки не учитываются и не заменяются нулём. Один студент одной группы учитывается в численности один раз, даже если изучает несколько дисциплин.</p><p>Задания отбираются по дате занятия, без черновиков и архива. Ожидаемые ответы считаются по текущему составу группы. Внимание: посещаемость ниже 65% при наличии хотя бы трёх отметок, средний балл ниже 3 при двух оценках или две работы к сдаче после срока. Это сигналы для преподавателя, не официальный статус студента.</p></details>

    <div className={styles.middleGrid}>
      <section className={`${styles.chartCard} ${styles.riskCard}`}><header><div><span>Контроль</span><h2>Требуют внимания</h2></div>{analytics.risks.length > 4 && <button type="button" aria-expanded={showAllRisks} onClick={() => updateFilters({ risks: showAllRisks ? null : "all" })}>{showAllRisks ? "Свернуть" : `Все ${analytics.risks.length}`}</button>}</header>
        <div className={styles.riskList}>{analytics.risks.slice(0, showAllRisks ? analytics.risks.length : 4).map((student) => <div key={student.key}><span>{student.initials}</span><p><strong><ProfileLink to={`/students/${encodeURIComponent(student.id)}?groupId=${encodeURIComponent(student.groupId)}`} title="Открыть профиль студента">{student.name}</ProfileLink> <em><Link to={getJournalHrefById(student.subjectId, student.groupId)} title="Открыть журнал группы">{student.groupName}</Link></em></strong><small>{student.reasons.join(" · ")}</small></p><b className={student.level === "Средний" ? styles.medium : ""}>{student.level}</b></div>)}{!analytics.risks.length && <p className={styles.emptyRisk}>По доступным данным за этот период сигналов риска нет.</p>}</div>
      </section>
      <section className={`${styles.chartCard} ${styles.workCard}`}><header><div><span>Учебная активность</span><h2>Выполнение работ</h2></div><strong>{formatPercent(completion)}</strong></header>
        <p className={styles.chartHint}>{analytics.work.received} из {analytics.work.expected} ожидаемых ответов · заданий: {analytics.work.assignments}</p>
        <div className={styles.workProgress} role="progressbar" aria-label="Получено ответов" aria-valuemin={0} aria-valuemax={Math.max(analytics.work.expected, 1)} aria-valuenow={analytics.work.received}><i style={{ width: `${completion ?? 0}%` }} /></div>
        <div className={styles.workStats}><div><span>Первый ответ вовремя</span><strong>{analytics.work.onTime}</strong></div><div><span>На проверке</span><strong>{analytics.work.waiting}</strong></div><div><span>Без ответа после срока</span><strong>{analytics.work.overdue}</strong></div><div><span>На доработке</span><strong>{analytics.work.revision}</strong></div><div><span>Проверено</span><strong>{analytics.work.graded}</strong></div><Link to={subjectId !== "all" && groupId !== "all" ? `${getJournalHrefById(subjectId, groupId)}?tab=assignments` : "/journal"}><strong>Задания →</strong><span>{subjectId !== "all" && groupId !== "all" ? "Открыть задания группы" : "Выбрать журнал группы"}</span></Link></div>
      </section>
    </div>

    <div className={styles.mainGrid}>
      <section className={styles.chartCard}>
        <header><div><span>Оценки · выбор фильтра</span><h2>Распределение результатов</h2></div><strong className={styles.sampleCount}>{gradeContext.gradesCount}</strong></header>
        {gradeContext.gradesCount ? <><div className={styles.gradeChart}>
          <div className={styles.donutWrap}><svg className={`${styles.donut} ${selected !== null ? styles.filteredDonut : ""}`} viewBox="0 0 110 110" role="group" aria-label="Распределение оценок журнала">
            {GRADE_SEGMENTS.map((segment, index) => {
              if (!gradeContext.distribution[index]) return null;
              const start = gradeContext.distribution.slice(0, index).reduce((sum, count) => sum + count, 0) / gradeContext.gradesCount * 360;
              const end = start + gradeContext.distribution[index] / gradeContext.gradesCount * 360;
              const toggle = () => { setSelectedGrade(selected === index ? null : index); setExportMessage(""); };
              return <g key={segment.grade} ref={(node) => { segmentRefs.current[index] = node; }} className={styles.segmentGroup} style={{ color: segment.color }} role="button" tabIndex={0} aria-pressed={selected === index} onClick={toggle} onKeyDown={(event) => moveSegment(event, index)} aria-label={`Оценка ${segment.grade}, ${segment.label}: ${gradeContext.distribution[index]}, ${gradeShare(index)}. ${selected === index ? "Снять фильтр" : "Фильтровать данные"}`}><path className={styles.hitSegment} d={donutSegmentPath(start, end, false)} /><path className={`${styles.donutSegment} ${selected === index ? styles.selectedSegment : ""}`} d={donutSegmentPath(start, end, selected === index)} fill={selected === index ? segment.color : "none"} stroke={segment.color} /></g>;
            })}
          </svg><div className={styles.donutValue}><strong>{selected === null ? "100%" : gradeShare(selected)}</strong><span>{selected === null ? "Все оценки" : `${formatCount(gradeContext.distribution[selected], ["оценка", "оценки", "оценок"])} «${GRADE_SEGMENTS[selected].grade}»`}</span></div></div>
          <div className={styles.legend}>{GRADE_SEGMENTS.map((segment, index) => <button type="button" disabled={!gradeContext.distribution[index] && selected !== index} aria-pressed={selected === index} className={selected === index ? styles.activeLegend : ""} onClick={() => { setSelectedGrade(selected === index ? null : index); setExportMessage(""); }} key={segment.grade}><i style={{ background: segment.color }} /><span>{segment.grade} · {segment.label}<small>{formatCount(gradeContext.distribution[index], ["оценка", "оценки", "оценок"])}</small></span><strong>{gradeShare(index)}</strong></button>)}</div>
        </div><details className={styles.chartDetails}><summary>Как работает фильтр оценки</summary><p>Оценка на диаграмме фильтрует показатели, работы и риски по студентам. Повторный клик снимает фильтр. Круг сохраняет все оценки периода.</p></details></> : <div className={styles.chartEmpty}><strong>Пока нет оценок за практики и лабораторные</strong><p>Выберите другой период или внесите оценки в журнал. Лекции и занятия без оценки в график не входят.</p><Link to="/journal">Открыть журнал →</Link></div>}
      </section>
      <section className={`${styles.chartCard} ${styles.trendCard}`}><header><div><span>Обзор периода · выбор недели</span><h2>Посещаемость по неделям</h2></div><div className={styles.trendValue}><strong>{formatPercent(activeTrend?.value ?? null)}</strong><small>{activeTrend ? `${drillWeek === activeTrend.date ? "Выбрано: " : "Последняя: "}${formatWeek(weekRange(activeTrend.date, baseRange))}` : "Нет отметок"}</small></div></header>
        {trend.length ? <><LineChart data={trend.map((point) => Math.round(point.value * 10) / 10)} labels={trend.map((point) => formatWeek(weekRange(point.date, baseRange)))} length={trend.length} height={260} selectedIndex={trend.findIndex((point) => point.date === drillWeek)} onPointSelect={(index) => { setDrillWeek(drillWeek === trend[index].date ? null : trend[index].date); setExportMessage(""); }} /><details className={styles.chartDetails}><summary>Как работает выбор недели</summary><p>Нажмите на точку недели: показатели и CSV будут отобраны за её даты. Для переключения график сохраняет полный период и всех студентов выбранных групп, независимо от фильтра оценки. Повторный клик снимает фильтр недели.</p></details></> : <div className={styles.chartEmpty}><strong>Нет данных для динамики</strong><p>За выбранный период нет заполненных отметок проведённых занятий.</p></div>}
      </section>
    </div>

    <div className={styles.lowerGrid}>
      <section className={styles.chartCard}><header><div><span>Сравнение журналов</span><h2>Посещаемость</h2></div><SortControls value={attendanceSort} onChange={(value) => updateFilters({ attendanceSort: value })} /></header>{attendanceGroups.length ? <div className={styles.groupBars}>{attendanceGroups.map((group) => <Link className={styles.groupBar} to={getJournalHrefById(group.subjectId, group.groupId)} key={group.id} title={`${group.subjectName} · открыть журнал`}><span>{group.groupName}<small>{group.subjectShortName}</small></span><div><i style={{ width: `${group.attendance ?? 0}%` }} /></div><strong>{formatPercent(group.attendance)}</strong></Link>)}</div> : <p className={styles.chartHint}>Нет журналов для сравнения с выбранными фильтрами. Измените период или снимите фильтр оценки.</p>}<p className={styles.chartHint}>Процент считается по заполненным отметкам, а не средним из процентов групп. «—» означает, что отметок нет, а не нулевую посещаемость.</p></section>
      <section className={styles.chartCard}><header><div><span>Сравнение журналов</span><h2>Средний балл</h2></div><SortControls value={gradeSort} onChange={(value) => updateFilters({ gradeSort: value })} /></header>{gradeGroups.length ? <div className={styles.groupBars}>{gradeGroups.map((group) => <Link className={styles.groupBar} to={getJournalHrefById(group.subjectId, group.groupId)} key={group.id} title={`${group.subjectName} · открыть журнал`}><span>{group.groupName}<small>{group.subjectShortName}</small></span><div><i style={{ width: `${group.average / 5 * 100}%` }} /></div><strong>{formatDashboardValue(group.average, 2)}</strong></Link>)}</div> : <p className={styles.chartHint}>Нет оценок за практики и лабораторные для сравнения.</p>}<p className={styles.chartHint}>Только практики и лабораторные; журналы без оценок не отображаются. Нажмите на строку, чтобы открыть журнал.</p></section>
    </div>
  </div>;
};

export default TeacherStatistics;
