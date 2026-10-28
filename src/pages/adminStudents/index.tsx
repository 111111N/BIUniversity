import { EducationEventSummary, emptyEducationDetails } from "../../components/EducationEventFields";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { accountService, readAccountsState } from "../../data/accountStore";
import { isGroupActive } from "../../domain/groupCatalog";
import { STUDENT_ENROLLMENT_LABELS } from "../../domain/studentEnrollment";
import { CAMPUSES } from "../../domain/studentRecord";
import { REGISTRY_PAGE_SIZE, type StudentRegistryQuery, type StudentRegistryResult } from "../../domain/studentRegistry";
import type { StudentBulkAction, StudentBulkReceipt } from "../../domain/studentBulkReceipt";
import { MAX_STUDENT_BULK_TARGETS, type StudentBulkPreview } from "../../domain/studentBulk";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import Checkbox from "../../components/Checkbox";
import styles from "./index.module.scss";
import { WorkflowSteps, BatchActionBar } from "../../components/BatchWorkflow";
import { getBatchApplyHint } from "../../components/BatchWorkflow/presentation";
import { getStudentPageSelection, toggleStudentPageSelection } from "./presentation";
import SelectedStudents from "./SelectedStudents";
import StudentOperationForm from "./StudentOperationForm";
import StudentOperationReview from "./StudentOperationReview";
import { getStudentOperationBlockReason, getStudentOperationProblems } from "./operationParameters";
import { isAccountActive } from "../../domain/accounts";

const actionLabels = { transfer: "Перевести в группу", graduated: "Оформить выпуск", withdrawn: "Оформить отчисление" };
const dateLabel = (date: string) => new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });
const emptyResult: StudentRegistryResult = { rows: [], total: 0, totalStudents: 0, page: 1, pages: 1, years: [] };

