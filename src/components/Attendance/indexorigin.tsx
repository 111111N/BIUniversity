import * as React from 'react';
import { useState, useMemo, useEffect } from 'react';
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

interface AttendanceTableProps {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
}

export const AttendanceTable: React.FC<AttendanceTableProps> = ({ students, setStudents }) => {
  const workDays = useMemo(() => generateDates(START_DATE, END_DATE), []);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [activeCell, setActiveCell] = useState<{ row: number | null; col: number | null }>({ row: null, col: null });
  const [isEditing, setIsEditing] = useState(false);
  const [draftStudents, setDraftStudents] = useState<Student[]>(students);
  const [originalStudents, setOriginalStudents] = useState<Student[]>(students);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'attendance' | 'grades'>('attendance');
  const [hoveredTable, setHoveredTable] = useState(false);

  useEffect(() => {
    // блокируем скролл страницы только когда редактируем
    document.body.style.overflow = isEditing ? 'hidden' : '';
  }, [isEditing]);

  const startEditing = () => {
    const normalized = students.map(s => {
      const att = { ...s.attendance };
      const grades: { [key: string]: Grade } = {};
      workDays.forEach(d => {
        const key = format(d, 'yyyy-MM-dd');
        if (!att[key]) att[key] = 'absent';
        grades[key] = s.grades?.[key] ?? null;
      });
      return { ...s, attendance: att, grades };
    });

    setOriginalStudents(normalized.map(s => ({ ...s, attendance: { ...s.attendance }, grades: { ...s.grades } })));
    setDraftStudents(normalized.map(s => ({ ...s, attendance: { ...s.attendance }, grades: { ...s.grades } })));
    setStudents(normalized);
    setIsEditing(true);
  };

  const acceptChanges = () => {
    setStudents(draftStudents);
    setIsEditing(false);
  };

  const cancelChanges = () => {
    setDraftStudents(originalStudents);
    setStudents(originalStudents);
    setIsEditing(false);
  };

  const moveStudent = (from: number, to: number) => {
    setDraftStudents(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  const addStudent = () => {
    const id = crypto.randomUUID();
    const newStudent: Student = { id, name: 'Новый ученик', attendance: {}, grades: {} };
    workDays.forEach(d => {
      const key = format(d, 'yyyy-MM-dd');
      newStudent.attendance[key] = 'absent';
      newStudent.grades[key] = null;
    });
    setDraftStudents(prev => [...prev, newStudent]);
  };

  const deleteStudent = (id: string) => {
    setDraftStudents(prev => prev.filter(s => s.id !== id));
  };

  const toggleAttendance = (studentId: string, dateKey: string) => {
    setDraftStudents(prev =>
      prev.map(s => {
        if (s.id !== studentId) return s;
        const cur: AttendanceStatus = s.attendance[dateKey] ?? 'absent';
        const next: AttendanceStatus = cur === 'absent' ? 'present' : cur === 'present' ? 'sick' : 'absent';
        return { ...s, attendance: { ...s.attendance, [dateKey]: next } };
      })
    );
  };

  const toggleGrade = (studentId: string, dateKey: string) => {
    setDraftStudents(prev =>
      prev.map(s => {
        if (s.id !== studentId) return s;
        const cur: Grade = s.grades?.[dateKey] ?? null;
        const next: Grade = cur === null ? 5 : cur === 5 ? 4 : cur === 4 ? 3 : cur === 3 ? 2 : null;
        return { ...s, grades: { ...s.grades, [dateKey]: next } };
      })
    );
  };

  const calcAverage = (student: Student) => {
    const gradesArray = workDays
      .map(d => student.grades?.[format(d, 'yyyy-MM-dd')])
      .filter((g): g is Exclude<Grade, null> => g !== null);
    if (gradesArray.length === 0) return '-';
    const sum = gradesArray.reduce((a, b) => a + b, 0);
    return (sum / gradesArray.length).toFixed(2);
  };

  const calcPresence = (student: Student) => {
    const total = workDays.length;
    const present = workDays.filter(d => student.attendance[format(d, 'yyyy-MM-dd')] === 'present').length;
    return total === 0 ? '0%' : `${((present / total) * 100).toFixed(1)}%`;
  };

  return (
  <div 
    className={`${styles.attendanceTableContainer} ${isEditing ? styles.fullscreen : ''}`}
    onMouseEnter={() => !isEditing && setHoveredTable(true)}
    onMouseLeave={() => !isEditing && setHoveredTable(false)}
  >
    {/* Overlay + иконка редактирования до нажатия */}
    {!isEditing && (
  <div className={styles.overlay}>
    {hoveredTable && (
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
    )}
  </div>
)}

    <div className={styles.layoutWithControls}>
      {isEditing? <h2>Таблица {mode === "attendance" ? 'посещаемости' : 'оценок'} </h2> : ''}

      <div className={styles.tableWrapper}>
        <table className={!isEditing ? styles.inactiveTable : ''}>
          <thead>
            <tr>
              <th className={styles.studentName}>Ученик</th>
              {workDays.map((date, colIndex) => (
                <th
                  key={colIndex}
                  title={format(date, 'EEEE, d MMMM', { locale: ru })}
                  className={hoveredCol === colIndex ? styles.highlightHeader : ''}
                >
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
                  if (isEditing && dragIndex !== null && dragOverIndex !== null)
                    moveStudent(dragIndex, dragOverIndex);
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`${hoveredRow === rowIndex ? styles.highlightRow : ''}${
                  isEditing && dragOverIndex === rowIndex ? styles.dragOver : ''
                }`}
              >
                <td className={`${styles.studentColumn} ${hoveredRow === rowIndex ? styles.highlightName : ''}`}>
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

                {workDays.map((date, colIndex) => {
                  const dateKey = format(date, 'yyyy-MM-dd');
                  const isHovered = hoveredRow === rowIndex && hoveredCol === colIndex;
                  const isActive = activeCell.row === rowIndex && activeCell.col === colIndex;

                  if (mode === 'attendance') {
                    const status: AttendanceStatus = student.attendance[dateKey] ?? 'absent';
                    const base = STATUS_COLORS[status];
                    let fill = base.fill;
                    let color2 = base.color2;
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
                        key={`${student.id}-${dateKey}`}
                        className={`${isHovered ? styles.highlightCurrentCell : ''}`}
                        onClick={() => isEditing && toggleAttendance(student.id, dateKey)}
                        onMouseEnter={() => {
                          setHoveredRow(rowIndex);
                          setHoveredCol(colIndex);
                        }}
                        onMouseLeave={() => {
                          setHoveredRow(null);
                          setHoveredCol(null);
                        }}
                        onMouseDown={() => setActiveCell({ row: rowIndex, col: colIndex })}
                        onMouseUp={() => setActiveCell({ row: null, col: null })}
                      >
                        <VisitMarkIcon color={border} color2={color2} fill={fill} size={36} />
                      </td>
                    );
                  } else {
                    const grade: Grade = student.grades?.[dateKey] ?? null;
                    return (
                      <td
                        key={`${student.id}-${dateKey}`}
                        className={`${styles.gradeCell} ${
                          isHovered || (mode === 'grades' && isActive) ? styles.highlightCurrentCell : ''
                        }`}
                        onClick={() => isEditing && toggleGrade(student.id, dateKey)}
                        onMouseEnter={() => {
                          setHoveredRow(rowIndex);
                          setHoveredCol(colIndex);
                        }}
                        onMouseLeave={() => {
                          setHoveredRow(null);
                          setHoveredCol(null);
                        }}
                      >
                        {grade ?? ''}
                      </td>
                    );
                  }
                })}

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

      {/* Кнопки управления (редактирование, оценки) */}
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
