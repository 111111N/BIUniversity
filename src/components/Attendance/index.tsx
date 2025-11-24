import * as React from 'react';
import { useState, useMemo, useEffect, useCallback } from 'react';
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

const STATUS_COLORS = {
  present: { fill: 'var(--color-visit)', color2: 'var(--color-visit)' },
  sick: { fill: 'var(--color-sick)', color2: 'var(--color-border)' },
  absent: { fill: 'var(--color-no-visit)', color2: 'var(--color-border)' },
};

const START_DATE = new Date(2025, 9, 1);
const END_DATE = new Date(2025, 9, 30);

const generateDates = (start: Date, end: Date): Date[] =>
  eachDayOfInterval({ start, end }).filter(d => getDay(d) !== 0);

const getDateKey = (date: Date) => format(date, 'yyyy-MM-dd');
const nextAttendance = (status: AttendanceStatus): AttendanceStatus =>
  status === 'absent' ? 'present' : status === 'present' ? 'sick' : 'absent';
const nextGrade = (grade: Grade): Grade =>
  grade === null ? 5 : grade === 5 ? 4 : grade === 4 ? 3 : grade === 3 ? 2 : null;

interface AttendanceTableProps {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
}

/* ======= оптимизированная и мемоизированная иконка (локальная обёртка) ======= */
const MemoVisitMarkIcon = React.memo(VisitMarkIcon);

