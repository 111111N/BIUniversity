import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { Submission } from "../../../data/assignmentStore";
import type { Student } from "../../Attendance/data/students";
import { getCurrentSubmissionAttempt, getSubmissionStatus } from "../../../domain/assignments";
import { getNextReviewSubmission, getReviewSubmissions, type ReviewDraft, type ReviewFilter, type ReviewSort } from "../../../domain/submissionReview";
import ArrowCircle from "../../ArrowCircle";
import Dropdown from "../../Dropdown";
import SearchField from "../../SearchField";
import SubmissionCard from "../SubmissionCard";
import styles from "./index.module.scss";

interface Props {
  answers: Submission[];
  students: Student[];
  rosterError: string;
  currentId: string | null;
  targetRef: RefObject<HTMLDivElement | null>;
  saving: boolean;
  drafts: Record<string, ReviewDraft>;
  onDraftChange(attemptId: string, values: Partial<ReviewDraft>): void;
  onSelect(id: string): void;
  onReview(answer: Submission, status: "revision" | "graded", comment: string, grade: string): boolean;
}

const FILTERS = [["all", "Все"], ["submitted", "Ждут проверки"], ["revision", "На доработке"], ["graded", "Проверено"]] as const;

const SubmissionWorkspace = ({ answers, students, rosterError, currentId, targetRef, saving, drafts, onDraftChange, onSelect, onReview }: Props) => {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ReviewSort>("queue");
  const [missingOpen, setMissingOpen] = useState(false);
  const [reviewNotice, setReviewNotice] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(currentId);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const toggleAnchor = useRef<{ button: HTMLButtonElement; top: number } | null>(null);
  const filtered = getReviewSubmissions(answers, filter, query, sort);
  const queue = getReviewSubmissions(answers, "submitted", query, sort);
  const matching = getReviewSubmissions(answers, "all", query);
  const missing = students.filter((student) => !answers.some((answer) => answer.studentId === student.id));
  const considered = matching.filter((answer) => getSubmissionStatus(answer) !== "submitted").length;
  const queuePosition = queue.findIndex((answer) => answer.id === expandedId);
  const selectedHidden = expandedId && answers.some((answer) => answer.id === expandedId) && !filtered.some((answer) => answer.id === expandedId);
  const expandedVisible = filtered.some((answer) => answer.id === expandedId);
  useEffect(() => { setExpandedId(currentId); }, [currentId]);
  useLayoutEffect(() => {
    const anchor = toggleAnchor.current;
    toggleAnchor.current = null;
    if (!anchor?.button.isConnected) return;
    // Closing a preceding answer must not move the clicked heading in the viewport.
    const shift = anchor.button.getBoundingClientRect().top - anchor.top;
    if (Math.abs(shift) > .5) window.scrollBy({ top: shift, behavior: "auto" });
  }, [expandedId]);
  const resetFilters = () => { setQuery(""); setFilter("all"); };
  const selectAnswer = (id: string) => {
    setExpandedId(id);
    onSelect(id);
    requestAnimationFrame(() => {
      targetRef.current?.focus({ preventScroll: true });
      targetRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    });
  };
  const toggleAnswer = (id: string, button: HTMLButtonElement) => {
    toggleAnchor.current = { button, top: button.getBoundingClientRect().top };
    setExpandedId((current) => current === id ? null : id);
  };
  const showHiddenAnswer = () => {
    resetFilters();
    requestAnimationFrame(() => {
      const target = Array.from(listRef.current?.querySelectorAll<HTMLDivElement>("[data-submission-id]") ?? []).find((node) => node.dataset.submissionId === expandedId);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", behavior: "auto" });
    });
  };
  const selectNext = () => {
    const next = getNextReviewSubmission(answers, expandedId, query, sort) ?? queue[0];
    if (!next) return;
    setReviewNotice("");
    setFilter("submitted");
    selectAnswer(next.id);
  };
  const review = (answer: Submission, status: "revision" | "graded", advance = false) => {
    const key = getCurrentSubmissionAttempt(answer)?.id ?? answer.id;
    const draft = drafts[key] ?? { comment: "", grade: "" };
    const next = getNextReviewSubmission(answers, answer.id, query, sort);
    if (!onReview(answer, status, draft.comment, draft.grade)) return;
    const result = status === "graded" ? `оценка ${draft.grade} сохранена` : "работа возвращена на доработку";
    const nextNotice = !advance ? "" : next ? ` Далее — ${next.studentName}.` : query.trim() ? " Очередь по текущему поиску завершена." : " Очередь проверки завершена.";
    setReviewNotice(`${answer.studentName}: ${result}.${nextNotice}`);
    if (advance) {
      setFilter(next ? "submitted" : "all");
      selectAnswer(next?.id ?? answer.id);
      if (!next) requestAnimationFrame(() => targetRef.current?.focus({ preventScroll: true }));
    }
  };

  return <section className={styles.workspace} aria-label="Работы студентов">
    <div className={styles.controlPanel}>
    <header className={styles.header}><div><h3>Работы студентов</h3><p>Ответы, история сдачи и обратная связь</p></div><span className={styles.total}>Всего ответов <b>{answers.length}</b></span></header>
    {answers.length > 0 && <>
      <div className={styles.tools}><SearchField label="Поиск по студентам" placeholder="Имя или фамилия" value={query} onChange={setQuery} /><Dropdown label="Порядок работ" value={sort} onChange={(value) => setSort(value as ReviewSort)} options={[{ value: "queue", label: "Сначала на проверку" }, { value: "newest", label: "Сначала новые" }, { value: "oldest", label: "Сначала ранние" }, { value: "name", label: "По имени" }]} /></div>
      <div className={styles.filters} role="group" aria-label="Статусы ответов">{FILTERS.map(([value, label]) => <button type="button" className={filter === value ? styles.activeFilter : ""} aria-pressed={filter === value} key={value} onClick={() => setFilter(value)}><span>{label}</span><b>{getReviewSubmissions(answers, value, query).length}</b></button>)}<span className={styles.matchCount} role="status">Показано {filtered.length} из {answers.length}</span></div>
      <div className={styles.queue}>
        <div className={styles.queueHeading}><span>{query.trim() ? "По текущему поиску" : "Очередь проверки"}</span><strong>{queue.length ? `Ожидают проверки: ${queue.length}` : matching.length ? "Новых работ для проверки нет" : "Нет ответов по этому поиску"}</strong>{queuePosition >= 0 && <small>Открыта работа {queuePosition + 1} из {queue.length}</small>}</div>
        {matching.length > 0 && <div className={styles.progress}><div><span>Рассмотрено</span><b>{considered} / {matching.length}</b></div><progress max={matching.length} value={considered} aria-label="Оценены или возвращены на доработку" /></div>}
        {queue.length > 0 && <button type="button" disabled={saving} className={styles.nextButton} onClick={selectNext}>{queuePosition < 0 ? "Начать проверку" : queue.length > 1 ? "Следующий ответ" : "Открыть ответ"}<ArrowCircle /></button>}
      </div>
    </>}
    </div>
    {reviewNotice && <div className={styles.reviewNotice}><span role="status">{reviewNotice}</span><button type="button" onClick={() => setReviewNotice("")} aria-label="Скрыть сообщение о проверке">Понятно</button></div>}
    {selectedHidden && <div className={styles.hiddenTarget} role="status"><span>Открытый ответ скрыт текущими фильтрами.</span><button type="button" onClick={showHiddenAnswer}>Показать выбранный ответ</button></div>}
    <section className={styles.answers} aria-label="Список ответов студентов">
    {filtered.length > 0 && <div className={styles.listHeading}><div><h4>Ответы студентов</h4><span>{filter === "all" ? "Все статусы" : FILTERS.find(([value]) => value === filter)?.[1]} · {filtered.length} · Нажмите на студента, чтобы открыть ответ</span></div>{expandedVisible && <button type="button" disabled={saving} aria-controls={listId} onClick={() => setExpandedId(null)}>Свернуть ответ</button>}</div>}
    <div id={listId} ref={listRef} className={styles.list}>{filtered.length ? filtered.map((answer) => {
      const key = getCurrentSubmissionAttempt(answer)?.id ?? answer.id;
      const draft = drafts[key] ?? { comment: "", grade: "" };
      const updateDraft = (values: Partial<ReviewDraft>) => onDraftChange(key, values);
      const next = getNextReviewSubmission(answers, answer.id, query, sort);
      return <SubmissionCard key={answer.id} submission={answer} selected={expandedId === answer.id} expanded={expandedId === answer.id} onToggle={(button) => toggleAnswer(answer.id, button)} targetRef={currentId === answer.id ? targetRef : undefined} comment={draft.comment} grade={draft.grade} saving={saving} onCommentChange={(comment) => updateDraft({ comment })} onGradeChange={(grade) => updateDraft({ grade })} onReview={(status) => review(answer, status)} onReviewNext={() => review(answer, "graded", true)} hasNext={Boolean(next)} />;
    }) : <div className={styles.empty}><strong>{!answers.length ? "Ответов пока нет" : query.trim() ? "Ответы не найдены" : "В этой категории работ нет"}</strong><span>{!answers.length ? "Когда студенты отправят ответы, они появятся здесь." : query.trim() ? "Проверьте имя или фамилию либо сбросьте фильтры." : "Выберите другой статус, чтобы посмотреть работы."}</span>{answers.length > 0 && <button type="button" onClick={resetFilters}>Сбросить фильтры</button>}</div>}</div>
    </section>
    {rosterError ? <p className={styles.error} role="alert">Не удалось прочитать состав группы. Список несдавших временно недоступен.</p> : <details className={styles.missing} onToggle={(event) => setMissingOpen(event.currentTarget.open)}><summary><span>Ещё не сдали</span><b>{missing.length}</b><ArrowCircle direction={missingOpen ? "up" : "down"} /></summary><div>{missing.map((student) => <span key={student.id}>{student.name}</span>)}{!missing.length && <span>Все студенты из журнала отправили ответы.</span>}</div></details>}
  </section>;
};

export default SubmissionWorkspace;
