import { useEffect, useRef } from "react";
import { isGroupActive, type GroupDraft } from "../../domain/groupCatalog";
import type { GroupRefreshReview } from "./groupEditorModel";
import styles from "./GroupRefreshPanel.module.scss";

export default function GroupRefreshPanel({ draft, review, stale, disabled, onRefresh, onChoose }: { draft: GroupDraft; review: GroupRefreshReview; stale: boolean; disabled: boolean; onRefresh(): void; onChoose(choice: "draft" | "saved"): void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const fields = [{ key: "name", label: "Название" }, { key: "course", label: "Курс" }, { key: "admissionYear", label: "Год набора" }, { key: "campus", label: "Корпус" }] as const;
  const value = (entry: string | number | undefined) => entry ? String(entry) : "Не указан";
  return <section className={styles.panel} aria-label="Сравнение реквизитов группы">
    <h3 ref={headingRef} tabIndex={-1}>Реквизиты изменились</h3>
    <p>Сравните текущий ввод с сохранёнными реквизитами. Выбор варианта вернёт к форме; сохранение выполняется отдельно.</p>
    <dl className={styles.comparison}>{fields.map(({ key, label }) => <div key={key}><dt>{label}</dt><dd><span>В форме</span><strong>{value(draft[key])}</strong></dd><dd><span>Сейчас сохранено</span><strong>{value(review.latest[key])}</strong></dd></div>)}</dl>
    <p>Состояние группы сейчас: <strong>{isGroupActive(review.latest) ? "Действующая" : "В архиве"}</strong>. Выбор реквизитов не меняет состояние группы.</p>
    {(!review.latest.campus || !review.latest.admissionYear) && <p>В сохранённых реквизитах есть пропуски. Перед сохранением заполните корпус и проверьте год набора.</p>}
    {stale && <p role="alert">Данные сравнения или права снова изменились. Обновите сравнение перед выбором.</p>}
    <div className={styles.actions}><button type="button" disabled={disabled || stale} onClick={() => onChoose("draft")}>Продолжить с моими реквизитами</button><button type="button" disabled={disabled || stale} onClick={() => onChoose("saved")}>Загрузить сохранённые реквизиты</button><button type="button" disabled={disabled} onClick={onRefresh}>Обновить сравнение</button></div>
  </section>;
}