/* ======= TableCell: вынесенный компонент + useCallback внутри, затем React.memo с кастомной проверкой ======= */
const TableCellComponent: React.FC<{
  student: Student;
  date: Date;
  rowIndex: number;
  colIndex: number;
  mode: 'attendance' | 'grades';
  hoveredCell: { row: number | null; col: number | null };
  activeCell: { row: number | null; col: number | null };
  isEditing: boolean;
  toggleAttendance: (id: string, key: string) => void;
  toggleGrade: (id: string, key: string) => void;
  setHoveredCell: React.Dispatch<React.SetStateAction<{ row: number | null; col: number | null }>>;
  setActiveCell: React.Dispatch<React.SetStateAction<{ row: number | null; col: number | null }>>;
}> = ({
  student,
  date,
  rowIndex,
  colIndex,
  mode,
  hoveredCell,
  activeCell,
  isEditing,
  toggleAttendance,
  toggleGrade,
  setHoveredCell,
  setActiveCell,
}) => {
  const dateKey = getDateKey(date);
  const isHovered = hoveredCell.row === rowIndex && hoveredCell.col === colIndex;
  const isActive = activeCell.row === rowIndex && activeCell.col === colIndex;

  const onClick = useCallback(() => {
    if (!isEditing) return;
    if (mode === 'attendance') toggleAttendance(student.id, dateKey);
    else toggleGrade(student.id, dateKey);
    // no other side effects here
  }, [isEditing, mode, student.id, dateKey, toggleAttendance, toggleGrade]);

  const onMouseEnter = useCallback(() => setHoveredCell({ row: rowIndex, col: colIndex }), [rowIndex, colIndex, setHoveredCell]);
  const onMouseLeave = useCallback(() => setHoveredCell({ row: null, col: null }), [setHoveredCell]);
  const onMouseDown = useCallback(() => setActiveCell({ row: rowIndex, col: colIndex }), [rowIndex, colIndex, setActiveCell]);
  const onMouseUp = useCallback(() => setActiveCell({ row: null, col: null }), [setActiveCell]);

  const baseClass = mode === 'grades' ? styles.gradeCell : '';
  const highlightClass = isHovered || isActive ? styles.highlightCurrentCell : '';

  const status = student.attendance?.[dateKey] ?? 'absent';
  let fill = STATUS_COLORS[status].fill;
  let color2 = STATUS_COLORS[status].color2;
  const border = 'var(--color-border)';

  if (isActive) {
                      fill =
                        status === 'present'
                          ? 'var(--color-visit-active)'
                          : status === 'sick'
                          ? 'var(--color-sick-active)'
                          : 'var(--color-no-visit-active)';
                      color2 = 'var(--color-border-active)';
                    } else if (isHovered) color2 = 'var(--color-border-hover)';

  return (
    <td
      className={`${baseClass} ${highlightClass}`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      {mode === 'attendance' ? (
        <MemoVisitMarkIcon color={border} size={36} fill={fill} color2={color2} />
      ) : (
        student.grades?.[dateKey] ?? ''
      )}
    </td>
  );
};

/* Кастомная проверка пропсов: важна для уменьшения ререндеров при hover других ячеек */
export const TableCell = React.memo(
  TableCellComponent,
  (prev, next) => {
    // Если это не та же ячейка по координатам — тогда всё равно сравниваем только те поля, от которых зависит отрисовка этой ячейки.
    // Перерисовываем, когда:
    // - поменялся сам student (по ссылке), или
    // - поменялся режим (attendance/grades), или
    // - поменялись hovered/active для этой конкретной ячейки
    // Иначе — блокируем ререндер.
    const sameStudent = prev.student === next.student;
    const sameMode = prev.mode === next.mode;
    const sameIsEditing = prev.isEditing === next.isEditing;
    const sameCoords = prev.rowIndex === next.rowIndex && prev.colIndex === next.colIndex;
    const hoveredChangedForThisCell =
      (prev.hoveredCell.row === prev.rowIndex && prev.hoveredCell.col === prev.colIndex) !==
      (next.hoveredCell.row === next.rowIndex && next.hoveredCell.col === next.colIndex);
    const activeChangedForThisCell =
      (prev.activeCell.row === prev.rowIndex && prev.activeCell.col === prev.colIndex) !==
      (next.activeCell.row === next.rowIndex && next.activeCell.col === next.colIndex);

    // Если координаты совпадают и ничего важного (status/grade/mode/edit) не изменилось — пропускаем ререндер.
    if (sameStudent && sameMode && sameIsEditing && sameCoords && !hoveredChangedForThisCell && !activeChangedForThisCell) {
      return true; // props equal => skip render
    }
    return false; // props not equal => render
  }
);

/* ======= Основной компонент AttendanceTable (оптимизирован) ======= */
export const AttendanceTable: React.FC<AttendanceTableProps> = ({ students, setStudents }) => {
  const workDays = useMemo(() => generateDates(START_DATE, END_DATE), []);
  const [hoveredCell, setHoveredCell] = useState<{ row: number | null; col: number | null }>({ row: null, col: null });
  const [activeCell, setActiveCell] = useState<{ row: number | null; col: number | null }>({ row: null, col: null });
  const [isEditing, setIsEditing] = useState(false);
  const [draftStudents, setDraftStudents] = useState<Student[]>(students);
  const [originalStudents, setOriginalStudents] = useState<Student[]>(students);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'attendance' | 'grades'>('attendance');
  const [hoveredTable, setHoveredTable] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isEditing ? 'hidden' : '';
    return () => {
      // safety: restore on unmount
      document.body.style.overflow = '';
    };
  }, [isEditing]);

  const startEditing = useCallback(() => {
    const normalized = students.map(s => {
      const att = { ...s.attendance };
      const grades: { [key: string]: Grade } = {};
      workDays.forEach(d => {
        const key = getDateKey(d);
        if (!att[key]) att[key] = 'absent';
        grades[key] = s.grades?.[key] ?? null;
      });
      return { ...s, attendance: att, grades };
    });

    setOriginalStudents(normalized.map(s => ({ ...s, attendance: { ...s.attendance }, grades: { ...s.grades } })));
    setDraftStudents(normalized.map(s => ({ ...s, attendance: { ...s.attendance }, grades: { ...s.grades } })));
    setStudents(normalized);
    setIsEditing(true);
    // reset hovered/active just in case
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
  }, [students, setStudents, workDays]);

  const acceptChanges = useCallback(() => {
    setStudents(draftStudents);
    setIsEditing(false);
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
  }, [draftStudents, setStudents]);

  const cancelChanges = useCallback(() => {
    setDraftStudents(originalStudents);
    setStudents(originalStudents);
    setIsEditing(false);
    setHoveredCell({ row: null, col: null });
    setActiveCell({ row: null, col: null });
  }, [originalStudents, setStudents]);

  const moveStudent = useCallback((from: number, to: number) => {
    setDraftStudents(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  }, []);

  const addStudent = useCallback(() => {
    const id = crypto.randomUUID();
    const newStudent: Student = { id, name: 'Новый ученик', attendance: {}, grades: {} };
    workDays.forEach(d => {
      const key = getDateKey(d);
      newStudent.attendance[key] = 'absent';
      newStudent.grades[key] = null;
    });
    setDraftStudents(prev => [...prev, newStudent]);
  }, [workDays]);

  const deleteStudent = useCallback((id: string) => setDraftStudents(prev => prev.filter(s => s.id !== id)), []);

  const toggleAttendance = useCallback((studentId: string, dateKey: string) =>
    setDraftStudents(prev =>
      prev.map(s =>
        s.id !== studentId ? s : { ...s, attendance: { ...s.attendance, [dateKey]: nextAttendance(s.attendance?.[dateKey] ?? 'absent') } }
      )
    ), []);

  const toggleGrade = useCallback((studentId: string, dateKey: string) =>
    setDraftStudents(prev =>
      prev.map(s => (s.id !== studentId ? s : { ...s, grades: { ...s.grades, [dateKey]: nextGrade(s.grades?.[dateKey] ?? null) } }))
    ), []);

  const calcAverage = useCallback((student: Student) => {
    const gradesArray = workDays
      .map(d => student.grades?.[getDateKey(d)])
      .filter((g): g is Exclude<Grade, null> => g !== null);
    if (!gradesArray.length) return '-';
    const sum = gradesArray.reduce((a, b) => a + b, 0);
    return (sum / gradesArray.length).toFixed(2);
  }, [workDays]);

  const calcPresence = useCallback((student: Student) => {
    const total = workDays.length;
    const present = workDays.filter(d => student.attendance?.[getDateKey(d)] === 'present').length;
    return total === 0 ? '0%' : `${((present / total) * 100).toFixed(1)}%`;
  }, [workDays]);

  return (
    <div
      className={`${styles.attendanceTableContainer} ${isEditing ? styles.fullscreen : ''}`}
      onMouseEnter={() => !isEditing && setHoveredTable(true)}
      onMouseLeave={() => !isEditing && setHoveredTable(false)}
    >
      {!isEditing && hoveredTable && (
        <div className={styles.overlay}>
          <button
            className={styles.editOverlayButton}
            onClick={startEditing}
            onKeyDown={e => e.key === 'Enter' && startEditing()}
            tabIndex={0}
            aria-label="Редактировать таблицу"
          >
            <div className={styles.editIconWrapper}>
              <EditIcon size={48} color="var(--color-light)" />
            </div>
            <span className={styles.editOverlayText}>Изменить</span>
          </button>
        </div>
      )}

      <div className={styles.layoutWithControls}>
        {isEditing && <h2 className={styles.tableName}>Таблица {mode === 'attendance' ? 'посещаемости' : 'оценок'}</h2>}

        <div className={styles.tableWrapper}>
          <table className={!isEditing ? styles.inactiveTable : ''}>
            <thead>
              <tr>
                <th className={styles.studentName}>Ученик</th>
                {workDays.map((date, colIndex) => (
                  <th key={colIndex} title={format(date, 'EEEE, d MMMM', { locale: ru })}>
                    {format(date, 'dd.MM')}
                  </th>
                ))}
                <th className={styles.percentage}>{mode === 'attendance' ? '%' : 'Ср. балл'}</th>
              </tr>
            </thead>
            <tbody>
              {draftStudents.map((student, rowIndex) => (
                <tr
                  key={student.id}
                  draggable={isEditing}
                  onDragStart={() => isEditing && setDragIndex(rowIndex)}
                  onDragEnter={() => isEditing && setDragOverIndex(rowIndex)}
                  onDragEnd={() => {
                    if (isEditing && dragIndex !== null && dragOverIndex !== null) moveStudent(dragIndex, dragOverIndex);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`${hoveredCell.row === rowIndex ? styles.highlightRow : ''}${
                    isEditing && dragOverIndex === rowIndex ? styles.dragOver : ''
                  }  ${rowIndex % 2 === 1 ? styles.evenRow : styles.oddRow}`}
                >
                  <td className={`${styles.studentColumn} ${hoveredCell.row === rowIndex ? styles.highlightName : ''}`}>
                    {isEditing ? (
                      <div className={styles.editNameWrapper}>
                        <input
                          value={student.name}
                          onChange={e =>
                            setDraftStudents(prev => prev.map(s => (s.id === student.id ? { ...s, name: e.target.value } : s)))
                          }
                        />
                        <button className={styles.inlineDeleteBtn} onClick={() => deleteStudent(student.id)}>
                          <MinusIcon size={24} fill="var(--color-ligth)" />
                        </button>
                      </div>
                    ) : (
                      student.name
                    )}
                  </td>

                  {workDays.map((date, colIndex) => (
                    <TableCell
                      key={`${student.id}-${getDateKey(date)}`}
                      student={student}
                      date={date}
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      mode={mode}
                      hoveredCell={hoveredCell}
                      activeCell={activeCell}
                      isEditing={isEditing}
                      toggleAttendance={toggleAttendance}
                      toggleGrade={toggleGrade}
                      setHoveredCell={setHoveredCell}
                      setActiveCell={setActiveCell}
                    />
                  ))}

                  <td className={styles.percentageCell}>
                    {mode === 'attendance' ? calcPresence(student) : calcAverage(student)}
                  </td>
                </tr>
              ))}

              {isEditing && (
                <tr className={styles.addRow}>
                  <td colSpan={workDays.length + 2}>
                    <button className={styles.inlineAddBtn} onClick={addStudent}>
                      <PlusIcon size={12} fill="var(--color-ligth)" /> Добавить ученика
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isEditing && (
          <div className={styles.controls}>
            <button
              className={styles.controlButton}
              onClick={() => setMode(prev => (prev === 'attendance' ? 'grades' : 'attendance'))}
            >
              {mode === 'attendance' ? 'Оценки' : 'Посещаемость'}
            </button>
            <div style={{ flex: 1 }}></div>
            <button onClick={cancelChanges} className={styles.controlButton}>
              <CloseIcon size={24} color="var(--color-light)" fill="var(--color-light)" />
            </button>
            <button onClick={acceptChanges} className={styles.controlButton}>
              <AcceptIcon size={24} color="var(--color-light)" fill="var(--color-light)" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