export default function AdminStudentsPage() {
  const { currentUser, accounts, accountError, refreshAccounts } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const query = useMemo<StudentRegistryQuery>(() => ({ q: params.get("q") ?? "", group: params.get("group") ?? "all", enrollment: params.get("enrollment") ?? "all", access: params.get("access") ?? "all", campus: params.get("campus") ?? "all", year: params.get("year") ?? "all", sort: params.get("sort") ?? "name", page: Number(params.get("page") ?? 1) }), [params]);
  const filterSignature = JSON.stringify({ ...query, page: 1 });
  const [listing, setListing] = useState(emptyResult);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedAction, setSelectedAction] = useState<StudentBulkAction["kind"]>("transfer");
  const [selectionNotice, setSelectionNotice] = useState("");
  const filtersRef = useRef<HTMLFieldSetElement>(null);
  const selectedCountRef = useRef(0); selectedCountRef.current = selected.size;
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [reload, setReload] = useState(0);
  const [kind, setKind] = useState<StudentBulkAction["kind"] | null>(null);
  const [targetGroup, setTargetGroup] = useState("");
  const [education, setEducation] = useState(emptyEducationDetails);
  const [validationRequest, setValidationRequest] = useState(0);
  const [preview, setPreview] = useState<StudentBulkPreview | null>(null);
  const [batchId, setBatchId] = useState("");
  const [pendingReceipt, setPendingReceipt] = useState<StudentBulkReceipt | null>(null);
  const [rowFilter, setRowFilter] = useState("all");
  const [rowPage, setRowPage] = useState(1);
  const [rowQuery, setRowQuery] = useState("");
  const actionsRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requestSequence = useRef(0);
  const querySignature = JSON.stringify(query);
  const state = readAccountsState();
  const byId = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const receipt = pendingReceipt ?? state.studentOperations.find((operation) => operation.id === params.get("batch"));
  const actor = byId.get(currentUser.id);
  const sourceError = accountError || catalogue.error || state.error;
  const unavailable = Boolean(sourceError);
  const actorAvailable = Boolean(actor && actor.role === "configurator" && isAccountActive(actor));
  const blocked = busy || unavailable;
  const stale = Boolean(preview && (preview.expectedRevision !== state.revision || preview.groupRevision !== catalogue.revision || preview.actorRevision !== actor?.revision));
  const stage = receipt?.id ?? preview?.fingerprint ?? kind ?? "registry";
  const activeGroup = catalogue.groups.find((group) => group.id === query.group && isGroupActive(group));
  useUnsavedChangesWarning(Boolean(kind || preview) || busy);
  useLayoutEffect(() => { if (selectedCountRef.current) setSelectionNotice(`Фильтры изменились. Выбор студентов снят: ${selectedCountRef.current}.`); setSelected(new Set()); }, [filterSignature]);
  useLayoutEffect(() => { requestSequence.current++; setLoading(true); setKind(null); setPreview(null); setBatchId(""); }, [querySignature]);
  useEffect(() => {
    let current = true; const sequence = ++requestSequence.current; setLoading(true); setReadError("");
    void accountService.listStudents(query).then((result) => { if (current && sequence === requestSequence.current) setListing(result); }).catch((failure) => { if (current && sequence === requestSequence.current) { console.error("Не удалось загрузить страницу реестра студентов:", failure); setReadError(failure instanceof Error ? failure.message : "Не удалось загрузить студентов."); } }).finally(() => { if (current && sequence === requestSequence.current) setLoading(false); });
    return () => { current = false; };
  }, [query, accounts, catalogue.revision, catalogue.error, reload]);
  useEffect(() => { if (stage !== "registry") headingRef.current?.focus(); }, [stage]);
  useEffect(() => {
    if (!pendingReceipt || busy || kind || preview) return;
    if (params.get("batch") === pendingReceipt.id) { setPendingReceipt(null); return; }
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("batch", pendingReceipt.id); return next; }, { replace: true });
  }, [pendingReceipt, busy, kind, preview, params, setParams]);

  const filter = (key: keyof StudentRegistryQuery, value: string) => {
    if (selected.size || String(query[key]) === value) return;
    setSelectionNotice("");
    requestSequence.current++; setLoading(true); setSelected(new Set()); setError("");
    setParams((previous) => { const next = new URLSearchParams(previous); if (!value || value === "all" || (key === "sort" && value === "name")) next.delete(key); else next.set(key, value); next.delete("page"); return next; }, { replace: true });
  };
  const page = (value: number) => { requestSequence.current++; setLoading(true); setParams((previous) => { const next = new URLSearchParams(previous); if (value > 1) next.set("page", String(value)); else next.delete("page"); return next; }); };
  const toggle = (id: string, checked: boolean) => setSelected((previous) => { const next = new Set(previous); if (checked) next.add(id); else next.delete(id); return next; });
  const pageIds = listing.rows.map((row) => row.accountId);
  const pageSelection = getStudentPageSelection(selected, pageIds);
  const pageSelected = pageSelection.all;
  const togglePage = () => setSelected((previous) => toggleStudentPageSelection(previous, pageIds));
  const unlockFilters = () => { setSelected(new Set()); setSelectionNotice("Выбор снят. Можно изменить поиск и фильтры."); requestAnimationFrame(() => filtersRef.current?.querySelector<HTMLInputElement>("input")?.focus()); };
  const startAction = (action: StudentBulkAction["kind"]) => { if (!selected.size || blocked || loading || readError) return; setKind(action); setTargetGroup(""); setEducation(emptyEducationDetails()); setValidationRequest(0); setPreview(null); setBatchId(`students-${crypto.randomUUID()}`); setError(""); setRowPage(1); setRowFilter("all"); setRowQuery(""); };
  const prepare = async () => {
    if (!kind || getStudentOperationBlockReason({ busy, unavailable, actorAvailable, count: selected.size }) || !actor) return;
    const problems = getStudentOperationProblems({ kind, targetGroupId: targetGroup, education }, catalogue.groups, new Date().toISOString());
    if (problems.length) { setPreview(null); setValidationRequest((value) => value + 1); setError(""); return; }
    setBusy(true); setError("");
    try { const action: StudentBulkAction = kind === "transfer" ? { kind, groupId: targetGroup } : { kind }; const next = await accountService.previewStudentOperation({ actorId: currentUser.id, actorRevision: actor.revision, accountIds: [...selected], action, education }); setPreview(next); setRowFilter("all"); setRowQuery(""); setRowPage(1); }
    catch (failure) { console.error("Не удалось проверить выбранных студентов:", failure); setError(failure instanceof Error ? failure.message : "Не удалось подготовить предпросмотр."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || blocked || stale || preview.errors || !preview.changed) return;
    setBusy(true); setError("");
    try { const outcome = await accountService.applyStudentOperation({ actorId: currentUser.id, actorRevision: preview.actorRevision, expectedRevision: preview.expectedRevision, expectedGroupRevision: preview.groupRevision, batchId, fingerprint: preview.fingerprint, request: preview.request }); setKind(null); setPreview(null); setSelected(new Set()); setPendingReceipt(outcome.receipt); setRowPage(1); setRowFilter("all"); setRowQuery(""); }
    catch (failure) { console.error("Не удалось изменить выбранных студентов:", failure); setError(failure instanceof Error ? failure.message : "Не удалось применить пакет. Записи не изменены частично."); }
    finally { setBusy(false); }
  };
  const returnToRegistry = () => requestAction(() => { setKind(null); setPreview(null); setPendingReceipt(null); setBatchId(""); setError(""); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("batch"); return next; }); });
  const openReceipt = (id: string) => requestAction(() => { setKind(null); setPreview(null); setPendingReceipt(null); setError(""); setRowPage(1); setRowFilter("all"); setRowQuery(""); setParams((previous) => { const next = new URLSearchParams(previous); next.set("batch", id); return next; }); });
  const reviewing = Boolean(kind || preview || receipt || params.has("batch"));

  return <div className={`pageContainer ${styles.page}`}>
    {(kind || preview || receipt || selected.size > 0) && <WorkflowSteps labels={["Выбор", "Проверка", "Результат"]} current={receipt ? 2 : preview ? 1 : 0} />}
    <div className={styles.topline}>{reviewing ? <button type="button" disabled={busy} onClick={returnToRegistry}>← К реестру студентов</button> : <><p>Студенты · {listing.totalStudents}</p><div className={styles.actions}><Link to={`/admin/accounts?create=student${activeGroup ? `&group=${encodeURIComponent(activeGroup.id)}` : ""}`}>Добавить студента</Link><Link to={`/admin/accounts/import${activeGroup ? `?group=${encodeURIComponent(activeGroup.id)}` : ""}`}>Загрузить список</Link></div></>}</div>
    {sourceError && <div className={styles.error} role="alert"><p>{sourceError}</p><button type="button" disabled={busy} onClick={() => { refreshAccounts(); catalogue.refresh(); setReload((value) => value + 1); }}>Повторить чтение</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {reviewing ? <>
      <header className={styles.header}><h2 ref={headingRef} tabIndex={-1}>{receipt ? "Результат массового действия" : preview ? "Проверьте изменения студентов" : kind ? actionLabels[kind] : "Пакет не найден"}</h2><p>{receipt ? `${actionLabels[receipt.action.kind]} · ${dateLabel(receipt.occurredAt)} · ${byId.get(receipt.actorId)?.name ?? "Настройщик"}` : `Выбрано студентов: ${preview?.request.targets.length ?? selected.size}. Проверьте параметры и список перед применением.`}</p></header>
      {params.has("batch") && !receipt && !kind && !preview ? <p className={styles.empty}>Пакет недоступен. Проверьте ссылку или вернитесь в реестр.</p> : receipt ? <><div className={styles.summary}><div><span>Выбрано</span><strong>{receipt.rows.length}</strong></div><div><span>Изменено</span><strong>{receipt.rows.filter((row) => row.outcome === "changed").length}</strong></div><div><span>Без изменений</span><strong>{receipt.rows.filter((row) => row.outcome === "unchanged").length}</strong></div></div><p className={styles.note}>Результат сохранён. Повторная отправка этого пакета не выполнит действие второй раз.</p></> : preview ? <>
        <div className={styles.summary}><div><span>Будет изменено</span><strong>{preview.changed}</strong></div><div><span>Без изменений</span><strong>{preview.unchanged}</strong></div><div><span>Ошибки</span><strong>{preview.errors}</strong></div></div>
        {stale && <p className={styles.error} role="alert">Учётки, группы или права изменились. Обновите предпросмотр и проверьте список ещё раз.</p>}
        {!preview.changed && !preview.errors && <p className={styles.note}>Для всех выбранных студентов это действие уже выполнено.</p>}
      </> : kind && <StudentOperationForm parameters={{ kind, targetGroupId: targetGroup, education }} groups={catalogue.groups} count={selected.size} busy={busy} unavailable={unavailable} actorAvailable={actorAvailable} validationRequest={validationRequest} onGroup={(value) => { setTargetGroup(value); setError(""); }} onEducation={(value) => { setEducation(value); setError(""); }} onPrepare={() => void prepare()} onCancel={returnToRegistry} />}
      {(receipt?.education || preview?.request.education) && <EducationEventSummary value={(receipt?.education ?? preview?.request.education)!} />}
      {preview && <BatchActionBar ref={actionsRef} title={`Будет изменено студентов: ${preview.changed} из ${preview.request.targets.length}`} hint={getBatchApplyHint({ busy, blocked, stale, errors: preview.errors, changed: preview.changed })} label={busy ? "Применяем…" : `${actionLabels[preview.request.action.kind]} (${preview.changed})`} disabled={blocked || stale || Boolean(preview.errors) || !preview.changed} onApply={() => void apply()}><button type="button" disabled={blocked} onClick={() => { setPreview(null); setError(""); }}>К параметрам</button><button type="button" disabled={blocked} onClick={() => void prepare()}>Обновить проверку</button></BatchActionBar>}
      {(receipt || preview) && <StudentOperationReview receipt={receipt} preview={preview} accounts={byId} filter={rowFilter} query={rowQuery} page={rowPage} onFilter={setRowFilter} onQuery={setRowQuery} onPage={setRowPage} actionsRef={preview ? actionsRef : undefined} />}
    </> : <>
      {selectionNotice && <p className={styles.notice} role="status">{selectionNotice}</p>}
      {selected.size > 0 && <section className={styles.selection} aria-label="Выбранные студенты">
        <div><strong>Выбрано студентов: {selected.size}</strong><p>{selected.size ? `На текущей странице: ${pageSelection.onPage} · На других: ${pageSelection.offPage}. Выбор сохраняется при переходе по страницам.` : "Отметьте студентов для перевода, выпуска или отчисления."}</p></div>
        {selected.size > 0 && <>
          <div className={styles.selectionTools}><Dropdown label="Действие с выбранными" value={selectedAction} options={Object.entries(actionLabels).map(([value, label]) => ({ value, label }))} onChange={(value) => setSelectedAction(value as StudentBulkAction["kind"])} disabled={blocked} /><button className={styles.primary} type="button" disabled={blocked || loading || Boolean(readError) || selected.size > MAX_STUDENT_BULK_TARGETS} onClick={() => startAction(selectedAction)}>Продолжить ({selected.size})</button></div>
          <SelectedStudents selected={selected} accounts={byId} disabled={blocked} onRemove={(id) => toggle(id, false)} />
          <div className={styles.unlockFilters}><p>Чтобы изменить поиск, порядок или фильтры, сначала снимите выбор. Лимит — {MAX_STUDENT_BULK_TARGETS} студентов.</p><button type="button" disabled={blocked} onClick={unlockFilters}>Снять выбор и изменить фильтры</button></div>
        </>}
      </section>}
      <fieldset ref={filtersRef} disabled={blocked || Boolean(selected.size)} className={styles.filtersBox} aria-label="Поиск и фильтры реестра">
      <div className={styles.search}><SearchField label="Поиск студента" placeholder="" value={query.q} onChange={(value) => filter("q", value)} /><Dropdown disabled={blocked || Boolean(selected.size)} label="Порядок студентов" value={query.sort} options={[{ value: "name", label: "По ФИО" }, { value: "group", label: "По группе" }, { value: "number", label: "По номеру зачетки" }]} onChange={(value) => filter("sort", value)} /></div>
      <div className={styles.filters}><Dropdown disabled={blocked || Boolean(selected.size)} searchable label="Учебная группа" value={query.group} options={[{ value: "all", label: "Все группы" }, ...catalogue.groups.map((group) => ({ value: group.id, label: `${group.name}${isGroupActive(group) ? "" : " · В архиве"}` }))]} onChange={(value) => filter("group", value)} placeholder="" /><Dropdown disabled={blocked || Boolean(selected.size)} label="Состояние обучения" value={query.enrollment} options={[{ value: "all", label: "Все состояния" }, ...Object.entries(STUDENT_ENROLLMENT_LABELS).map(([value, label]) => ({ value, label }))]} onChange={(value) => filter("enrollment", value)} /></div><details className={styles.extraFilters} aria-label="Дополнительные фильтры"><summary>Дополнительные фильтры{[query.access, query.campus, query.year].some((value) => value !== "all") ? " · включены" : ""}</summary><div className={styles.filters}><Dropdown disabled={blocked || Boolean(selected.size)} label="Доступ к кабинету" value={query.access} options={[{ value: "all", label: "Любой доступ" }, { value: "active", label: "Открыт" }, { value: "blocked", label: "Заблокирован" }]} onChange={(value) => filter("access", value)} /><Dropdown disabled={blocked || Boolean(selected.size)} label="Корпус зачетки" value={query.campus} options={[{ value: "all", label: "Все корпуса" }, ...CAMPUSES, { value: "unknown", label: "Зачетка не выдана" }]} onChange={(value) => filter("campus", value)} /><Dropdown disabled={blocked || Boolean(selected.size)} label="Год выдачи зачетки" value={query.year} options={[{ value: "all", label: "Все годы" }, ...listing.years.map((year) => ({ value: String(year), label: String(year) })), { value: "unknown", label: "Зачетка не выдана" }]} onChange={(value) => filter("year", value)} /></div></details>
      </fieldset>
      {readError && <div className={styles.error} role="alert">{readError}<button type="button" onClick={() => setReload((value) => value + 1)}>Повторить чтение</button></div>}
      <div className={styles.resultLine}><Checkbox label="Выбрать эту страницу" checked={pageSelected} disabled={loading || blocked || Boolean(readError) || !listing.rows.length || !pageSelection.canToggle} onChange={togglePage} /><p role="status">{loading ? "Загружаем студентов…" : `Найдено: ${listing.total} · ${listing.total ? (listing.page - 1) * REGISTRY_PAGE_SIZE + 1 : 0}–${Math.min(listing.page * REGISTRY_PAGE_SIZE, listing.total)}`}</p>{listing.pages > 1 && <nav className={styles.pagination} aria-label="Страницы реестра студентов"><button type="button" disabled={loading || listing.page === 1} onClick={() => page(listing.page - 1)}>Назад</button><span>{listing.page} / {listing.pages}</span><button type="button" disabled={loading || listing.page === listing.pages} onClick={() => page(listing.page + 1)}>Далее</button></nav>}</div>
      {!pageSelection.canToggle && <p className={styles.note}>Выбор всей страницы превысит лимит {MAX_STUDENT_BULK_TARGETS}. Снимите часть отметок или выберите студентов по одному.</p>}
      {!readError && <div className={styles.rows} aria-busy={loading} aria-label="Реестр студентов">{listing.rows.map((row) => <article className={styles.student} key={row.accountId}><div className={styles.identity}><Checkbox label={`Выбрать: ${row.name}`} checked={selected.has(row.accountId)} disabled={loading || blocked || (!selected.has(row.accountId) && selected.size >= MAX_STUDENT_BULK_TARGETS)} onChange={(value) => toggle(row.accountId, value)} /><strong>{row.name}</strong><span>{row.login}</span><span>{row.email || "Почта не указана"}</span></div><div><Link to={`/admin/groups?group=${encodeURIComponent(row.groupId ?? "")}`}>{row.groupName}{row.groupArchived ? " · В архиве" : ""}</Link><span>{STUDENT_ENROLLMENT_LABELS[row.enrollment]}</span><span>{row.access === "active" ? "Доступ открыт" : "Доступ заблокирован"}</span></div><div><strong>{row.studentNumber ?? "Зачетка не выдана"}</strong><span>{row.year ? `${row.year} · Корпус ${row.campus}` : ""}</span></div><div className={styles.accountLink}><Link to={`/admin/accounts?account=${encodeURIComponent(row.accountId)}`}>Открыть учётку</Link><Link to={`/admin/students/${encodeURIComponent(row.accountId)}/education`}>История обучения</Link></div></article>)}</div>}
      {!loading && !readError && !listing.total && <div className={styles.empty}><strong>Студенты не найдены</strong><p>Измените поиск или фильтры, добавьте студента либо загрузите список.</p><button type="button" disabled={Boolean(selected.size)} onClick={() => { setSelected(new Set()); setParams({}); }}>Сбросить фильтры</button></div>}
    </>}
    {!kind && !preview && state.studentOperations.length > 0 && <details className={styles.history} aria-label="История массовых действий"><summary>История массовых действий · {state.studentOperations.length}</summary><ul>{state.studentOperations.slice(-20).reverse().map((operation) => <li key={operation.id}><Link to={`/admin/students?batch=${encodeURIComponent(operation.id)}`} onClick={(event) => { event.preventDefault(); openReceipt(operation.id); }}>{dateLabel(operation.occurredAt)} · {actionLabels[operation.action.kind]} · Изменено: {operation.rows.filter((row) => row.outcome === "changed").length}</Link></li>)}</ul></details>}
  </div>;
}
