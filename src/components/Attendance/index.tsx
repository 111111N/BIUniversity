import * as React from 'react';
import { useState, useMemo, useEffect, useCallback, useId, useRef } from 'react';
import { format, eachDayOfInterval, getDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import styles from './index.module.scss';
import {
  VisitMarkIcon,
  PlusIcon,
  MinusIcon,
  EditIcon,
  AcceptIcon,
  CloseIcon,
} from '../ButtonIcons/Icons';
import { Student, AttendanceStatus, Grade } from './data/students';
import { Link, useParams } from 'react-router-dom';
import type { AcademicLesson } from '../../domain/academic';
import { lessonTypeLabels } from '../../domain/academic';
import { countJournalDraftChanges, mergeJournalDraft } from '../../domain/journalDraft';
import useUnsavedChangesWarning from '../../hooks/useUnsavedChangesWarning';
import { changesJournalSection } from '../../domain/unsavedNavigation';
import useBodyScrollLock from '../../hooks/useBodyScrollLock';
import ConfirmDialog from '../ConfirmDialog';
import SearchField from '../SearchField';
import { matchesSearchText } from '../../domain/search';

// Константы
const START_DATE = new Date(2025, 9, 1);
const END_DATE = new Date(2025, 9, 30);

const STATUS_COLORS = {
  unmarked: { fill: 'transparent', color2: 'color-mix(in srgb, var(--ui-text-secondary) 65%, transparent)' },
  present: { fill: 'var(--color-visit)', color2: 'var(--color-visit)' },
  sick: { fill: 'var(--color-sick)', color2: 'var(--color-sick)' },
  absent: { fill: 'var(--color-no-visit)', color2: 'var(--ui-error)' },
};

const GRADE_COLORS: Record<Exclude<Grade, null>, string> = {
  5: 'var(--color-grade-5)',
  4: 'var(--color-grade-4)',
  3: 'var(--color-grade-3)',
  2: 'var(--color-grade-2)',
};

const GRADE_ORDER: Grade[] = [null, 5, 4, 3, 2];
const ATTENDANCE_ORDER: AttendanceStatus[] = ['unmarked', 'present', 'sick', 'absent'];

// Утилиты
const generateDates = (start: Date, end: Date): Date[] =>
  eachDayOfInterval({ start, end }).filter(d => getDay(d) !== 0);

const getDateKey = (date: Date) => format(date, 'yyyy-MM-dd');

const getNextValue = <T,>(current: T, order: T[]): T => {
  const currentIndex = order.indexOf(current);
  const nextIndex = (currentIndex + 1) % order.length;
  return order[nextIndex];
};

const getPrevValue = <T,>(current: T, order: T[]): T => {
  const currentIndex = order.indexOf(current);
  const prevIndex = (currentIndex - 1 + order.length) % order.length;
  return order[prevIndex];
};

const nextAttendance = (status: AttendanceStatus): AttendanceStatus =>
  getNextValue(status, ATTENDANCE_ORDER);

const prevAttendance = (status: AttendanceStatus): AttendanceStatus =>
  getPrevValue(status, ATTENDANCE_ORDER);

const nextGrade = (grade: Grade): Grade =>
  getNextValue(grade, GRADE_ORDER);

const prevGrade = (grade: Grade): Grade =>
  getPrevValue(grade, GRADE_ORDER);

// Компоненты
const MemoVisitMarkIcon = React.memo(VisitMarkIcon);

const GradeDot: React.FC<{ grade: Exclude<Grade, null> }> = ({ grade }) => (
  <span
    className={styles.gradeDot}
    style={{ backgroundColor: GRADE_COLORS[grade] }}
  />
);

interface TableCellProps {
  student: Student;
  date: Date;
  recordKey: string;
  gradeAllowed: boolean;
  rowIndex: number;
  colIndex: number;
  mode: 'attendance' | 'grades';
  hoveredCell: { row: number | null; col: number | null };
  activeCell: { row: number | null; col: number | null };
  isEditing: boolean;
  isTabStop: boolean;
  onCellFocus: (studentId: string, lessonId: string) => void;
  toggleAttendance: (id: string, key: string, direction: 'next' | 'prev') => void;
  toggleGrade: (id: string, key: string, direction: 'next' | 'prev') => void;
  setHoveredCell: React.Dispatch<React.SetStateAction<{ row: number | null; col: number | null }>>;
  setActiveCell: React.Dispatch<React.SetStateAction<{ row: number | null; col: number | null }>>;
}

const TableCellComponent: React.FC<TableCellProps> = React.memo(({
  student,
  date,
  recordKey,
  gradeAllowed,
  rowIndex,
  colIndex,
  mode,
  hoveredCell,
  activeCell,
  isEditing,
  isTabStop,
  onCellFocus,
  toggleAttendance,
  toggleGrade,
  setHoveredCell,
  setActiveCell,
}) => {
  const dateKey = recordKey;
  const isHovered = hoveredCell.row === rowIndex && hoveredCell.col === colIndex;
  const isActive = activeCell.row === rowIndex && activeCell.col === colIndex;
  const editButtonProps = {
    tabIndex: isTabStop ? 0 : -1,
    'data-journal-cell': true,
    'data-student': student.id,
    'data-lesson': recordKey,
    onFocus: () => onCellFocus(student.id, recordKey),
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.metaKey || !isEditing) return;
      event.preventDefault();
      event.stopPropagation();
      if (mode === 'attendance') toggleAttendance(student.id, recordKey, 'prev');
      else toggleGrade(student.id, recordKey, 'prev');
    },
  };

  const handleAction = useCallback(
    (direction: 'next' | 'prev') => (e: React.MouseEvent) => {
      if (!isEditing) return;

      if (direction === 'prev') {
        e.preventDefault();
      }

      if (mode === 'attendance') {
        toggleAttendance(student.id, dateKey, direction);
      } else {
        toggleGrade(student.id, dateKey, direction);
      }
    },
    [isEditing, mode, student.id, dateKey, toggleAttendance, toggleGrade]
  );

  const handleMouseEnter = useCallback(
    () => setHoveredCell({ row: rowIndex, col: colIndex }),
    [rowIndex, colIndex, setHoveredCell]
  );

  const handleMouseLeave = useCallback(
    () => {
      setHoveredCell({ row: null, col: null });
      setActiveCell({ row: null, col: null });
    },
    [setHoveredCell, setActiveCell]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing && (e.button === 0 || e.button === 2)) {
        setActiveCell({ row: rowIndex, col: colIndex });
      }
    },
    [isEditing, rowIndex, colIndex, setActiveCell]
  );

  const handleMouseUp = useCallback(
    () => setActiveCell({ row: null, col: null }),
    [setActiveCell]
  );

  const baseClass = mode === 'grades' ? styles.gradeCell : '';
  const highlightClass = (isHovered || isActive) ? styles.highlightCurrentCell : '';

  if (mode === 'attendance') {
    const status = student.attendance?.[dateKey] ?? 'unmarked';
    let fill = STATUS_COLORS[status].fill;
    let color2 = STATUS_COLORS[status].color2;

    if (isActive) {
      fill =
        status === 'present'
          ? 'var(--color-visit-active)'
          : status === 'sick'
          ? 'var(--color-sick-active)'
          : status === 'absent'
          ? 'var(--color-no-visit-active)'
          : 'transparent';
      color2 = status === 'absent' ? 'var(--ui-error)' : 'var(--color-border-active)';
    } else if (isHovered) {
      color2 = status === 'absent' ? 'var(--ui-error)' : 'var(--color-border-hover)';
    }

    const label = `${student.name}, ${format(date, 'd MMMM', { locale: ru })}: ${status === 'present' ? 'Присутствие' : status === 'sick' ? 'Болезнь' : status === 'absent' ? 'Пропуск' : 'Не отмечено'}`;
    const mark = <MemoVisitMarkIcon color="var(--color-border)" size={32} fill={fill} color2={color2} />;

    return (
      <td
        className={`${baseClass} ${highlightClass}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
        {isEditing ? <button {...editButtonProps} type="button" className={styles.markButton} aria-label={label} title={`${label}. Нажатие — следующая отметка, Shift+Enter или правая кнопка — предыдущая.`} onClick={handleAction('next')} onContextMenu={handleAction('prev')}>{mark}</button> : <span className={styles.mark} role="img" aria-label={label} title={label}>{mark}</span>}
      </td>
    );
  }

  // Режим оценок
  if (!gradeAllowed) return <td className={`${styles.gradeCell} ${styles.ungradedCell}`} aria-label={`${format(date, 'd MMMM', { locale: ru })}: оценка за лекцию не предусмотрена`}>—</td>;
  const grade = student.grades?.[dateKey] ?? null;
  const gradeLabel = `${student.name}, ${format(date, 'd MMMM', { locale: ru })}: ${grade === null ? 'Нет оценки' : `Оценка ${grade}`}`;
  const gradeContent = grade !== null ? <span className={styles.gradeCellContent}><GradeDot grade={grade} /><span className={styles.gradeValue}>{grade}</span></span> : <span className={styles.emptyGrade}>·</span>;

  return (
    <td
      className={`${baseClass} ${highlightClass}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
    >
      {isEditing ? <button {...editButtonProps} type="button" className={styles.markButton} aria-label={gradeLabel} title={`${gradeLabel}. Нажатие — следующая оценка, Shift+Enter или правая кнопка — предыдущая.`} onClick={handleAction('next')} onContextMenu={handleAction('prev')}>{gradeContent}</button> : <span className={styles.mark} role="img" aria-label={gradeLabel} title={gradeLabel}>{gradeContent}</span>}
    </td>
  );
}, (prev, next) => {
  // Кастомная проверка пропсов для оптимизации
  const studentChanged = prev.student !== next.student;
  const modeChanged = prev.mode !== next.mode;
  const editingChanged = prev.isEditing !== next.isEditing;
  const tabStopChanged = prev.isTabStop !== next.isTabStop;
  const coordsChanged = prev.rowIndex !== next.rowIndex || prev.colIndex !== next.colIndex;
  const recordChanged = prev.recordKey !== next.recordKey;
  const gradeRuleChanged = prev.gradeAllowed !== next.gradeAllowed;

  // Проверяем изменения hover/active только для этой ячейки
  const wasHovered = prev.hoveredCell.row === prev.rowIndex && prev.hoveredCell.col === prev.colIndex;
  const isHovered = next.hoveredCell.row === next.rowIndex && next.hoveredCell.col === next.colIndex;
  const hoverChanged = wasHovered !== isHovered;

  const wasActive = prev.activeCell.row === prev.rowIndex && prev.activeCell.col === prev.colIndex;
  const isActive = next.activeCell.row === next.rowIndex && next.activeCell.col === next.colIndex;
  const activeChanged = wasActive !== isActive;

  // Проверяем изменения данных студента
  const dateKey = prev.recordKey;
  const attendanceChanged = prev.student.attendance?.[dateKey] !== next.student.attendance?.[dateKey];
  const gradeChanged = prev.student.grades?.[dateKey] !== next.student.grades?.[dateKey];

  const shouldUpdate = studentChanged || modeChanged || editingChanged || tabStopChanged || coordsChanged || recordChanged || gradeRuleChanged ||
                      hoverChanged || activeChanged || attendanceChanged || gradeChanged;

  return !shouldUpdate;
});
TableCellComponent.displayName = 'TableCellComponent';

