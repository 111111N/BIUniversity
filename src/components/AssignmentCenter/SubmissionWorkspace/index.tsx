import ProfileLink from "../../ProfileLink";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { Submission } from "../../../data/assignmentStore";
import type { Student } from "../../Attendance/data/students";
import { getCurrentSubmissionAttempt, getSubmissionStatus } from "../../../domain/assignments";
import { getNextReviewSubmission, getReviewSubmissions, type ReviewDraft, type ReviewFilter, type ReviewSort } from "../../../domain/submissionReview";
import { matchesSearchText } from "../../../domain/search";
import SubmissionCard from "../SubmissionCard";
import AssignmentIcon from "../AssignmentIcon";
import styles from "./index.module.scss";

interface Props {
  answers: Submission[];
  students: Student[];
  groupId?: string;
  rosterError: string;
  currentId: string | null;
  targetRef: RefObject<HTMLDivElement | null>;
  saving: boolean;
  drafts: Record<string, ReviewDraft>;
  initialFilter?: ReviewFilter;
  onDraftChange(attemptId: string, values: Partial<ReviewDraft>): void;
  onSelect(id: string): void;
  onReview(answer: Submission, status: "revision" | "graded", comment: string, grade: string): boolean;
}

const FILTERS = [["submitted", "На проверке"], ["revision", "На доработке"], ["graded", "Проверены"], ["all", "Все"]] as const;
const STATUS_LABELS = { submitted: "На проверке", revision: "На доработке", graded: "Проверена" };
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "Дата не указана";
};

