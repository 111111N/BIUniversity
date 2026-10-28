import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Link from "../../components/ChecksContextLink";
import AdministrationReturnNotice from "../../components/AdministrationReturnNotice";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { accountService, readAccountsState } from "../../data/accountStore";
import { CAMPUSES, getStudentNumberYear } from "../../domain/studentRecord";
import { MAX_IMPORT_CHARACTERS, MAX_IMPORT_ROWS, mapStudentImportRows, parseImportTable, suggestStudentImportMapping, type ImportDelimiter, type StudentImportMapping } from "../../domain/importTable";
import type { StudentImportPreview, StudentImportRequest } from "../../domain/studentImport";
import type { StudentImportReceipt } from "../../domain/studentImportReceipt";
import { matchesSearchText } from "../../domain/search";
import Dropdown from "../../components/Dropdown";
import BatchReviewList from "../../components/BatchWorkflow/ReviewList";
import Tabs from "../../components/Tabs";
import styles from "./index.module.scss";
import { WorkflowSteps, BatchActionBar } from "../../components/BatchWorkflow";
import { getBatchApplyHint, getBatchPage } from "../../components/BatchWorkflow/presentation";
import ColumnMapping from "./ColumnMapping";
import { getImportMappingState } from "./mappingPresentation";
import { isGroupActive } from "../../domain/groupCatalog";
import ImportRowEditor from "./ImportRowEditor";
import { replaceImportRow, type ImportRowDraft } from "./rowEditing";

const emptyMapping: StudentImportMapping = { name: -1, login: -1, group: -1, campus: -1, email: -1 };
const PAGE_SIZE = 20;
const displayDate = (date: string) => new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