interface AttendanceTableProps {
  students: Student[];
  setStudents?: React.Dispatch<React.SetStateAction<Student[]>>;
  readOnly?: boolean;
  dates?: Date[];
  lessons?: AcademicLesson[];
}

export const AttendanceTable: React.FC<AttendanceTableProps> = ({ students, setStudents, readOnly = false, dates, lessons }) => {
  const { groupId } = useParams<{ groupId: string }>();
  // Мемоизированные значения
  const columns = useMemo(() => lessons ?? (dates ?? generateDates(START_DATE, END_DATE)).map((date) => ({ id: getDateKey(date), date: getDateKey(date) })), [dates, lessons]);
  const workDays = useMemo(() => columns.map((column) => new Date(`${column.date}T00:00:00`)), [columns]);
  const dateKeys = useMemo(() => columns.map((column) => column.id), [columns]);

  // Состояния
  const [hoveredCell, setHoveredCell] = useState({ row: null as number | null, col: null as number | null });
  const [activeCell, setActiveCell] = useState({ row: null as number | null, col: null as number | null });
  const [isEditing, setIsEditing] = useState(false);
  const [isRosterEditing, setIsRosterEditing] = useState(false);
  const [draftStudents, setDraftStudents] = useState<Student[]>(students);
  const [originalStudents, setOriginalStudents] = useState<Student[]>(students);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'attendance' | 'grades'>('attendance');
  const [editError, setEditError] = useState('');
  const [discardOpen, setDiscardOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [keyboardCell, setKeyboardCell] = useState<{ studentId: string; lessonId: string } | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const addedStudentRef = useRef<string | null>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const keyboardHintId = useId();
  const displayedStudents = isEditing ? draftStudents : students;
  const searching = Boolean(studentQuery.trim());
  const visibleRows = useMemo(() => displayedStudents
    .map((student, rowIndex) => ({ student, rowIndex }))
    .filter(({ student }) => matchesSearchText(student.name, studentQuery) || (isRosterEditing && student.id === editingNameId)),
  [displayedStudents, studentQuery, isRosterEditing, editingNameId]);
  const canReorder = isEditing && isRosterEditing && !searching;
  const editableColumns = useMemo(() => columns.filter((column) => mode === 'attendance' || !('type' in column) || (column as AcademicLesson).type !== 'lecture'), [columns, mode]);
  const keyboardStudentId = visibleRows.some(({ student }) => student.id === keyboardCell?.studentId) ? keyboardCell?.studentId : visibleRows[0]?.student.id;
  const keyboardLessonId = editableColumns.some((column) => column.id === keyboardCell?.lessonId) ? keyboardCell?.lessonId : editableColumns[0]?.id;
  const onCellFocus = useCallback((studentId: string, lessonId: string) => setKeyboardCell({ studentId, lessonId }), []);
  const changeCount = isEditing ? countJournalDraftChanges(originalStudents, draftStudents) : 0;
  const externalChanges = isEditing && countJournalDraftChanges(originalStudents, students) > 0;
  useUnsavedChangesWarning(isEditing && changeCount > 0, changesJournalSection);
  useBodyScrollLock(isEditing);

  // Эффекты
  useEffect(() => {
    if (!isEditing) return;
    const focusFrame = requestAnimationFrame(() => editorRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(focusFrame);
      requestAnimationFrame(() => editButtonRef.current?.focus({ preventScroll: true }));
    };
  }, [isEditing]);

  useEffect(() => {
    if (!addedStudentRef.current) return;
    const row = Array.from(editorRef.current?.querySelectorAll<HTMLTableRowElement>('[data-student-id]') ?? [])
      .find((element) => element.dataset.studentId === addedStudentRef.current);
    const input = row?.querySelector<HTMLInputElement>('input');
    if (!input) return;
    addedStudentRef.current = null;
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    input.focus({ preventScroll: true });
    input.select();
  }, [draftStudents, studentQuery]);

  const changeStudentQuery = (value: string) => {
    setStudentQuery(value);
    setEditingNameId(null);
    setKeyboardCell(null);
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
    setDragIndex(null);
    setDragOverIndex(null);
    if (tableWrapperRef.current) tableWrapperRef.current.scrollTop = 0;
  };

  // Обработчики
  const startEditing = useCallback(() => {
    if (readOnly || !setStudents) return;
    const normalized = students.map(student => {
      const attendance = { ...student.attendance };
      const grades = { ...student.grades };

      columns.forEach(column => {
        const key = column.id;
        if (!attendance[key]) attendance[key] = 'unmarked';
        if (grades[key] === undefined) grades[key] = null;
      });

      return {
        ...student,
        attendance,
        grades,
      };
    });

    const deepCopy = normalized.map(s => ({
      ...s,
      attendance: { ...s.attendance },
      grades: { ...s.grades },
    }));

    setOriginalStudents(deepCopy);
    setDraftStudents(deepCopy);
    setIsEditing(true);
    setEditError('');
    setDiscardOpen(false);
    setIsRosterEditing(false);
    setEditingNameId(null);
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
  }, [students, setStudents, columns, readOnly]);

  const acceptChanges = useCallback(() => {
    setEditError('');
    if (countJournalDraftChanges(originalStudents, draftStudents) > 0) {
      try { setStudents?.((latest) => mergeJournalDraft(originalStudents, draftStudents, latest)); }
      catch (error) { setEditError(error instanceof Error ? error.message : 'Не удалось сохранить журнал. Черновик оставлен открытым.'); return; }
    }
    setIsEditing(false);
    setIsRosterEditing(false);
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
  }, [originalStudents, draftStudents, setStudents]);

  const cancelChanges = useCallback(() => {
    setDraftStudents(originalStudents);
    setEditError('');
    setDiscardOpen(false);
    setIsEditing(false);
    setIsRosterEditing(false);
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
  }, [originalStudents]);

  const requestCancel = () => { if (changeCount) setDiscardOpen(true); else cancelChanges(); };
  const handleEditorKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditing || discardOpen || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (studentQuery && event.target instanceof HTMLInputElement && event.target.type === 'search') changeStudentQuery('');
      else requestCancel();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); acceptChanges(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')).filter((node) => node.tabIndex >= 0 && node.getClientRects().length > 0);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  const handleTableKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isEditing || event.defaultPrevented || event.altKey || event.shiftKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const button = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('button[data-journal-cell]') : null;
    if (!button) return;
    let row = visibleRows.findIndex(({ student }) => student.id === button.dataset.student);
    let col = editableColumns.findIndex((column) => column.id === button.dataset.lesson);
    if (row < 0 || col < 0) return;
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') {
      col = event.key === 'Home' ? 0 : editableColumns.length - 1;
      if (event.ctrlKey || event.metaKey) row = event.key === 'Home' ? 0 : visibleRows.length - 1;
    } else if (event.key === 'ArrowLeft') col = Math.max(0, col - 1);
    else if (event.key === 'ArrowRight') col = Math.min(editableColumns.length - 1, col + 1);
    else if (event.key === 'ArrowUp') row = Math.max(0, row - 1);
    else row = Math.min(visibleRows.length - 1, row + 1);
    const target = Array.from(tableWrapperRef.current?.querySelectorAll<HTMLButtonElement>('button[data-journal-cell]') ?? [])
      .find((element) => element.dataset.student === visibleRows[row].student.id && element.dataset.lesson === editableColumns[col].id);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  };

  const moveStudent = useCallback((from: number, to: number) => {
    setDraftStudents(prev => {
      const newStudents = [...prev];
      const [movedStudent] = newStudents.splice(from, 1);
      newStudents.splice(to, 0, movedStudent);
      return newStudents;
    });
  }, []);

  const addStudent = useCallback(() => {
    const newStudent: Student = {
      id: crypto.randomUUID(),
      name: 'Новый ученик',
      attendance: {},
      grades: {},
    };

    columns.forEach(column => {
      const key = column.id;
      newStudent.attendance[key] = 'unmarked';
      newStudent.grades[key] = null;
    });

    setDraftStudents(prev => [...prev, newStudent]);
    setStudentQuery('');
    addedStudentRef.current = newStudent.id;
  }, [columns]);

  const deleteStudent = useCallback((id: string) => {
    setDraftStudents(prev => prev.filter(student => student.id !== id));
  }, []);

  const toggleAttendance = useCallback((studentId: string, dateKey: string, direction: 'next' | 'prev') => {
    setDraftStudents(prev =>
      prev.map(student =>
        student.id !== studentId
          ? student
          : {
              ...student,
              attendance: {
                ...student.attendance,
                [dateKey]: direction === 'next'
                  ? nextAttendance(student.attendance?.[dateKey] ?? 'unmarked')
                  : prevAttendance(student.attendance?.[dateKey] ?? 'unmarked'),
              },
            }
      )
    );
  }, []);

  const toggleGrade = useCallback((studentId: string, dateKey: string, direction: 'next' | 'prev') => {
    setDraftStudents(prev =>
      prev.map(student =>
        student.id !== studentId
          ? student
          : {
              ...student,
              grades: {
                ...student.grades,
                [dateKey]: direction === 'next'
                  ? nextGrade(student.grades?.[dateKey] ?? null)
                  : prevGrade(student.grades?.[dateKey] ?? null),
              },
            }
      )
    );
  }, []);

  const updateStudentName = useCallback((studentId: string, name: string) => {
    setDraftStudents(prev =>
      prev.map(student =>
        student.id === studentId ? { ...student, name } : student
      )
    );
  }, []);

  // Мемоизированные вычисления
  const calcAverage = useCallback((student: Student) => {
    const grades = dateKeys
      .map(key => student.grades?.[key])
      .filter((grade): grade is Exclude<Grade, null> => grade != null);

    if (grades.length === 0) return '-';

    const sum = grades.reduce((total, grade) => total + grade, 0);
    return (sum / grades.length).toFixed(2);
  }, [dateKeys]);

  const calcPresence = useCallback((student: Student) => {
    const markedKeys = dateKeys.filter(key => (student.attendance?.[key] ?? 'unmarked') !== 'unmarked');
    const total = markedKeys.length;
    const present = markedKeys.filter(key => student.attendance?.[key] === 'present').length;

    if (total === 0) return '—';
    return `${((present / total) * 100).toFixed(1)}%`;
  }, [dateKeys]);

  // Обработчики drag & drop
  const handleDragStart = useCallback((index: number) => {
    if (canReorder) setDragIndex(index);
  }, [canReorder]);

  const handleDragEnter = useCallback((index: number) => {
    if (canReorder) setDragOverIndex(index);
  }, [canReorder]);

  const handleDragEnd = useCallback(() => {
    if (canReorder && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      moveStudent(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [canReorder, dragIndex, dragOverIndex, moveStudent]);

  // Рендер ячеек таблицы
  const renderTableCells = useCallback((student: Student, rowIndex: number) => {
    return columns.map((column, colIndex) => {
      const date = new Date(`${column.date}T00:00:00`);
      return (
      <TableCellComponent
        key={`${student.id}-${column.id}`}
        student={student}
        date={date}
        recordKey={column.id}
        gradeAllowed={!('type' in column) || (column as AcademicLesson).type !== 'lecture'}
        rowIndex={rowIndex}
        colIndex={colIndex}
        mode={mode}
        hoveredCell={hoveredCell}
        activeCell={activeCell}
        isEditing={isEditing}
        isTabStop={student.id === keyboardStudentId && column.id === keyboardLessonId}
        onCellFocus={onCellFocus}
        toggleAttendance={toggleAttendance}
        toggleGrade={toggleGrade}
        setHoveredCell={setHoveredCell}
        setActiveCell={setActiveCell}
      />
    );
    });
  }, [columns, mode, hoveredCell, activeCell, isEditing, keyboardStudentId, keyboardLessonId, onCellFocus, toggleAttendance, toggleGrade]);

  // Рендер строк таблицы
  const renderTableRows = useCallback(() => {
    return visibleRows.map(({ student, rowIndex }) => {
      const rowClasses = [
        hoveredCell.row === rowIndex ? styles.highlightRow : '',
        canReorder && dragOverIndex === rowIndex ? styles.dragOver : '',
        rowIndex % 2 === 1 ? styles.evenRow : '',
      ].filter(Boolean).join(' ');


      return (
        <tr
          key={student.id}
          data-student-id={student.id}
          draggable={canReorder}
          onDragStart={() => handleDragStart(rowIndex)}
          onDragEnter={() => handleDragEnter(rowIndex)}
          onDragEnd={handleDragEnd}
          onBlur={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setEditingNameId(null);
          }}
          className={rowClasses}
        >
          <td className={styles.studentColumn}>
            {isEditing && isRosterEditing ? (
              <div className={styles.editNameWrapper}>
                <input
                  value={student.name}
                  onChange={e => updateStudentName(student.id, e.target.value)}
                  onFocus={() => setEditingNameId(student.id)}
                  aria-label="Имя ученика"
                />
                <button
                  type="button"
                  className={styles.inlineDeleteBtn}
                  onClick={() => deleteStudent(student.id)}
                  aria-label="Удалить ученика"
                >
                  <MinusIcon size={20} />
                </button>
              </div>
            ) : readOnly || isEditing ? (
              <span title={student.name}>{student.name}</span>
            ) : (
              <Link
                className={styles.studentLink}
                to={`/students/${student.id}?name=${encodeURIComponent(student.name)}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""}`}
                title={`Открыть профиль: ${student.name}`}
              >
                {student.name}
              </Link>
            )}
          </td>

          {renderTableCells(student, rowIndex)}

          <td className={styles.percentageCell}>
            {mode === 'attendance' ? calcPresence(student) : calcAverage(student)}
          </td>
        </tr>
      );
    });
  }, [
    visibleRows,
    groupId,
    canReorder,
    readOnly,
    isEditing,
    isRosterEditing,
    hoveredCell.row,
    dragOverIndex,
    handleDragStart,
    handleDragEnter,
    handleDragEnd,
    updateStudentName,
    deleteStudent,
    renderTableCells,
    mode,
    calcPresence,
    calcAverage,
  ]);

  return (
    <div
      className={`${styles.attendanceTableContainer} ${isEditing ? styles.fullscreen : ''}`}
      ref={editorRef}
      role={isEditing ? 'dialog' : undefined}
      aria-modal={isEditing ? true : undefined}
      aria-labelledby={isEditing ? headingId : undefined}
      onKeyDown={handleEditorKeys}
    >
      <div className={styles.layoutWithControls}>
        <header className={styles.tableHeading}>
          <div><h2 id={headingId} className={styles.tableName}>{isEditing ? 'Редактирование журнала' : 'Журнал занятий'}</h2><p>{workDays[0] && format(workDays[0], 'LLLL yyyy', { locale: ru })} · Учеников: {(isEditing ? draftStudents : students).length} · Занятий: {columns.length}</p></div>
          <div className={styles.tableActions}>
            <div className={styles.modeSwitch} role="group" aria-label="Отображение журнала">
              <button type="button" onClick={() => setMode('attendance')} aria-pressed={mode === 'attendance'}>Посещаемость</button>
              <button type="button" onClick={() => setMode('grades')} aria-pressed={mode === 'grades'}>Оценки</button>
            </div>
            {!readOnly && !isEditing && setStudents && <button ref={editButtonRef} type="button" className={styles.editButton} onClick={startEditing}><EditIcon size={16} />Редактировать</button>}
            {readOnly && <span className={styles.viewBadge}>Только просмотр</span>}
            {isEditing && <span className={styles.draftBadge} role="status">{changeCount ? `Изменений: ${changeCount}` : 'Нет изменений'}</span>}
          </div>
        </header>
        {isEditing && <p id={keyboardHintId} className={styles.editHint}>В таблице: стрелки — переход, Home / End — края строки, Ctrl / ⌘ + Home / End — края таблицы. Нажатие, Enter или пробел — следующая отметка, Shift + Enter или правая кнопка мыши — предыдущая. Ctrl / ⌘ + Enter — сохранить, Esc — отменить.</p>}
        {isEditing && externalChanges && <p className={styles.externalNotice}>Журнал обновился в другом месте. Независимые правки будут объединены; при конфликте одной ячейки сохранение остановится.</p>}
        {isEditing && editError && <p className={styles.editError} role="alert">{editError}</p>}
        {(!readOnly || students.length > 1) && <div className={styles.studentSearch}>
          <SearchField label="Найти студента" value={studentQuery} onChange={changeStudentQuery} placeholder="Имя или фамилия" />
          <div className={styles.searchSummary}>
            <span role="status" aria-live="polite">{searching ? `Найдено: ${visibleRows.length} из ${displayedStudents.length}` : `В списке: ${displayedStudents.length}`}</span>
            {searching && <small>{isEditing ? 'Сохраняется весь журнал, включая скрытые строки.' : 'Поиск не меняет показатели и экспорт журнала.'}</small>}
            {searching && isRosterEditing && <small>Чтобы менять порядок строк, очистите поиск.</small>}
          </div>
        </div>}
        <div ref={tableWrapperRef} className={styles.tableWrapper} tabIndex={isEditing ? -1 : 0} role="region" aria-label="Таблица журнала, прокручивается по горизонтали и вертикали" aria-describedby={isEditing ? keyboardHintId : undefined} onKeyDown={handleTableKeys}>
          <table>
            <caption className={styles.visuallyHidden}>{mode === 'attendance' ? 'Посещаемость учеников по занятиям' : 'Оценки учеников по занятиям'}</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.studentName}>Ученик</th>
                {columns.map((column) => {
                  const date = new Date(`${column.date}T00:00:00`);
                  const lesson = 'type' in column ? column as AcademicLesson : null;
                  return <th scope="col" key={column.id} title={lesson ? `${lessonTypeLabels[lesson.type]} · ${lesson.topic} · ${lesson.startsAt}, ауд. ${lesson.room}` : format(date, 'EEEE, d MMMM', { locale: ru })}>
                    <span>{format(date, 'dd.MM')}</span><small>{lesson ? `${lesson.startsAt} · ${lessonTypeLabels[lesson.type]}` : format(date, 'EEEEEE', { locale: ru })}</small>
                  </th>
                })}
                <th scope="col" className={styles.percentage}>
                  {mode === 'attendance' ? 'Явка' : 'Ср. балл'}<small>{mode === 'attendance' ? 'среди отметок' : 'за период'}</small>
                </th>
              </tr>
            </thead>
            <tbody>
              {renderTableRows()}

              {!visibleRows.length && <tr className={styles.emptyRow}><td colSpan={columns.length + 2}>
                <strong>{searching ? 'Студент не найден' : 'В журнале пока нет студентов'}</strong>
                <span>{searching ? 'Проверьте имя или фамилию. Регистр и ё/е не влияют на поиск.' : isEditing ? 'Откройте изменение списка и добавьте ученика.' : 'Состав группы ещё не заполнен.'}</span>
                {searching && <button type="button" className={styles.controlButton} onClick={() => changeStudentQuery('')}>Сбросить поиск</button>}
              </td></tr>}

              {isEditing && isRosterEditing && (
                <tr className={styles.addRow}>
                  <td colSpan={columns.length + 2}>
                    <button
                      type="button"
                      className={styles.inlineAddBtn}
                      onClick={addStudent}
                      aria-label="Добавить ученика"
                    >
                      <PlusIcon size={14} />
                      Добавить ученика
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isEditing && (
          <div className={styles.controls}>
            <button type="button" className={`${styles.controlButton} ${isRosterEditing ? styles.activeButton : ""}`} onClick={() => setIsRosterEditing((value) => !value)} aria-pressed={isRosterEditing} aria-label="Изменить список учеников"><EditIcon size={18} /><span>Изменить</span></button>
            <span className={styles.controlHint}>{isRosterEditing ? 'Список учеников: имена и порядок строк' : changeCount ? `Правок: ${changeCount} · Галочка — сохранить` : 'Нет несохранённых изменений'}</span>
            <button
              type="button"
              onClick={requestCancel}
              className={`${styles.controlButton} ${styles.cancelButton}`}
              aria-label="Отменить изменения"
              title="Отменить изменения"
            >
              <CloseIcon size={20} />
            </button>
            <button
              type="button"
              onClick={acceptChanges}
              className={`${styles.controlButton} ${styles.saveButton}`}
              aria-label="Сохранить изменения"
              title="Сохранить изменения · Ctrl / ⌘ + Enter"
            >
              <AcceptIcon size={22} />
            </button>
          </div>
        )}
      </div>
      {discardOpen && <ConfirmDialog title="Отменить изменения журнала?" confirmLabel="Отменить изменения" cancelLabel="Продолжить редактирование" onCancel={() => setDiscardOpen(false)} onConfirm={cancelChanges}><p>Несохранённых правок: {changeCount}. Будет закрыт только ваш черновик; уже сохранённые данные журнала не изменятся.</p></ConfirmDialog>}
    </div>
  );
};
