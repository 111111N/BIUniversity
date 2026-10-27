import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { useSubjectCatalog } from "../../hooks/useSubjectCatalog";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import useManagedScheduleUpdate from "../../hooks/useManagedScheduleUpdate";
import { administrationChecksService, type AdministrationChecksSnapshot } from "../../data/administrationChecksService";
import { ADMINISTRATION_CHECK_LABELS, type AdministrationChecksQuery } from "../../domain/administrationChecks";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import styles from "./index.module.scss";
import Tabs from "../../components/Tabs";
import CheckResults from "./CheckResults";

export default function AdminChecksPage() {
  const { currentUser, accounts, accountError, refreshAccounts } = useRole();
  const subjects = useSubjectCatalog();
  const groups = useGroupCatalog();
  const scheduleUpdate = useManagedScheduleUpdate();
  const [params, setParams] = useSearchParams();
  const query = useMemo<AdministrationChecksQuery>(() => ({ q: params.get("q") ?? "", kind: params.get("kind") ?? "all", level: params.get("level") ?? "all", page: Number(params.get("page") ?? 1) }), [params]);
  const [reload, setReload] = useState(0);
  const request = useMemo(() => ({ query, accounts, accountError, subjectRevision: subjects.revision, subjectError: subjects.error, groupRevision: groups.revision, groupError: groups.error, actorId: currentUser.id, scheduleUpdate, reload }), [query, accounts, accountError, subjects.revision, subjects.error, groups.revision, groups.error, currentUser.id, scheduleUpdate, reload]);
  const [result, setResult] = useState<{ request: object; snapshot: AdministrationChecksSnapshot } | null>(null);
  const [failure, setFailure] = useState<{ request: object; message: string } | null>(null);
  const snapshot = result?.request === request ? result.snapshot : null;
  const error = accountError || subjects.error || groups.error || (failure?.request === request ? failure.message : "");
  const loading = !snapshot && !error;
  const actorRevision = accounts.find((account) => account.id === currentUser.id)?.revision ?? 0;
  useEffect(() => {
    let current = true;
    void administrationChecksService.list({ actorId: currentUser.id, actorRevision, query }).then((next) => { if (current) setResult({ request, snapshot: next }); }).catch((reason) => {
      console.error("Не удалось загрузить результаты проверки данных:", reason);
      if (current) setFailure({ request, message: reason instanceof Error ? reason.message : "Не удалось проверить данные." });
    });
    return () => { current = false; };
  }, [request, currentUser.id, actorRevision, query]);
  const update = (key: keyof AdministrationChecksQuery, value: string) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    next.delete("page"); return next;
  }, { replace: true });
  const page = (value: number) => setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set("page", String(value)); else next.delete("page"); return next; });
  const refresh = () => { refreshAccounts(); subjects.refresh(); groups.refresh(); setReload((value) => value + 1); };
  const filtered = Boolean(query.q || query.kind !== "all" || query.level !== "all");
  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.topline}><p>Выберите замечание и откройте запись для исправления.</p><button type="button" disabled={loading} onClick={refresh}>Проверить заново</button></div>
    <section className={styles.overview} aria-label="Важность замечаний">
      <p className={styles.note}>Замечания во всех данных · без учёта поиска и типа проверки</p>
      <Tabs className={styles.priorityTabs} variant="filter" ariaLabel="Важность замечаний" value={query.level} items={[
        { value: "all", label: "Все", count: snapshot && !error ? snapshot.counts.action + snapshot.counts.review : undefined },
        { value: "action", label: "Нужно исправить", count: snapshot && !error ? snapshot.counts.action : undefined },
        { value: "review", label: "Проверить", count: snapshot && !error ? snapshot.counts.review : undefined },
        ...(!["all", "action", "review"].includes(query.level) ? [{ value: query.level, label: "Неизвестная важность" }] : []),
      ]} onChange={(value) => update("level", value)} />
    </section>
    <div className={styles.filters}>
      <SearchField label="Поиск по названию, ФИО или логину" placeholder="" value={query.q} onChange={(value) => update("q", value)} />
      <Dropdown label="Тип проверки" searchable placeholder="" value={query.kind} options={[{ value: "all", label: "Все проверки" }, ...Object.entries(ADMINISTRATION_CHECK_LABELS).map(([value, label]) => ({ value, label }))]} onChange={(value) => update("kind", value)} />
    </div>
    {filtered && <div className={styles.activeFilters}><span>Применены фильтры</span><button type="button" onClick={() => setParams({}, { replace: true })}>Сбросить фильтры</button></div>}
    <CheckResults snapshot={snapshot} error={error} loading={loading} filtered={filtered} onPage={page} />
    <details className={styles.help}><summary>Что проверяется и как читать результат</summary><div><p>Проверяем внесённые учётки, группы, назначения и предстоящие или текущие опубликованные пары.</p><p>«Нужно исправить» — отсутствует номер зачетки или недоступны данные опубликованной пары. «Проверить» — группа без учащихся или дисциплина без действующих назначений; это может быть этапом подготовки.</p><p>Замечания исправляются вручную в соответствующих разделах. Этот отчёт не заменяет проверку конфликтов и изменений перед публикацией расписания.</p></div></details>
  </div>;
}
