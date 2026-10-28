import type { RefObject } from "react";
import { Link } from "react-router-dom";
import BatchReviewList from "../../components/BatchWorkflow/ReviewList";
import { getBatchPage } from "../../components/BatchWorkflow/presentation";
import Tabs from "../../components/Tabs";
import type { PortalAccount } from "../../domain/accounts";
import type { StudentBulkPreview } from "../../domain/studentBulk";
import type { StudentBulkReceipt, StudentBulkSnapshot } from "../../domain/studentBulkReceipt";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { REGISTRY_PAGE_SIZE } from "../../domain/studentRegistry";
import { filterStudentOperationRows } from "./presentation";
import styles from "./index.module.scss";

interface Props {
  receipt?: StudentBulkReceipt; preview: StudentBulkPreview | null; accounts: ReadonlyMap<string, PortalAccount>;
  filter: string; query: string; page: number; onFilter(value: string): void; onQuery(value: string): void; onPage(value: number): void;
  actionsRef?: RefObject<HTMLElement | null>;
}
const snapshotLabel = (snapshot: StudentBulkSnapshot) => `${snapshot.groupName} · ${STUDENT_ENROLLMENT_LABELS[snapshot.enrollment]}`;
export default function StudentOperationReview({ receipt, preview, accounts, filter, query, page, onFilter, onQuery, onPage, actionsRef }: Props) {
  const reviewRows = filterStudentOperationRows(preview?.rows ?? [], filter, query, accounts);
  const resultRows = filterStudentOperationRows(receipt?.rows ?? [], filter, query, accounts);
  const total = receipt ? resultRows.length : reviewRows.length;
  const { start, end } = getBatchPage(total, page, REGISTRY_PAGE_SIZE);
  const allRows = receipt?.rows ?? preview?.rows ?? [];
  return <BatchReviewList searchLabel="Поиск в выбранном пакете" query={query} onQuery={onQuery} total={total} page={page} pageSize={REGISTRY_PAGE_SIZE} onPage={onPage} onReset={() => { onQuery(""); onFilter("all"); }} actionsRef={actionsRef} filters={
    <Tabs variant="filter" ariaLabel="Строки массового действия" value={filter} items={[
      { value: "all", label: "Все", count: allRows.length },
      { value: "changed", label: receipt ? "Изменены" : "Изменятся", count: allRows.filter((row) => row.outcome === "changed").length },
      { value: "unchanged", label: "Без изменений", count: allRows.filter((row) => row.outcome === "unchanged").length },
      ...(!receipt ? [{ value: "error", label: "Ошибки", count: preview?.errors ?? 0 }] : []),
    ]} onChange={(value) => { onFilter(value); onPage(1); }} />
  }>
    <ol className={styles.rows} aria-label={receipt ? "Результат изменения студентов" : "Предпросмотр изменения студентов"}>
      {receipt ? resultRows.slice(start, end).map((row) => <li className={styles.reviewRow} key={row.accountId}>
        <div><strong>{accounts.get(row.accountId)?.name ?? "Учётная запись"}</strong><span>{row.outcome === "changed" ? "Изменён" : "Без изменений"}</span></div>
        <div><span>До</span><strong>{snapshotLabel(row.before)}</strong></div><div><span>После</span><strong>{snapshotLabel(row.after)}</strong></div>
        <Link to={`/admin/accounts?account=${encodeURIComponent(row.accountId)}&mode=history`}>История учётки</Link>
      </li>) : reviewRows.slice(start, end).map((row) => <li className={`${styles.reviewRow} ${row.errors.length ? styles.invalidRow : ""}`} key={row.accountId}>
        <div><strong>{row.name}</strong><span>{row.studentNumber ? `Зачетка ${row.studentNumber}` : "Зачетка не выдана"}</span><span>{row.outcome === "changed" ? "Будет изменён" : row.outcome === "unchanged" ? "Без изменений" : "Ошибка"}</span></div>
        <div><span>До</span><strong>{row.before ? snapshotLabel(row.before) : "—"}</strong></div><div><span>После</span><strong>{row.after ? snapshotLabel(row.after) : "—"}</strong></div>
        {row.errors.length > 0 && <ul className={styles.issues}>{row.errors.map((issue) => <li key={issue}>{issue}</li>)}</ul>}
      </li>)}
    </ol>
  </BatchReviewList>;
}
