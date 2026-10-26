import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useGroupCatalog } from "../../hooks/useGroupCatalog";
import { accountService, readAccountsState } from "../../data/accountStore";
import { CAMPUSES, getStudentNumberYear } from "../../domain/studentRecord";
import { MAX_IMPORT_CHARACTERS, MAX_IMPORT_ROWS, mapStudentImportRows, parseImportTable, suggestStudentImportMapping, type ImportDelimiter, type StudentImportField, type StudentImportMapping } from "../../domain/importTable";
import type { StudentImportPreview, StudentImportRequest } from "../../domain/studentImport";
import type { StudentImportReceipt } from "../../domain/studentImportReceipt";
import { matchesSearchText } from "../../domain/search";
import Dropdown from "../../components/Dropdown";
import SearchField from "../../components/SearchField";
import Checkbox from "../../components/Checkbox";
import Tabs from "../../components/Tabs";
import styles from "./index.module.scss";
import { isGroupActive } from "../../domain/groupCatalog";

const fields: Array<{ value: StudentImportField; label: string; required?: boolean }> = [{ value: "name", label: "ФИО", required: true }, { value: "login", label: "Логин", required: true }, { value: "group", label: "Группа" }, { value: "campus", label: "Корпус" }, { value: "email", label: "Электронная почта" }];
const emptyMapping: StudentImportMapping = { name: -1, login: -1, group: -1, campus: -1, email: -1 };
const PAGE_SIZE = 20;
const displayDate = (date: string) => new Date(date).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" });

