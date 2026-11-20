import { useEffect, useState } from "react";
import Card from "../Card";
import useTeachingWorkload from "../../hooks/useTeachingWorkload";
import { lessonTypeLabels } from "../../domain/academic";
import styles from "../../pages/adminPrograms/index.module.scss";

export default function TeachingWorkload({ teacherId }: { teacherId: string }) {
  const [page, setPage] = useState(1);
  const source = useTeachingWorkload(teacherId), rows = source?.data?.rows ?? [], pages = Math.max(1, Math.ceil(rows.length / 20)), currentPage = Math.min(page, pages);
  useEffect(() => setPage(1), [teacherId]);
  return <Card as="section" className={styles.card}><h2>Учебная нагрузка по типам занятий</h2>
    {!source && <p role="status">Загружаем нагрузку…</p>}{source?.error && <p role="alert">{source.error}</p>}
    {source?.data && <><div className={styles.hoursRead}>{source.data.totalsByMinutes.map(total => <div key={total.minutes}><span>Однозначно назначено · академический час {total.minutes} мин</span><strong>{total.hours.toLocaleString("ru-RU")} ч</strong></div>)}</div>
      <p className={styles.note}>Часы берутся из опубликованных планов групп для лекций, практик и лабораторных. Самостоятельная работа и прочие составляющие не распределяются автоматически.</p>
      {rows.slice((currentPage - 1) * 20, currentPage * 20).map(row => <div className={styles.rowEditor} key={row.id}><strong>{row.subjectName} · {row.groupName}</strong><span>{row.periodName} · {lessonTypeLabels[row.type]}</span><span>{row.hours.toLocaleString("ru-RU")} ч по {row.academicHourMinutes} мин · {row.planName}, версия {row.planNumber}</span>{row.shared && <p className={styles.note}>На этот тип назначены несколько преподавателей. Доли не заданы; часы не включены в личный итог.</p>}</div>)}
      {!rows.length && <p>Нагрузка по назначенным планам пока не определена.</p>}
      {source.data.unresolved.length > 0 && <details><summary>Неподтверждённые связи: {source.data.unresolved.length}</summary>{source.data.unresolved.slice(0, 20).map(item => <p key={item}>{item}</p>)}{source.data.unresolved.length > 20 && <p>Уточните назначения остальных групп в учебных планах.</p>}</details>}
      {pages > 1 && <nav className={styles.actions} aria-label="Страницы учебной нагрузки"><button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}
    </>}
  </Card>;
}