const SubmissionWorkspace = ({ answers, students, groupId, rosterError, currentId, targetRef, saving, drafts, initialFilter = "all", onDraftChange, onSelect, onReview }: Props) => {
  const [filter, setFilter] = useState<ReviewFilter | "missing">(initialFilter);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReviewSort>("queue");
  const [selectedId, setSelectedId] = useState<string | null>(() => currentId ?? getReviewSubmissions(answers, "submitted")[0]?.id ?? getReviewSubmissions(answers)[0]?.id ?? null);
  const [answerOpen, setAnswerOpen] = useState(Boolean(currentId));
  const [reviewNotice, setReviewNotice] = useState("");
  const [saveError, setSaveError] = useState("");
  const searchId = useId();
  const orderId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const matching = getReviewSubmissions(answers, "all", query, sort);
  const queue = getReviewSubmissions(answers, "submitted", query, sort);
  const filtered = filter === "missing" ? [] : matching.filter((answer) => filter === "all" || getSubmissionStatus(answer) === filter);
  const submittedStudents = new Set(answers.map((answer) => answer.studentId));
  const missing = rosterError ? [] : students.filter((student) => !submittedStudents.has(student.id) && matchesSearchText(student.name, query));
  const counts = { all: matching.length, submitted: 0, revision: 0, graded: 0 };
  matching.forEach((answer) => { counts[getSubmissionStatus(answer) ?? "submitted"] += 1; });
  const considered = counts.graded + counts.revision;
  // Selection is independent of the list filter so links and saved work stay visible.
  const selected = answers.find((answer) => answer.id === selectedId) ?? queue[0] ?? filtered[0] ?? answers[0];
  const selectedHidden = selected && filter !== "missing" && !filtered.some((answer) => answer.id === selected.id);
  const key = selected ? getCurrentSubmissionAttempt(selected)?.id ?? selected.id : "";
  const draft = drafts[key] ?? { comment: "", grade: "" };

  useEffect(() => {
    if (!currentId) return;
    setSelectedId(currentId);
    setAnswerOpen(true);
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 850px)").matches) detailRef.current?.scrollIntoView({ block: "start" });
    });
  }, [currentId]);
  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selectedId, selected]);

  const focusAnswer = () => requestAnimationFrame(() => {
    targetRef.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 850px)").matches) detailRef.current?.scrollIntoView({ block: "start" });
  });
  const selectAnswer = (id: string) => {
    setSelectedId(id);
    setAnswerOpen(true);
    setSaveError("");
    onSelect(id);
    focusAnswer();
  };
  const returnToList = () => {
    setAnswerOpen(false);
    requestAnimationFrame(() => {
      listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus({ preventScroll: true });
      if (window.matchMedia("(max-width: 850px)").matches) listRef.current?.scrollIntoView({ block: "start" });
    });
  };
  const review = (answer: Submission, status: "revision" | "graded", advance = false) => {
    const attemptId = getCurrentSubmissionAttempt(answer)?.id ?? answer.id;
    const values = drafts[attemptId] ?? { comment: "", grade: "" };
    const next = getNextReviewSubmission(answers, answer.id, query, sort);
    setSelectedId(answer.id);
    setSaveError("");
    try {
      if (!onReview(answer, status, values.comment, values.grade)) {
        setSaveError("Решение не сохранено. Проверьте сообщение об ошибке и попробуйте ещё раз.");
        return;
      }
      const result = status === "graded" ? `Оценка ${values.grade} сохранена.` : "Работа возвращена на доработку.";
      const completion = advance && !next ? query.trim() ? " Очередь по текущему поиску завершена." : " Очередь проверки завершена." : "";
      setReviewNotice(`${answer.studentName}: ${result}${completion}`);
      if (advance && next) selectAnswer(next.id);
      else focusAnswer();
    } catch (error) {
      console.error("Не удалось сохранить решение по работе студента", error);
      setSaveError("Не удалось сохранить решение. Ваш комментарий и оценка сохранены в черновике.");
    }
  };

  return <section className={`${styles.workspace} ${answerOpen && filter !== "missing" ? styles.answerOpen : ""}`} aria-label="Работы студентов">
    <header className={styles.header}>
      <h3>Работы студентов</h3>
      {answers.length > 0 && <div className={styles.summary}>
        <span>{queue.length ? `На проверке: ${queue.length}` : "Новых работ для проверки нет"}</span>
        {matching.length > 0 && <span className={styles.progress}><span>Рассмотрено {considered} / {matching.length}</span><progress max={matching.length} value={considered} aria-label="Оценены или возвращены на доработку" /></span>}
      </div>}
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Выбор студента">
        <div className={styles.search}><label htmlFor={searchId}>Поиск по студентам</label><input id={searchId} type="search" placeholder="Имя или фамилия" value={query} disabled={saving} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className={styles.filters} role="group" aria-label="Статусы ответов">
          {FILTERS.map(([value, label]) => <button type="button" key={value} disabled={saving} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{counts[value]}</span></button>)}
          <button type="button" disabled={saving} aria-pressed={filter === "missing"} onClick={() => setFilter("missing")}>Не сдали<span>{rosterError ? "—" : missing.length}</span></button>
        </div>
        {rosterError && filter !== "missing" && <p role="alert" className={styles.error}>Список несдавших временно недоступен: не удалось прочитать состав группы.</p>}
        {filter !== "missing" && <div className={styles.order}><label htmlFor={orderId}>Порядок работ</label><select id={orderId} value={sort} disabled={saving} onChange={(event) => setSort(event.target.value as ReviewSort)}><option value="queue">Сначала на проверку</option><option value="newest">Сначала новые</option><option value="oldest">Сначала ранние</option><option value="name">По имени</option></select></div>}
        <div className={styles.list} ref={listRef}>
          {filter === "missing" ? rosterError ? <p role="alert" className={styles.error}>Не удалось прочитать состав группы. Список несдавших временно недоступен.</p> : <><h4>Не сдали · {missing.length}</h4>{missing.length ? <ul className={styles.missing}>{missing.map((student) => {
            const search = new URLSearchParams({ name: student.name, ...(groupId ? { groupId } : {}) });
            return <li key={student.id}><ProfileLink className={styles.studentLink} to={`/students/${encodeURIComponent(student.id)}?${search}`} aria-label={`Открыть профиль: ${student.name}`}><span className={styles.avatar} aria-hidden="true">{student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span><span className={styles.studentBody}><strong>{student.name}</strong><span className={styles.rowMeta}>Открыть профиль</span></span><AssignmentIcon name="arrowRight" size={16} /></ProfileLink></li>;
          })}</ul> : <p className={styles.empty}>{query.trim() ? "Несдавшие по этому поиску не найдены." : "Все студенты из журнала отправили ответы."}</p>}</> : filtered.length ? <ul className={styles.students}>{filtered.map((answer) => {
            const attempt = getCurrentSubmissionAttempt(answer);
            const status = getSubmissionStatus(answer) ?? "submitted";
            const values = drafts[attempt?.id ?? answer.id];
            return <li key={answer.id}><button type="button" disabled={saving} data-status={status} aria-current={selected?.id === answer.id ? "true" : undefined} onClick={() => selectAnswer(answer.id)}><span className={styles.avatar} aria-hidden="true">{answer.studentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span><span className={styles.studentBody}><strong>{answer.studentName}</strong><span className={styles.rowMeta}><span>{STATUS_LABELS[status]}{status === "graded" && attempt?.grade ? ` · ${attempt.grade}` : ""}</span><time dateTime={attempt?.sentAt ?? answer.sentAt}>{dateLabel(attempt?.sentAt ?? answer.sentAt)}</time></span>{status === "submitted" && (values?.comment.trim() || values?.grade) && <span className={styles.draftMark}>Есть черновик</span>}</span></button></li>;
          })}</ul> : <div className={styles.empty}><strong>{!answers.length ? "Ответов пока нет" : query.trim() ? "Ответы не найдены" : "В этой категории работ нет"}</strong><p>{!answers.length ? "Когда студенты отправят ответы, они появятся здесь." : "Измените поиск или выберите другой статус."}</p></div>}
        </div>
      </aside>
      <div className={styles.detail} ref={detailRef}>
        {filter !== "missing" && selected ? <>
          <button type="button" className={styles.back} onClick={returnToList}><AssignmentIcon name="arrowLeft" />К списку работ</button>
          {selectedHidden && <p className={styles.context}>Выбранная работа вне текущего списка. Поиск и фильтры сохранены.</p>}
          {reviewNotice && <p className={styles.notice} role="status">{reviewNotice}</p>}
          {saveError && <p className={styles.error} role="alert">{saveError}</p>}
          <SubmissionCard key={selected.id} submission={selected} selected expanded targetRef={targetRef} comment={draft.comment} grade={draft.grade} saving={saving} onCommentChange={(comment) => onDraftChange(key, { comment })} onGradeChange={(grade) => onDraftChange(key, { grade })} onReview={(status) => review(selected, status)} onReviewNext={() => review(selected, "graded", true)} hasNext={Boolean(getNextReviewSubmission(answers, selected.id, query, sort))} />
        </> : <p className={styles.placeholder}>{filter === "missing" ? "Выберите статус ответов, чтобы продолжить проверку." : "Здесь появится выбранный ответ студента."}</p>}
      </div>
    </div>
  </section>;
};

export default SubmissionWorkspace;