export default function StudentImportPage() {
  const { currentUser, accounts, accountError } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const [source, setSource] = useState("");
  const [inputPhase, setInputPhase] = useState<"source" | "mapping">("source");
  const [sourceType, setSourceType] = useState("paste");
  const [fileName, setFileName] = useState("");
  const [delimiter, setDelimiter] = useState<ImportDelimiter>("auto");
  const [encoding, setEncoding] = useState("utf-8");
  const [hasHeader, setHasHeader] = useState(true);
  const [mappingOverride, setMapping] = useState<StudentImportMapping | null>(null);
  const [groupId, setGroupId] = useState(params.get("group") ?? "");
  const [campus, setCampus] = useState<number | null>(null);
  const [preview, setPreview] = useState<StudentImportPreview | null>(null);
  const [reviewedRequest, setReviewedRequest] = useState<StudentImportRequest | null>(null);
  const [batchId, setBatchId] = useState("");
  const [result, setResult] = useState<StudentImportReceipt | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editingRow, setEditingRow] = useState<{ line: number; source: string; initial: ImportRowDraft; errors: string[] } | null>(null);
  const [reviewNotice, setReviewNotice] = useState("");
  const rowButtonRef = useRef<HTMLButtonElement | null>(null);
  const focusLineRef = useRef<number | null>(null);
  const returnFocusRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const actionsRef = useRef<HTMLElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const state = readAccountsState();
  const receipt = result ?? state.studentImports.find((item) => item.id === params.get("batch"));
  const headingState = receipt?.id ?? preview?.fingerprint ?? inputPhase;
  const blocked = busy || reading || Boolean(accountError || catalogue.error || state.error);
  const dirty = Boolean(source.trim() || preview);
  useUnsavedChangesWarning(dirty || busy || reading);
  useEffect(() => { headingRef.current?.focus(); }, [headingState]);
  useEffect(() => {
    if (!editingRow && returnFocusRef.current) {
      returnFocusRef.current = false;
      (rowButtonRef.current?.isConnected ? rowButtonRef.current : headingRef.current)?.focus();
    }
  }, [editingRow]);

  const tableState = useMemo(() => {
    try { return { table: parseImportTable(source, delimiter), error: "" }; }
    catch (failure) { return { table: null, error: failure instanceof Error ? failure.message : "Не удалось разобрать таблицу." }; }
  }, [source, delimiter]);
  const table = tableState.table;
  const mapping = useMemo(() => mappingOverride ?? (hasHeader && table?.records.length ? suggestStudentImportMapping(table.records[0].cells) : emptyMapping), [mappingOverride, hasHeader, table]);
  const mappingState = useMemo(() => getImportMappingState(table, mapping, hasHeader), [table, mapping, hasHeader]);
  const byId = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const stale = Boolean(preview && (preview.expectedRevision !== state.revision || preview.groupRevision !== catalogue.revision || preview.year !== getStudentNumberYear(new Date().toISOString())));
  const filtered = (preview?.rows ?? []).filter((row) => (view === "all" || row.status === view) && matchesSearchText(`${row.line} ${row.name} ${row.login} ${row.groupName} ${row.studentNumber ?? ""}`, query));
  const resultRows = receipt ? [...receipt.created.map((row) => ({ ...row, created: true })), ...receipt.skipped.map((row) => ({ ...row, studentNumber: byId.get(row.accountId)?.studentRecord?.number, created: false }))].sort((a, b) => a.line - b.line) : [];
  const filteredResults = resultRows.filter((row) => { const account = byId.get(row.accountId); return matchesSearchText(`${row.line} ${account?.name ?? ""} ${account?.login ?? ""} ${row.studentNumber ?? ""}`, query); });
  const total = receipt ? filteredResults.length : filtered.length;
  const { start, end } = getBatchPage(total, page, PAGE_SIZE);
  const backHref = params.get("from") === "group" && groupId ? `/admin/groups?group=${encodeURIComponent(groupId)}` : `/admin/accounts?type=student${groupId ? `&group=${encodeURIComponent(groupId)}` : ""}`;

  const invalidate = () => { setPreview(null); setReviewedRequest(null); setBatchId(""); setError(""); setReviewNotice(""); setView("all"); setQuery(""); setPage(1); };
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setReading(true); setError("");
    try {
      if (file.size > MAX_IMPORT_CHARACTERS) throw new Error("Файл больше 2 МБ. Разделите список на несколько файлов.");
      const text = new TextDecoder(encoding, { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes("\0")) throw new Error("Этот файл не является текстовой таблицей. Сохраните его как CSV или вставьте данные из Excel.");
      invalidate(); setSource(text); setMapping(null); setFileName(file.name); setInputPhase("source");
    } catch (failure) { console.error("Не удалось прочитать файл списка студентов:", failure); setError(failure instanceof TypeError ? "Не удалось прочитать кодировку файла. Выберите Windows-1251, сохраните CSV в UTF-8 или вставьте таблицу из Excel." : failure instanceof Error ? failure.message : "Не удалось прочитать файл."); }
    finally { setReading(false); }
  };
  const downloadTemplate = () => {
    try {
      const url = URL.createObjectURL(new Blob(["\uFEFFФИО;Логин;Группа;Корпус;Почта\r\n"], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "students-template.csv"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { console.error("Не удалось скачать шаблон списка студентов:", failure); setError("Не удалось скачать шаблон. Можно вставить таблицу с ФИО и логином напрямую."); }
  };
  const prepare = async () => {
    if (blocked) return;
    setBusy(true); setError(""); setReviewNotice("");
    try {
      if (!table) throw new Error(tableState.error);
      const request = { rows: mapStudentImportRows(table, mapping, hasHeader), defaultGroupId: groupId, defaultCampus: campus };
      const actor = accounts.find((account) => account.id === currentUser.id);
      if (!actor) throw new Error("Учётная запись настройщика недоступна.");
      const next = await accountService.previewStudentsImport({ actorId: currentUser.id, actorRevision: actor.revision, request });
      if (next.previousImport) { setResult(next.previousImport); setSource(""); setPreview(null); setReviewedRequest(null); }
      else { setPreview(next); setReviewedRequest(request); if (!batchId) setBatchId(`import-${crypto.randomUUID()}`); }
      setView("all"); setQuery(""); setPage(1);
    } catch (failure) { console.error("Не удалось подготовить список студентов из формы:", failure); setError(failure instanceof Error ? failure.message : "Не удалось подготовить список."); }
    finally { setBusy(false); }
  };
  const closeRow = () => { returnFocusRef.current = true; setEditingRow(null); setError(""); };
  const openRow = (line: number, button: HTMLButtonElement) => {
    try {
      if (!table || !preview) throw new Error("Проверка списка недоступна. Обновите её.");
      const row = mapStudentImportRows(table, mapping, hasHeader).find((item) => item.line === line);
      const checked = preview.rows.find((item) => item.line === line);
      if (!row || !checked) throw new Error("Строка больше не найдена. Обновите проверку списка.");
      const { name, login, group, campus: rowCampus, email } = row;
      focusLineRef.current = line;
      rowButtonRef.current = button;
      setError(""); setEditingRow({ line, source, initial: { name, login, group, campus: rowCampus, email }, errors: checked.errors });
    } catch (failure) { console.error("Не удалось открыть строку импорта:", failure); setError(failure instanceof Error ? failure.message : "Не удалось открыть строку."); }
  };
  const reviewRow = async (draft: ImportRowDraft) => {
    if (!editingRow || blocked) return;
    setBusy(true); setError("");
    try {
      if (source !== editingRow.source) throw new Error("Исходный список изменился. Вернитесь к проверке и откройте строку заново.");
      const corrected = replaceImportRow(source, delimiter, mapping, hasHeader, editingRow.line, draft);
      const request = { rows: mapStudentImportRows(parseImportTable(corrected, delimiter), mapping, hasHeader), defaultGroupId: groupId, defaultCampus: campus };
      const actor = accounts.find((account) => account.id === currentUser.id);
      if (!actor) throw new Error("Учётная запись настройщика недоступна.");
      const next = await accountService.previewStudentsImport({ actorId: currentUser.id, actorRevision: actor.revision, request });
      const nextBatchId = `import-${crypto.randomUUID()}`;
      if (next.previousImport) { setResult(next.previousImport); setSource(""); setPreview(null); setReviewedRequest(null); }
      else {
        setSource(corrected); setPreview(next); setReviewedRequest(request); setBatchId(nextBatchId);
        setView("all"); setQuery(""); setPage(Math.floor(request.rows.findIndex((row) => row.line === editingRow.line) / PAGE_SIZE) + 1);
        setReviewNotice(`Строка ${editingRow.line} проверена. Весь список пересчитан: ошибок — ${next.errors}, к созданию — ${next.ready}. Учётки ещё не созданы.`);
      }
      returnFocusRef.current = true; setEditingRow(null);
    } catch (failure) { console.error("Не удалось перепроверить исправление строки импорта:", failure); setError(failure instanceof Error ? failure.message : "Не удалось проверить исправление. Введённые данные сохранены в форме."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || !reviewedRequest || blocked || stale || preview.errors || !preview.ready) return;
    setBusy(true); setError("");
    try {
      const outcome = await accountService.importStudents({ actorId: currentUser.id, actorRevision: preview.actorRevision, expectedRevision: preview.expectedRevision, expectedGroupRevision: preview.groupRevision, expectedYear: preview.year, expectedStudentNumbers: preview.rows.filter((row) => row.status === "ready").map((row) => row.studentNumber!), request: reviewedRequest, batchId, fingerprint: preview.fingerprint });
      setResult(outcome.receipt); setSource(""); setPreview(null); setReviewedRequest(null); setQuery(""); setPage(1);
    } catch (failure) { console.error("Не удалось создать студентов из предпросмотра:", failure); setError(failure instanceof Error ? failure.message : "Не удалось создать студентов. Пакет не записан частично."); }
    finally { setBusy(false); }
  };
  // The saved result is addressed only after the form has released its unsaved guard.
  useEffect(() => {
    if (!result || busy || dirty) return;
    if (params.get("batch") === result.id) { setResult(null); return; }
    setParams((previous) => { const next = new URLSearchParams(previous); next.set("batch", result.id); return next; }, { replace: true });
  }, [result, busy, dirty, params, setParams]);
  const reset = () => requestAction(() => { setInputPhase("source"); setFileName(""); setSource(""); setPreview(null); setReviewedRequest(null); setBatchId(""); setResult(null); setError(""); setMapping(null); setQuery(""); setView("all"); setPage(1); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("batch"); return next; }); });

  const editColumns = () => { setPreview(null); setReviewedRequest(null); setReviewNotice(""); setView("all"); setQuery(""); setPage(1); setInputPhase("mapping"); setError(""); };
  const formatSettings = <details className={styles.format}><summary>Дополнительные настройки формата</summary><div className={styles.settings}><Dropdown label="Разделитель столбцов" value={delimiter} options={[{ value: "auto", label: "Определить автоматически" }, { value: "\t", label: "Табуляция (из Excel)" }, { value: ";", label: "Точка с запятой" }, { value: ",", label: "Запятая" }]} onChange={(value) => { invalidate(); setDelimiter(value as ImportDelimiter); setMapping(null); }} disabled={blocked} />{sourceType === "file" && <Dropdown label="Кодировка следующего чтения файла" value={encoding} options={[{ value: "utf-8", label: "UTF-8" }, { value: "windows-1251", label: "Windows-1251" }]} onChange={setEncoding} disabled={blocked} />}</div>{sourceType === "file" && <p className={styles.note}>После смены кодировки выберите файл заново. Уже прочитанный текст не меняется автоматически.</p>}</details>;
  const sourceEditor = <label className={styles.source}>Таблица студентов<textarea ref={editorRef} value={source} maxLength={MAX_IMPORT_CHARACTERS} disabled={blocked} placeholder="" spellCheck={false} onChange={(event) => { invalidate(); setSource(event.target.value); setMapping(null); }} /></label>;

  if (editingRow) return <div className={`pageContainer ${styles.page}`}>
    <ImportRowEditor key={editingRow.line} line={editingRow.line} initial={editingRow.initial} mapping={mapping} groups={catalogue.groups} defaultGroup={catalogue.groups.find((group) => group.id === groupId)?.name ?? ""} defaultCampus={campus} errors={editingRow.errors} busy={busy} disabled={blocked} error={error || catalogue.error || accountError || state.error || ""} onClose={closeRow} onReview={(draft) => void reviewRow(draft)} />
  </div>;

  return <div className={`pageContainer ${styles.page}`}>
    <AdministrationReturnNotice />
    <WorkflowSteps labels={["Источник", "Столбцы", "Проверка", "Результат"]} current={receipt ? 3 : preview ? 2 : inputPhase === "mapping" ? 1 : 0} />
    <div className={styles.topline}><Link to={backHref}>← {params.get("from") === "group" ? "К составу группы" : "К списку студентов"}</Link>{!preview && (receipt || inputPhase === "mapping") && <button type="button" disabled={blocked} onClick={receipt ? reset : () => setInputPhase("source")}>{receipt ? "Новый список" : "К источнику"}</button>}</div>
    {(error || catalogue.error || accountError || state.error) && <p className={styles.error} role="alert">{error || catalogue.error || accountError || state.error}</p>}
    <header className={styles.header}><div><h2 ref={headingRef} tabIndex={-1}>{receipt ? "Результат импорта" : preview ? "Проверьте список студентов" : inputPhase === "mapping" ? "Подготовьте список студентов" : "Импорт студентов"}</h2><p>{receipt ? `Пакет от ${displayDate(receipt.createdAt)} · ${byId.get(receipt.actorId)?.name ?? "Настройщик"}` : preview ? "Сверьте людей, группы и номера зачеток перед созданием учёток." : inputPhase === "mapping" ? "Выберите столбцы и общие значения для списка. Запись в систему начнётся только после проверки." : "Выберите способ загрузки. Можно вставить ячейки из Excel или прочитать CSV."}</p></div></header>
    {preview && reviewNotice && <p className={styles.note} role="status">{reviewNotice}</p>}
    {params.has("batch") && !receipt && !source && !preview ? <div className={styles.empty}><strong>Пакет импорта не найден</strong><p>Проверьте ссылку или начните новый список.</p><button type="button" onClick={reset}>Новый список</button></div> : receipt ? <>
      <div className={styles.summary} role="status"><div><span>Строк в списке</span><strong>{receipt.sourceRowCount}</strong></div><div><span>Создано студентов</span><strong>{receipt.created.length}</strong></div><div><span>Уже были в системе</span><strong>{receipt.skipped.length}</strong></div></div>
      <p className={styles.note}>Результат сохранён. Повторная отправка того же списка не создаст вторые учётки. Номера зачеток присвоены; пароли и приглашения появятся после подключения сервера входа.</p>
    </> : preview ? <>
      <div className={styles.summary}><div><span>Всего строк</span><strong>{preview.rows.length}</strong></div><div><span>Будет создано</span><strong>{preview.ready}</strong></div><div><span>Уже существуют</span><strong>{preview.existing}</strong></div><div className={preview.errors ? styles.invalid : ""}><span>С ошибками</span><strong>{preview.errors}</strong></div></div>
      {stale && <p className={styles.error} role="alert">Учётные записи, группы или год выдачи номеров изменились. Обновите предпросмотр и проверьте номера ещё раз.</p>}
      {!preview.errors && !preview.ready && <p role="status" className={styles.note}>Новых студентов нет. Существующие учётки останутся без изменений.</p>}
    </> : <>
      {inputPhase === "source" ? <section className={styles.sourcePanel} aria-label="Источник списка студентов">
        <fieldset className={styles.methodTabs} disabled={blocked}><Tabs variant="filter" ariaLabel="Способ загрузки списка" items={[{ value: "paste", label: "Вставить из Excel" }, { value: "file", label: "Загрузить CSV" }]} value={sourceType} onChange={setSourceType} /></fieldset>
        {sourceType === "paste" ? <><p className={styles.note}>Скопируйте строки вместе с заголовками и вставьте в поле.</p>{sourceEditor}</> : <>
          <div className={styles.sourceActions}><label className={styles.file}>Выбрать CSV, TSV или TXT<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={blocked} onChange={(event) => void readFile(event)} /></label><span className={styles.note}>{reading ? "Читаем файл…" : fileName ? `Исходный файл: ${fileName}` : source.trim() ? "Используются уже добавленные данные." : "Файл ещё не выбран"}</span></div>
          {source && <details className={styles.format}><summary>Посмотреть и исправить исходный текст</summary>{sourceEditor}</details>}
        </>}
        <div className={styles.sourceActions}><button type="button" disabled={blocked} onClick={downloadTemplate}>Скачать шаблон CSV</button><span className={styles.note}>До {MAX_IMPORT_ROWS} студентов и 2 МБ за раз</span></div>
        {formatSettings}
        {tableState.error && source && <p className={styles.error} role="alert">{tableState.error}</p>}
        <div className={styles.prepareActions}><p className={styles.note}>{source.trim() ? "На следующем шаге проверьте, какие данные в столбцах." : "Добавьте таблицу, чтобы перейти к проверке столбцов."}</p><button type="button" className={styles.primary} disabled={blocked || !source.trim() || !table?.records.length} onClick={() => setInputPhase("mapping")}>Дальше: столбцы</button></div>
      </section> : <>
        {table ? <ColumnMapping table={table} mapping={mapping} hasHeader={hasHeader} disabled={blocked} onHeaderChange={(value) => { invalidate(); setHasHeader(value); setMapping(null); }} onMappingChange={(next) => { invalidate(); setMapping(next); }} /> : <p className={styles.error} role="alert">{tableState.error || "Таблица недоступна. Вернитесь к источнику."}</p>}
        <section className={styles.defaults} aria-label="Общие значения списка"><h3>Если значение не указано в строке</h3><div className={styles.settings}><Dropdown searchable label="Общая группа" value={groupId} options={[{ value: "", label: "Из столбца группы" }, ...catalogue.groups.filter(isGroupActive).map((group) => ({ value: group.id, label: group.name }))]} onChange={(value) => { invalidate(); setGroupId(value); }} disabled={blocked} placeholder="" /><Dropdown label="Общий корпус" value={campus === null ? "" : String(campus)} options={[{ value: "", label: "Из строки или группы" }, ...CAMPUSES]} onChange={(value) => { invalidate(); setCampus(value ? Number(value) : null); }} disabled={blocked} /></div><p className={styles.note}>Значения строки имеют приоритет. Если группа отсутствует в справочнике, сначала создайте её.</p></section>
        {formatSettings}
        <details className={styles.format}><summary>Как обрабатываются совпадения</summary><p className={styles.note}>Существующие учётки импорт не редактирует. Повторяющиеся логины проверяются в таблице и в системе. Совпадение ФИО не объединяет людей.</p></details>
        {mappingState.error && <p className={styles.error} role="alert">{mappingState.error}</p>}
        <div className={styles.prepareActions}><p className={styles.note}>{mappingState.error ? "Исправьте сопоставление перед проверкой." : `Студентов в таблице: ${mappingState.count}. На следующем шаге проверьте ошибки и номера зачеток.`}</p><button type="button" className={styles.primary} disabled={blocked || Boolean(mappingState.error)} onClick={() => void prepare()}>{busy ? "Проверяем…" : `Проверить список (${mappingState.count})`}</button></div>
      </>}
    </>}
    {preview && <BatchActionBar ref={actionsRef} title={`Будет создано студентов: ${preview.ready} из ${preview.rows.length}`} hint={getBatchApplyHint({ busy, blocked, stale, errors: preview.errors, changed: preview.ready })} label={busy ? "Создаём…" : `Создать студентов (${preview.ready})`} disabled={blocked || stale || Boolean(preview.errors) || !preview.ready} onApply={() => void apply()}><button type="button" disabled={blocked} onClick={editColumns}>К столбцам</button><button type="button" disabled={blocked} onClick={() => void prepare()}>Обновить проверку</button></BatchActionBar>}
    {(receipt || preview) && <BatchReviewList searchLabel="Поиск строки импорта" query={query} onQuery={setQuery} total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage} onReset={() => { setQuery(""); setView("all"); }} actionsRef={preview ? actionsRef : undefined} filters={preview ? (
      <Tabs variant="filter" ariaLabel="Строки импорта" items={[{ value: "all", label: "Все", count: preview.rows.length }, { value: "error", label: "Ошибки", count: preview.errors }, { value: "ready", label: "Новые", count: preview.ready }, { value: "existing", label: "Уже есть", count: preview.existing }]} value={view} onChange={(value) => { setView(value); setPage(1); }} />
    ) : undefined}>
      <ol className={styles.rows} aria-label={receipt ? "Результаты создания студентов" : "Предпросмотр строк"}>{receipt ? filteredResults.slice(start, end).map((row) => {
        const account = byId.get(row.accountId);
        return <li className={styles.row} key={row.line}><div><span>Строка {row.line} · {row.created ? "Создан" : "Уже существует"}</span><strong>{account?.name ?? "Учётная запись"}</strong><span>{account?.login}</span></div><div><span>Номер зачетки</span><strong>{row.studentNumber ?? "Не выдан"}</strong></div><Link to={`/admin/accounts?account=${encodeURIComponent(row.accountId)}`}>Открыть учётку</Link></li>;
      }) : filtered.slice(start, end).map((row) => <li className={`${styles.row} ${row.status === "error" ? styles.invalidRow : ""}`} key={row.line}><div><span>Строка {row.line} · {row.status === "ready" ? "Будет создан" : row.status === "existing" ? "Уже существует" : "Ошибка"}</span><strong>{row.name || "ФИО не указано"}</strong><span>{row.login || "Логин не указан"}</span></div><div><span>Группа · корпус</span><strong>{row.groupName || "Не указана"}{row.campus ? ` · ${row.campus}` : ""}</strong><span>{row.email || "Почта не указана"}</span></div><div><span>Номер зачетки</span><strong>{row.studentNumber ?? "—"}</strong></div>{(row.errors.length > 0 || row.warnings.length > 0) && <ul className={styles.issues}>{row.errors.map((issue) => <li className={styles.invalid} key={issue}>{issue}</li>)}{row.warnings.map((issue) => <li key={issue}>{issue}</li>)}</ul>}{row.status === "error" && <button ref={(button) => { if (row.line === focusLineRef.current) rowButtonRef.current = button; }} className={styles.correctRow} type="button" disabled={blocked} aria-label={`Исправить строку ${row.line}`} onClick={(event) => openRow(row.line, event.currentTarget)}>Исправить строку</button>}</li>)}</ol>
    </BatchReviewList>}
    {!preview && (receipt || inputPhase === "source") && state.studentImports.length > 0 && <details className={styles.history}><summary>История импортов · {state.studentImports.length}</summary><ul>{state.studentImports.slice(-20).reverse().map((item) => <li key={item.id}><Link to={`/admin/accounts/import?batch=${encodeURIComponent(item.id)}`} onClick={(event) => { event.preventDefault(); requestAction(() => { setResult(null); setSource(""); setPreview(null); setReviewedRequest(null); setQuery(""); setPage(1); setParams((previous) => { const next = new URLSearchParams(previous); next.set("batch", item.id); return next; }); }); }}>{displayDate(item.createdAt)} · Создано: {item.created.length} · Уже были: {item.skipped.length}</Link></li>)}</ul>{state.studentImports.length > 20 && <p className={styles.note}>Показаны последние 20 пакетов.</p>}</details>}
  </div>;
}
