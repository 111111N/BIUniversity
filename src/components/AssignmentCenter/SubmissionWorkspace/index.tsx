import ProfileLink from "../../ProfileLink";
import { useEffect, useId, useRef, useState, type RefObject } from "react";
import type { Submission } from "../../../data/assignmentStore";
import type { Student } from "../../Attendance/data/students";
import { getCurrentSubmissionAttempt, getSubmissionStatus } from "../../../domain/assignments";
import { getNextReviewSubmission, getReviewSubmissions, type ReviewDraft, type ReviewSort } from "../../../domain/submissionReview";
import type { SubmissionReviewView } from "../../../domain/submissionReviewNavigation";
import { matchesSearchText } from "../../../domain/search";
import SubmissionCard from "../SubmissionCard";
import AssignmentIcon from "../AssignmentIcon";
import { focusSubmissionDetail, getSubmissionFocusIntent, type SubmissionFocusState } from "./focus";
import styles from "./index.module.scss";

interface Props {
  answers: Submission[];
  students: Student[];
  groupId?: string;
  rosterError: string;
  currentId: string | null;
  targetRef: RefObject<HTMLDivElement | null>;
  saving: boolean;
  unavailableReason?: string;
  drafts: Record<string, ReviewDraft>;
  view: SubmissionReviewView;
  onViewChange(values: Partial<SubmissionReviewView>): void;
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

const SubmissionWorkspace = ({ answers, students, groupId, rosterError, currentId, targetRef, saving, unavailableReason, drafts, view, onViewChange, onDraftChange, onSelect, onReview }: Props) => {
  const { filter, query, sort, pane } = view;
  const [selectedId, setSelectedId] = useState<string | null>(() => currentId ?? getReviewSubmissions(answers, "submitted")[0]?.id ?? getReviewSubmissions(answers)[0]?.id ?? null);
  const answerOpen = pane === "answer";
  const missingMode = filter === "missing";
  const previousFocus = useRef<SubmissionFocusState | null>(null);
  const [reviewNotice, setReviewNotice] = useState("");
  const [saveFailure, setSaveFailure] = useState<{ submissionId: string; message: string } | null>(null);
  const searchId = useId();
  const orderId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const matching = getReviewSubmissions(answers, "all", query, sort);
  const queue = getReviewSubmissions(answers, "submitted", query, sort);
  const filtered = filter === "missing" ? [] : matching.filter((answer) => filter === "all" || getSubmissionStatus(answer) === filter);
  const submittedStudents = new Set(answers.map((answer) => answer.studentId));
  const missing = rosterError ? [] : students.filter((student) => !submittedStudents.has(student.id) && matchesSearchText(student.name, query));
  const counts = { all: matching.length, submitted: 0, revision: 0, graded: 0 };
  matching.forEach((answer) => { counts[getSubmissionStatus(answer) ?? "submitted"] += 1; });
  const totals = { submitted: 0, revision: 0, graded: 0 };
  answers.forEach((answer) => { totals[getSubmissionStatus(answer) ?? "submitted"] += 1; });
  const considered = totals.graded + totals.revision;
  const found = filter === "missing" ? missing.length : filtered.length;
  // Keep explicit selection outside filters; never substitute another student's work if it disappears.
  const requestedId = currentId ?? selectedId;
  const selected = requestedId !== null ? answers.find((answer) => answer.id === requestedId) : queue[0] ?? filtered[0] ?? answers[0];
  const unavailable = requestedId !== null && !selected;
  const saveError = saveFailure?.submissionId === selected?.id ? saveFailure?.message : "";
  const selectedHidden = selected && filter !== "missing" && !filtered.some((answer) => answer.id === selected.id);
  const key = selected ? getCurrentSubmissionAttempt(selected)?.id ?? selected.id : "";
  const draft = drafts[key] ?? { comment: "", grade: "" };

  useEffect(() => {
    const previous = previousFocus.current;
    const focusState = { currentId, answerOpen, unavailable, missingMode };
    const intent = getSubmissionFocusIntent(previous, focusState);
    previousFocus.current = focusState;
    if (currentId && currentId !== previous?.currentId) { setSelectedId(currentId); setSaveFailure(null); }
    if (!intent) return;
    const frame = requestAnimationFrame(() => {
      if (intent === "list") {
        const currentButton = listRef.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
        (currentButton ?? searchRef.current)?.focus();
        return;
      }
      focusSubmissionDetail(detailRef.current, targetRef.current, intent, window.matchMedia("(max-width: 850px)").matches);
    });
    return () => cancelAnimationFrame(frame);
  }, [currentId, answerOpen, targetRef, unavailable, missingMode]);
  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selectedId, selected]);

  const focusAnswer = () => requestAnimationFrame(() => {
    targetRef.current?.focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 850px)").matches) detailRef.current?.scrollIntoView({ block: "start" });
  });
  const selectAnswer = (id: string) => {
    setSelectedId(id);
    setSaveFailure(null);
    onSelect(id);
    if (id === currentId && answerOpen) focusAnswer();
  };
  const returnToList = () => {
    onViewChange({ pane: "list" });
  };
  const clearSearch = () => {
    if (saving) return;
    onViewChange({ query: "" });
    searchRef.current?.focus();
  };
  const changeDraft = (values: Partial<ReviewDraft>) => {
    if (!selected || saving || unavailableReason) return;
    onDraftChange(key, values);
    if (currentId !== selected.id) onSelect(selected.id);
  };
  const review = (answer: Submission, status: "revision" | "graded", advance = false) => {
    if (saving || unavailableReason) return;
    const attemptId = getCurrentSubmissionAttempt(answer)?.id ?? answer.id;
    const values = drafts[attemptId] ?? { comment: "", grade: "" };
    const next = getNextReviewSubmission(answers, answer.id, query, sort);
    setSelectedId(answer.id);
    setSaveFailure(null);
    try {
      if (!onReview(answer, status, values.comment, values.grade)) {
        setSaveFailure({ submissionId: answer.id, message: "Решение не сохранено. Проверьте сообщение об ошибке и попробуйте ещё раз." });
        return;
      }
      const result = status === "graded" ? `Оценка ${values.grade} сохранена.` : "Работа возвращена на доработку.";
      const completion = advance && !next ? query.trim() ? " Очередь по текущему поиску завершена." : " Очередь проверки завершена." : "";
      setReviewNotice(`${answer.studentName}: ${result}${completion}`);
      if (advance && next) selectAnswer(next.id);
      else focusAnswer();
    } catch (error) {
      console.error("Не удалось сохранить решение по работе студента", error);
      setSaveFailure({ submissionId: answer.id, message: "Не удалось сохранить решение. Ваш комментарий и оценка сохранены в черновике." });
    }
  };

  return <section className={`${styles.workspace} ${answerOpen && filter !== "missing" ? styles.answerOpen : ""}`} aria-label="Работы студентов">
    <header className={styles.header}>
      <h3>Работы студентов</h3>
      {answers.length > 0 && <div className={styles.summary}>
        <span>{totals.submitted ? `На проверке: ${totals.submitted}` : "Новых работ для проверки нет"}</span>
        <span className={styles.progress}><span>Рассмотрено {considered} / {answers.length}</span><progress max={answers.length} value={considered} aria-label="Оценены или возвращены на доработку во всём задании" /></span>
      </div>}
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar} aria-label="Выбор студента">
        <div className={styles.search}><label htmlFor={searchId}>Поиск по студентам</label><div className={styles.searchRow}><input ref={searchRef} id={searchId} type="search" value={query} disabled={saving} onChange={(event) => onViewChange({ query: event.target.value })} />{query && <button type="button" disabled={saving} onClick={clearSearch} aria-label="Очистить поиск по студентам">Очистить</button>}</div></div>
        <div className={styles.filters} role="group" aria-label="Статусы ответов">
          {FILTERS.map(([value, label]) => <button type="button" key={value} disabled={saving} aria-pressed={filter === value} onClick={() => onViewChange({ filter: value })}>{label}<span>{counts[value]}</span></button>)}
          <button type="button" disabled={saving} aria-pressed={filter === "missing"} onClick={() => onViewChange({ filter: "missing" })}>Не сдали<span>{rosterError ? "—" : missing.length}</span></button>
        </div>
        {rosterError && filter !== "missing" && <p role="alert" className={styles.error}>Список несдавших временно недоступен: не удалось прочитать состав группы.</p>}
        {filter !== "missing" && <div className={styles.order}><label htmlFor={orderId}>Порядок работ</label><select id={orderId} value={sort} disabled={saving} onChange={(event) => onViewChange({ sort: event.target.value as ReviewSort })}><option value="queue">Сначала на проверку</option><option value="newest">Сначала новые</option><option value="oldest">Сначала ранние</option><option value="name">По имени</option></select></div>}
        {query.trim() && !(filter === "missing" && rosterError) && <p className={styles.searchResult} role="status">Найдено в этом разделе: {found}</p>}
        <div className={styles.list} ref={listRef}>
          {filter === "missing" ? rosterError ? <p role="alert" className={styles.error}>Не удалось прочитать состав группы. Список несдавших временно недоступен.</p> : <><h4>Не сдали · {missing.length}</h4>{missing.length ? <ul className={styles.missing}>{missing.map((student) => {
            const search = new URLSearchParams({ name: student.name, ...(groupId ? { groupId } : {}) });
            return <li key={student.id}><ProfileLink className={styles.studentLink} to={`/students/${encodeURIComponent(student.id)}?${search}`} aria-label={`Открыть профиль: ${student.name}`}><span className={styles.avatar} aria-hidden="true">{student.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span><span className={styles.studentBody}><strong>{student.name}</strong><span className={styles.rowMeta}>Открыть профиль</span></span><AssignmentIcon name="arrowRight" size={16} /></ProfileLink></li>;
          })}</ul> : <p className={styles.empty}>{query.trim() ? "Несдавшие по этому поиску не найдены." : "Все студенты из журнала отправили ответы."}</p>}</> : filtered.length ? <ul className={styles.students}>{filtered.map((answer) => {
            const attempt = getCurrentSubmissionAttempt(answer);
            const status = getSubmissionStatus(answer) ?? "submitted";
            const values = drafts[attempt?.id ?? answer.id];
            return <li key={answer.id}><button type="button" disabled={saving} data-status={status} aria-current={selected?.id === answer.id ? "true" : undefined} onClick={() => selectAnswer(answer.id)}><span className={styles.avatar} aria-hidden="true">{answer.studentName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span><span className={styles.studentBody}><strong>{answer.studentName}</strong><span className={styles.rowMeta}><span>{STATUS_LABELS[status]}{status === "graded" && attempt?.grade ? ` · ${attempt.grade}` : ""}</span><time dateTime={attempt?.sentAt ?? answer.sentAt}>{dateLabel(attempt?.sentAt ?? answer.sentAt)}</time></span>{status === "submitted" && (values?.comment.trim() || values?.grade) && <span className={styles.draftMark}>Есть черновик</span>}</span></button></li>;
          })}</ul> : <div className={styles.empty}><strong>{!answers.length ? "Ответов пока нет" : query.trim() ? "Ответы не найдены" : "В этой категории работ нет"}</strong><p>{!answers.length ? "Когда студенты отправят ответы, они появятся здесь." : query.trim() ? "Измените или очистите поиск. Можно также выбрать другой статус." : "Другие работы доступны в соседних статусах."}</p>{filter !== "all" && matching.length > 0 && <button type="button" disabled={saving} className={styles.showAll} onClick={() => { if (!saving) onViewChange({ filter: "all" }); }}>Все статусы</button>}</div>}
        </div>
      </aside>
      <div className={styles.detail} ref={detailRef}>
        {filter !== "missing" && (selected || unavailable) ? <>
          {selected && <button type="button" className={styles.back} onClick={returnToList}><AssignmentIcon name="arrowLeft" />К списку работ</button>}
          {unavailable ? <div className={styles.unavailable} ref={targetRef} tabIndex={-1} role="status">
            <h4>Работа недоступна</h4>
            <p>Возможно, ответ удалён или ссылка относится к другому заданию. Выберите работу в списке студентов.</p>
            <button type="button" onClick={returnToList}>К доступным работам</button>
          </div> : selected && <>
          {selectedHidden && <p className={styles.context}>Выбранная работа вне текущего списка. Поиск и фильтры сохранены.</p>}
          {reviewNotice && <p className={styles.notice} role="status">{reviewNotice}</p>}
          {saveError && <p className={styles.error} role="alert">{saveError}</p>}
          <SubmissionCard key={selected.id} submission={selected} selected expanded targetRef={targetRef} comment={draft.comment} grade={draft.grade} saving={saving} unavailableReason={unavailableReason} onCommentChange={(comment) => changeDraft({ comment })} onGradeChange={(grade) => changeDraft({ grade })} onReview={(status) => review(selected, status)} onReviewNext={() => review(selected, "graded", true)} hasNext={Boolean(getNextReviewSubmission(answers, selected.id, query, sort))} />
          </>}
        </> : <p className={styles.placeholder}>{filter === "missing" ? "Выберите статус ответов, чтобы продолжить проверку." : "Здесь появится выбранный ответ студента."}</p>}
      </div>
    </div>
  </section>;
};

export default SubmissionWorkspace;
