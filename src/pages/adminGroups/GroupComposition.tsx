import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { accountService } from "../../data/accountStore";
import { ACCOUNT_ROLE_LABELS } from "../../domain/accounts";
import { GROUP_COMPOSITION_PAGE_SIZE, type GroupCompositionQuery, type GroupCompositionSnapshot, type GroupCompositionView } from "../../domain/groupComposition";
import { EDUCATION_EVENT_LABELS, getMoscowDateKey } from "../../domain/studentEducationEvent";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { parseCalendarDate } from "../../domain/calendar";
import { toLocalDateKey } from "../../domain/schedule";
import { educationDateLabel } from "../../components/EducationEventFields";
import DateTimePicker from "../../components/DateTimePicker";
import SearchField from "../../components/SearchField";
import Tabs from "../../components/Tabs";
import styles from "./GroupComposition.module.scss";

export default function GroupComposition({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { currentUser, accounts, accountError } = useRole();
  const catalogue = useGroupCatalog();
  const [params, setParams] = useSearchParams();
  const query = useMemo<GroupCompositionQuery>(() => ({ groupId, date: params.get("asOf") ?? "", q: params.get("rosterQ") ?? "", view: (params.get("roster") ?? "studying") as GroupCompositionView, page: Number(params.get("rosterPage") ?? 1) }), [params, groupId]);
  const signature = JSON.stringify(query);
  const [snapshot, setSnapshot] = useState<{ signature: string; result: GroupCompositionSnapshot } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  const actor = accounts.find((account) => account.id === currentUser.id);
  const actorRevision = actor?.revision;
  const readError = accountError || catalogue.error;
  const result = snapshot?.signature === signature && !loading && !readError && !error ? snapshot.result : null;
  useEffect(() => {
    let current = true; const request = ++sequence.current; setLoading(true); setError("");
    if (readError || actorRevision === undefined) { setLoading(false); return; }
    void accountService.getGroupComposition({ actorId: currentUser.id, actorRevision, query }).then((value) => {
      if (current && request === sequence.current) setSnapshot({ signature, result: value });
    }).catch((failure) => {
      if (current && request === sequence.current) { console.error("Не удалось загрузить состав группы на выбранный день:", failure); setError(failure instanceof Error ? failure.message : "Не удалось загрузить состав группы."); }
    }).finally(() => { if (current && request === sequence.current) setLoading(false); });
    return () => { current = false; };
  }, [query, signature, currentUser.id, actorRevision, accounts, catalogue.revision, readError, reload]);
  const update = (key: "asOf" | "rosterQ" | "roster" | "rosterPage", value: string) => {
    if (params.get(key) === value) return;
    sequence.current++; setLoading(true); setError("");
    setParams((previous) => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); if (key !== "rosterPage") next.delete("rosterPage"); return next; }, { replace: key === "rosterQ" });
  };
  const views: Array<{ value: GroupCompositionView; label: string }> = [{ value: "studying", label: "Учатся на дату" }, { value: "completed", label: "Завершили обучение" }, { value: "unknown", label: "Требуют уточнения" }];
  return <section className={styles.composition} aria-label="Состав группы на дату">
    <div className={styles.dateRow}><div className={styles.date}><span>Дата состава</span><DateTimePicker showTime={false} allowClear={false} ariaLabel="Дата состава группы" placeholder="" value={parseCalendarDate(query.date)} initialDate={parseCalendarDate(getMoscowDateKey())} onChange={(date) => { if (date) update("asOf", toLocalDateKey(date)); }} /></div><button type="button" disabled={query.date === getMoscowDateKey()} onClick={() => update("asOf", getMoscowDateKey())}>Сегодня</button><p className={styles.note}>На конец выбранного дня по Москве. Учитываются подтверждённые события обучения.</p></div>
    {result?.groupNameAtDate && result.groupNameAtDate !== groupName && <p className={styles.note}>Название группы на эту дату: <strong>{result.groupNameAtDate}</strong></p>}
    <SearchField label="Поиск в составе на дату" placeholder="" value={query.q} onChange={(value) => update("rosterQ", value)} />
    <Tabs variant="filter" ariaLabel="Подтверждение состава группы" value={query.view} items={views.map((view) => ({ ...view, ...(result ? { count: result.counts[view.value] } : {}) }))} onChange={(value) => update("roster", value)} />
    {(readError || error) && <div className={styles.error} role="alert">{readError || error}{!readError && <button type="button" onClick={() => setReload((value) => value + 1)}>Повторить чтение</button>}</div>}
    <p className={styles.note}>{query.view === "unknown" ? "Состояние этих записей за выбранный день неизвестно. Они связаны с группой сейчас или через внесённые события, но до начала подтверждённой истории не включаются в её состав." : "Список основан на внесённой истории. Записи без подтверждения показаны отдельно; неизвестные прошлые переходы и люди, ещё не заведённые в системе, не учитываются."}</p>
    <div className={styles.resultLine}><p role="status">{loading ? "Загружаем состав…" : result ? `Найдено: ${result.total}${result.total ? ` · ${(result.page - 1) * GROUP_COMPOSITION_PAGE_SIZE + 1}–${Math.min(result.page * GROUP_COMPOSITION_PAGE_SIZE, result.total)}` : ""}` : "Состав недоступен"}</p>{result && result.pages > 1 && <nav className={styles.pagination} aria-label="Страницы состава на дату"><button type="button" disabled={result.page === 1} onClick={() => update("rosterPage", String(result.page - 1))}>Назад</button><span>{result.page} / {result.pages}</span><button type="button" disabled={result.page === result.pages} onClick={() => update("rosterPage", String(result.page + 1))}>Далее</button></nav>}</div>
    <div className={styles.rows} aria-label="Записи состава на дату" aria-busy={loading}>{result?.rows.map((row) => <article className={styles.row} key={row.accountId}>
      <div className={styles.identity}><strong>{row.name}</strong><span>{row.login}</span><span>{row.studentNumber ? `Зачетка ${row.studentNumber}` : "Номер зачетки не выдан"}</span>{row.currentRole !== "student" && <span>Тип учётки сейчас: {ACCOUNT_ROLE_LABELS[row.currentRole]}</span>}</div>
      <div className={styles.evidence}>{row.knowledge === "confirmed" && row.enrollment && row.source ? <><strong>{STUDENT_ENROLLMENT_LABELS[row.enrollment]}</strong><span>{EDUCATION_EVENT_LABELS[row.source.kind]} · {educationDateLabel(row.source.effectiveDate)}</span></> : <><strong>Нет подтверждения на дату</strong><span>{row.firstEventDate ? `История начинается ${educationDateLabel(row.firstEventDate)}. Более ранний состав неизвестен.` : "События обучения ещё не внесены."}</span></>}</div>
      <Link to={`/admin/students/${encodeURIComponent(row.accountId)}/education${row.source ? `#${row.source.id}` : ""}`}>{row.knowledge === "unknown" ? "Уточнить историю" : "История обучения"}</Link>
    </article>)}</div>
    {result && !result.total && <div className={styles.empty}><strong>{query.q ? "Ничего не найдено" : query.view === "studying" ? "Учащихся с подтверждённым состоянием на этот день нет" : query.view === "completed" ? "Завершённого обучения на эту дату не найдено" : "Связанных записей без подтверждения не найдено"}</strong><p>{query.q ? "Измените запрос или сбросьте поиск." : query.view === "studying" && result.counts.unknown ? "Проверьте список «Требуют уточнения»: часть истории ещё не подтверждена." : "Выберите другой день или проверьте историю обучения."}</p>{query.q && <button type="button" onClick={() => update("rosterQ", "")}>Сбросить поиск</button>}</div>}
    <p className={styles.note}>ФИО, логин и номер зачетки показаны из текущих данных учётки. Просмотр состава не меняет журналы и назначения.</p>
  </section>;
}