export default function StudentImportPage() {
  const { currentUser, accounts, accountError } = useRole();
  const catalogue = useGroupCatalog();
  const { requestAction } = useUnsavedChangesGuard();
  const [params, setParams] = useSearchParams();
  const [source, setSource] = useState("");
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const state = readAccountsState();
  const receipt = result ?? state.studentImports.find((item) => item.id === params.get("batch"));
  const headingState = receipt?.id ?? preview?.fingerprint ?? "source";
  const blocked = busy || reading || Boolean(accountError || catalogue.error || state.error);
  const dirty = Boolean(source.trim() || preview);
  useUnsavedChangesWarning(dirty || busy || reading);
  useEffect(() => { (headingState === "source" ? editorRef.current : headingRef.current)?.focus({ preventScroll: true }); }, [headingState]);

  const tableState = useMemo(() => {
    try { return { table: parseImportTable(source, delimiter), error: "" }; }
    catch (failure) { return { table: null, error: failure instanceof Error ? failure.message : "Не удалось разобрать таблицу." }; }
  }, [source, delimiter]);
  const table = tableState.table;
  const mapping = mappingOverride ?? (hasHeader && table?.records.length ? suggestStudentImportMapping(table.records[0].cells) : emptyMapping);
  const columnCount = Math.max(0, ...(table?.records.map((row) => row.cells.length) ?? []));
  const columnOptions = Array.from({ length: columnCount }, (_, index) => ({ value: String(index), label: `${index + 1}. ${(table?.records[0]?.cells[index] || `Столбец ${index + 1}`).slice(0, 60)}` }));
  const byId = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const stale = Boolean(preview && (preview.expectedRevision !== state.revision || preview.groupRevision !== catalogue.revision || preview.year !== getStudentNumberYear(new Date().toISOString())));
  const filtered = (preview?.rows ?? []).filter((row) => (view === "all" || row.status === view) && matchesSearchText(`${row.line} ${row.name} ${row.login} ${row.groupName} ${row.studentNumber ?? ""}`, query));
  const resultRows = receipt ? [...receipt.created.map((row) => ({ ...row, created: true })), ...receipt.skipped.map((row) => ({ ...row, studentNumber: byId.get(row.accountId)?.studentRecord?.number, created: false }))].sort((a, b) => a.line - b.line) : [];
  const filteredResults = resultRows.filter((row) => { const account = byId.get(row.accountId); return matchesSearchText(`${row.line} ${account?.name ?? ""} ${account?.login ?? ""} ${row.studentNumber ?? ""}`, query); });
  const total = receipt ? filteredResults.length : filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const backHref = params.get("from") === "group" && groupId ? `/admin/groups?group=${encodeURIComponent(groupId)}` : `/admin/accounts?type=student${groupId ? `&group=${encodeURIComponent(groupId)}` : ""}`;

  const invalidate = () => { setPreview(null); setReviewedRequest(null); setBatchId(""); setError(""); setView("all"); setQuery(""); setPage(1); };
  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setReading(true); setError("");
    try {
      if (file.size > MAX_IMPORT_CHARACTERS) throw new Error("Файл больше 2 МБ. Разделите список на несколько файлов.");
      const text = new TextDecoder(encoding, { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes("\0")) throw new Error("Этот файл не является текстовой таблицей. Сохраните его как CSV или вставьте данные из Excel.");
      invalidate(); setSource(text); setMapping(null);
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
    setBusy(true); setError("");
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
  const reset = () => requestAction(() => { setSource(""); setPreview(null); setReviewedRequest(null); setBatchId(""); setResult(null); setError(""); setMapping(null); setQuery(""); setView("all"); setPage(1); setParams((previous) => { const next = new URLSearchParams(previous); next.delete("batch"); return next; }); });

  return <div className={`pageContainer ${styles.page}`}>
    <div className={styles.topline}><Link to={backHref}>← {params.get("from") === "group" ? "К составу группы" : "К списку студентов"}</Link>{(receipt || preview) && <button type="button" disabled={blocked} onClick={receipt ? reset : () => { setPreview(null); setReviewedRequest(null); setView("all"); setQuery(""); setPage(1); editorRef.current?.focus(); }}>{receipt ? "Новый список" : "Изменить список"}</button>}</div>
    {(error || catalogue.error || accountError || state.error) && <p className={styles.error} role="alert">{error || catalogue.error || accountError || state.error}</p>}
    <header className={styles.header}><div><h2 ref={headingRef} tabIndex={-1}>{receipt ? "Результат импорта" : preview ? "Проверьте список студентов" : "Импорт студентов"}</h2><p>{receipt ? `Пакет от ${displayDate(receipt.createdAt)} · ${byId.get(receipt.actorId)?.name ?? "Настройщик"}` : preview ? "Будут созданы только новые учётки. Строки с ошибками нужно исправить до применения." : "Вставьте таблицу из Excel или выберите CSV. ФИО и логин обязательны; группу и корпус можно задать для всего списка."}</p></div></header>
    {params.has("batch") && !receipt && !source && !preview ? <div className={styles.empty}><strong>Пакет импорта не найден</strong><p>Проверьте ссылку или начните новый список.</p><button type="button" onClick={reset}>Новый список</button></div> : receipt ? <>
      <div className={styles.summary} role="status"><div><span>Строк в списке</span><strong>{receipt.sourceRowCount}</strong></div><div><span>Создано студентов</span><strong>{receipt.created.length}</strong></div><div><span>Уже были в системе</span><strong>{receipt.skipped.length}</strong></div></div>
      <p className={styles.note}>Результат сохранён. Повторная отправка того же списка не создаст вторые учётки. Номера зачеток присвоены; пароли и приглашения появятся после подключения сервера входа.</p>
    </> : preview ? <>
      <div className={styles.summary}><div><span>Всего строк</span><strong>{preview.rows.length}</strong></div><div><span>Будет создано</span><strong>{preview.ready}</strong></div><div><span>Уже существуют</span><strong>{preview.existing}</strong></div><div className={preview.errors ? styles.invalid : ""}><span>С ошибками</span><strong>{preview.errors}</strong></div></div>
      {stale && <p className={styles.error} role="alert">Учётные записи, группы или год выдачи номеров изменились. Обновите предпросмотр и проверьте номера ещё раз.</p>}
      {!preview.errors && !preview.ready && <p role="status" className={styles.note}>Новых студентов нет. Существующие учётки останутся без изменений.</p>}
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={blocked || stale || Boolean(preview.errors) || !preview.ready} onClick={() => void apply()}>{busy ? "Создаём…" : `Создать студентов: ${preview.ready}`}</button><button type="button" disabled={blocked} onClick={() => void prepare()}>Обновить предпросмотр</button><span className={styles.note}>Номера пока не зарезервированы. Список записывается целиком.</span></div>
      <Tabs variant="filter" ariaLabel="Строки импорта" items={[{ value: "all", label: "Все", count: preview.rows.length }, { value: "error", label: "Ошибки", count: preview.errors }, { value: "ready", label: "Новые", count: preview.ready }, { value: "existing", label: "Уже есть", count: preview.existing }]} value={view} onChange={(value) => { setView(value); setPage(1); }} />
    </> : <>
      <div className={styles.sourceActions}><label className={styles.file}>Выбрать CSV или TSV<input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" disabled={blocked} onChange={(event) => void readFile(event)} /></label><button type="button" disabled={blocked} onClick={downloadTemplate}>Скачать шаблон</button><span className={styles.note}>До {MAX_IMPORT_ROWS} студентов и 2 МБ за раз</span></div>
      <label className={styles.source}>Таблица студентов<textarea ref={editorRef} value={source} maxLength={MAX_IMPORT_CHARACTERS} disabled={blocked} placeholder="" spellCheck={false} onChange={(event) => { invalidate(); setSource(event.target.value); setMapping(null); }} /></label>
      <details className={styles.format}><summary>Формат таблицы</summary><div className={styles.settings}><Dropdown label="Разделитель столбцов" value={delimiter} options={[{ value: "auto", label: "Определить автоматически" }, { value: "\t", label: "Табуляция (из Excel)" }, { value: ";", label: "Точка с запятой" }, { value: ",", label: "Запятая" }]} onChange={(value) => { invalidate(); setDelimiter(value as ImportDelimiter); setMapping(null); }} disabled={blocked} /><Dropdown label="Кодировка файла" value={encoding} options={[{ value: "utf-8", label: "UTF-8" }, { value: "windows-1251", label: "Windows-1251" }]} onChange={setEncoding} disabled={blocked} /><Checkbox label="Первая строка содержит названия столбцов" checked={hasHeader} disabled={blocked} onChange={(value) => { invalidate(); setHasHeader(value); setMapping(null); }} /></div></details>
      {tableState.error && source && <p className={styles.error} role="alert">{tableState.error}</p>}
      {table && table.records.length > 0 && <section className={styles.mapping} aria-label="Сопоставление столбцов"><h3>Сопоставьте столбцы</h3><p className={styles.note}>Совпадение ФИО не объединяет людей. Повторяющиеся логины проверяются в списке и в системе.</p><div className={styles.mappingFields}>{fields.map((field) => <Dropdown searchable key={field.value} label={`Столбец: ${field.label}${field.required ? " *" : ""}`} value={String(mapping[field.value])} options={[{ value: "-1", label: field.required ? "Не выбран" : "Не использовать" }, ...columnOptions]} onChange={(value) => { invalidate(); setMapping({ ...mapping, [field.value]: Number(value) }); }} disabled={blocked} placeholder="" />)}</div></section>}
      <div className={styles.settings}><Dropdown searchable label="Общая группа" value={groupId} options={[{ value: "", label: "Из столбца группы" }, ...catalogue.groups.filter(isGroupActive).map((group) => ({ value: group.id, label: group.name }))]} onChange={(value) => { invalidate(); setGroupId(value); }} disabled={blocked} placeholder="" /><Dropdown label="Общий корпус" value={campus === null ? "" : String(campus)} options={[{ value: "", label: "Из строки или группы" }, ...CAMPUSES]} onChange={(value) => { invalidate(); setCampus(value ? Number(value) : null); }} disabled={blocked} /></div>
      <p className={styles.note}>Значения в строке имеют приоритет над общими настройками. Новые группы нужно сначала создать в справочнике. Существующие учётки импорт не редактирует.</p>
      <div className={styles.actions}><button type="button" className={styles.primary} disabled={blocked || !source.trim() || !table || mapping.name < 0 || mapping.login < 0} onClick={() => void prepare()}>{reading ? "Читаем файл…" : busy ? "Проверяем…" : "Проверить список"}</button></div>
    </>}
    {(receipt || preview) && <>
      <SearchField label="Поиск строки импорта" placeholder="" value={query} onChange={(value) => { setQuery(value); setPage(1); }} />
      <div className={styles.resultLine}><p role="status">Показано: {total ? start + 1 : 0}–{Math.min(start + PAGE_SIZE, total)} из {total}</p>{pages > 1 && <nav className={styles.pagination} aria-label="Страницы импорта"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Назад</button><span>{currentPage} / {pages}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Далее</button></nav>}</div>
      <ol className={styles.rows} aria-label={receipt ? "Результаты создания студентов" : "Предпросмотр строк"}>{receipt ? filteredResults.slice(start, start + PAGE_SIZE).map((row) => {
        const account = byId.get(row.accountId);
        return <li className={styles.row} key={row.line}><div><span>Строка {row.line} · {row.created ? "Создан" : "Уже существует"}</span><strong>{account?.name ?? "Учётная запись"}</strong><span>{account?.login}</span></div><div><span>Номер зачетки</span><strong>{row.studentNumber ?? "Не выдан"}</strong></div><Link to={`/admin/accounts?account=${encodeURIComponent(row.accountId)}`}>Открыть учётку</Link></li>;
      }) : filtered.slice(start, start + PAGE_SIZE).map((row) => <li className={`${styles.row} ${row.status === "error" ? styles.invalidRow : ""}`} key={row.line}><div><span>Строка {row.line} · {row.status === "ready" ? "Будет создан" : row.status === "existing" ? "Уже существует" : "Ошибка"}</span><strong>{row.name || "ФИО не указано"}</strong><span>{row.login || "Логин не указан"}</span></div><div><span>Группа · корпус</span><strong>{row.groupName || "Не указана"}{row.campus ? ` · ${row.campus}` : ""}</strong><span>{row.email || "Почта не указана"}</span></div><div><span>Номер зачетки</span><strong>{row.studentNumber ?? "—"}</strong></div>{(row.errors.length > 0 || row.warnings.length > 0) && <ul className={styles.issues}>{row.errors.map((issue) => <li className={styles.invalid} key={issue}>{issue}</li>)}{row.warnings.map((issue) => <li key={issue}>{issue}</li>)}</ul>}</li>)}</ol>
      {!total && <div className={styles.empty}>Строки не найдены. Измените поиск или фильтр.</div>}
    </>}
    {state.studentImports.length > 0 && <details className={styles.history}><summary>История импортов · {state.studentImports.length}</summary><ul>{state.studentImports.slice(-20).reverse().map((item) => <li key={item.id}><Link to={`/admin/accounts/import?batch=${encodeURIComponent(item.id)}`} onClick={(event) => { event.preventDefault(); requestAction(() => { setResult(null); setSource(""); setPreview(null); setReviewedRequest(null); setQuery(""); setPage(1); setParams((previous) => { const next = new URLSearchParams(previous); next.set("batch", item.id); return next; }); }); }}>{displayDate(item.createdAt)} · Создано: {item.created.length} · Уже были: {item.skipped.length}</Link></li>)}</ul>{state.studentImports.length > 20 && <p className={styles.note}>Показаны последние 20 пакетов.</p>}</details>}
  </div>;
}
