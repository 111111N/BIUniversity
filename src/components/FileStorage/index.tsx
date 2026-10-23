import { ChangeEvent, useEffect, useId, useRef, useState } from "react";
import { getPersonalMaterialScope, materialRepository, type StoredMaterial } from "../../data/materialRepository";
import { formatFileSize, MAX_ATTACHMENT_SIZE } from "../../domain/files";
import { matchesSearchText } from "../../domain/search";
import { changesMaterialScope } from "../../domain/unsavedNavigation";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import { useFileView } from "../../hooks/useLibraryView";
import Checkbox from "../Checkbox";
import ConfirmDialog from "../ConfirmDialog";
import Dropdown from "../Dropdown";
import SearchField from "../SearchField";
import ArrowIcon from "../ArrowIcon";
import MaterialCard from "./MaterialCard";
import FilePreview from "../FilePreview";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";

interface FileStorageProps {
  storageKey?: string;
  title?: string;
  description?: string;
  eyebrow?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  readOnly?: boolean;
}

const FILE_CATEGORIES = ["Книга", "Конспект", "Сборник заданий", "Презентация", "Другое"];
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

const FileStorage = ({
  storageKey: requestedStorageKey,
  title = "Мои файлы",
  description = "Материалы сохраняются в этом браузере до подключения серверного хранилища.",
  eyebrow = "Локальное хранилище",
  emptyTitle,
  emptyDescription,
  readOnly = false,
}: FileStorageProps) => {
  const { currentUser } = useRole();
  const storageKey = requestedStorageKey ?? getPersonalMaterialScope(currentUser.id);
  const headingId = useId();
  const uploadId = useId();
  const descriptionId = useId();
  const [files, setFiles] = useState<StoredMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [category, setCategory] = useState(FILE_CATEGORIES[0]);
  const { category: categoryFilter, query, sort, change: changeView } = useFileView();
  const [materialDescription, setMaterialDescription] = useState("");
  const [pinned, setPinned] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<StoredMaterial | null>(null);
  const [previewFile, setPreviewFile] = useState<StoredMaterial | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const reloadRef = useRef<() => void>(() => {});
  const scopeVersion = useRef(0);
  const mutationLock = useRef(false);
  const busy = uploading || deleting || Boolean(pinningId);
  useUnsavedChangesWarning(!readOnly && (uploading || selectedFiles.length > 0 || (uploadOpen && Boolean(materialDescription.trim() || pinned))), changesMaterialScope);
  const emptyHeading = emptyTitle ?? (readOnly ? "Материалов пока нет" : "Загрузите первый файл");
  const emptyHint = emptyDescription ?? (readOnly ? "Когда преподаватель добавит материалы, они появятся в этом разделе." : "Конспекты, ведомости, презентации и учебные материалы");
  const hasFilters = categoryFilter !== "Все" || Boolean(query.trim());
  const visibleFiles = files
    .filter((file) => (categoryFilter === "Все" || (file.category ?? "Материал") === categoryFilter) && matchesSearchText([file.name, file.description, file.category, file.uploadedBy].filter(Boolean).join(" "), query))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || (sort === "name" ? a.name.localeCompare(b.name, "ru-RU") : sort === "size" ? b.size - a.size : b.createdAt - a.createdAt));
  const availableCategories = ["Все", ...Array.from(new Set([...files.map((file) => file.category ?? "Материал"), ...(categoryFilter !== "Все" ? [categoryFilter] : [])]))];
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    scopeVersion.current += 1;
    mutationLock.current = false;
    setFiles([]);
    setLoadError("");
    setError("");
    setMessage("");
    setSelectedFiles([]);
    setUploadOpen(false);
    setUploading(false);
    setDeleting(false);
    setPinningId(null);
    setPendingDelete(null);
    setPreviewFile(null);
    setMaterialDescription("");
    setPinned(false);
    const load = () => {
      const request = ++requestId;
      setLoading(true);
      setLoadError("");
      materialRepository.list(storageKey)
        .then((items) => { if (active && request === requestId) setFiles(items); })
        .catch((error: unknown) => {
          console.error("Не удалось загрузить материалы выбранного раздела:", error);
          if (active && request === requestId) setLoadError("Не удалось открыть материалы. Проверьте доступ к хранилищу браузера; если открыты другие вкладки сайта, закройте их и повторите загрузку.");
        })
        .finally(() => { if (active && request === requestId) setLoading(false); });
    };
    reloadRef.current = load;
    load();
    const unsubscribe = materialRepository.subscribe(storageKey, load);
    return () => { active = false; scopeVersion.current += 1; unsubscribe(); reloadRef.current = () => {}; };
  }, [storageKey]);

  useEffect(() => {
    if (readOnly) { setUploadOpen(false); setPendingDelete(null); }
  }, [readOnly]);

  const resetFilters = () => changeView({ query: "", category: "Все" });
  const selectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (readOnly || busy || !picked.length) return;
    const valid = picked.filter((file) => file.size <= MAX_ATTACHMENT_SIZE);
    const rejected = picked.length - valid.length;
    setSelectedFiles((current) => [...current, ...valid.filter((file, index) => !current.some((existing) => sameFile(existing, file)) && valid.findIndex((other) => sameFile(other, file)) === index)]);
    setError(rejected ? "Файлы больше 25 МБ не добавлены: " + rejected + "." + (valid.length ? " Остальные готовы к загрузке." : " Выберите файлы меньшего размера.") : "");
    setMessage("");
  };

  const uploadFiles = async () => {
    if (readOnly || mutationLock.current || !selectedFiles.length) return;
    mutationLock.current = true;
    const version = scopeVersion.current;
    const queue = [...selectedFiles];
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const results = await Promise.allSettled(queue.map(async (file) => {
        const storedFile: StoredMaterial = {
          id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size,
          createdAt: Date.now(), blob: file, scope: storageKey, category,
          uploadedBy: currentUser.name, description: materialDescription.trim() || undefined, pinned,
        };
        await materialRepository.save(storedFile);
      }));
      if (version !== scopeVersion.current) return;
      results.forEach((result, index) => {
        if (result.status === "rejected") console.error("Не удалось сохранить материал:", queue[index].name, result.reason);
      });
      const failed = queue.filter((_, index) => results[index].status === "rejected");
      const saved = queue.length - failed.length;
      setSelectedFiles(failed);
      if (saved) {
        resetFilters();
        setMessage("Материалы добавлены: " + saved + ". Они доступны в этом разделе.");
        reloadRef.current();
      }
      if (failed.length) setError("Не удалось загрузить файлов: " + failed.length + ". Они остались в списке — повторите загрузку. Уже добавленные файлы повторно не загружаются.");
      else { setMaterialDescription(""); setPinned(false); setUploadOpen(false); }
    } finally {
      if (version === scopeVersion.current) { setUploading(false); mutationLock.current = false; }
    }
  };

  const deleteFile = async (id: string) => {
    const file = files.find((item) => item.id === id);
    if (!file || readOnly || mutationLock.current) return;
    mutationLock.current = true;
    const version = scopeVersion.current;
    setDeleting(true);
    setDeleteError("");
    try {
      await materialRepository.remove(id, storageKey);
      if (version !== scopeVersion.current) return;
      setFiles((current) => current.filter((item) => item.id !== id));
      setPendingDelete(null);
      setMessage("Материал удалён.");
      setError("");
      reloadRef.current();
    } catch (error) {
      console.error("Не удалось удалить выбранный материал:", error);
      if (version === scopeVersion.current) setDeleteError("Не удалось удалить материал. Повторите попытку.");
    } finally {
      if (version === scopeVersion.current) { setDeleting(false); mutationLock.current = false; }
    }
  };

  const togglePinned = async (file: StoredMaterial) => {
    if (readOnly || mutationLock.current) return;
    mutationLock.current = true;
    const version = scopeVersion.current;
    setPinningId(file.id);
    setError("");
    try {
      const updated = await materialRepository.setPinned(file.id, !file.pinned, storageKey);
      if (version !== scopeVersion.current) return;
      setFiles((current) => current.map((item) => item.id === file.id ? updated : item));
      setMessage(updated.pinned ? "Материал закреплён в начале списка." : "Материал откреплён.");
    } catch (error) {
      console.error("Не удалось изменить закрепление выбранного материала:", error);
      if (version === scopeVersion.current) setError("Не удалось изменить закрепление материала. Повторите действие на карточке.");
    } finally {
      if (version === scopeVersion.current) { setPinningId(null); mutationLock.current = false; }
    }
  };

  return <section className={styles.storage} aria-labelledby={headingId}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>{eyebrow}</span><h2 id={headingId}>{title}</h2><p>{description}</p></div>
      {!readOnly && <button type="button" className={styles.uploadButton} disabled={busy} aria-expanded={uploadOpen} aria-controls={uploadId} onClick={() => setUploadOpen((current) => !current)}><ArrowIcon direction="up" size={16} />{uploadOpen ? "Свернуть загрузку" : "Добавить материалы"}</button>}
    </header>

    {!readOnly && <div id={uploadId} hidden={!uploadOpen}>
      {uploadOpen && <div className={styles.uploadPanel}>
        <div className={styles.uploadHeading}><strong>Новые материалы</strong><span>Выберите файлы, заполните общие настройки и подтвердите загрузку.</span></div>
        <div className={styles.uploadFields}>
          <Dropdown label="Категория" disabled={busy} value={category} onChange={setCategory} options={FILE_CATEGORIES.map((item) => ({ value: item, label: item }))} />
          <label className={styles.descriptionField} htmlFor={descriptionId}>Описание · необязательно<input id={descriptionId} disabled={busy} value={materialDescription} placeholder="Чем полезны эти материалы" onChange={(event) => setMaterialDescription(event.target.value)} /></label>
        </div>
        <div className={styles.uploadOptions}><Checkbox label="Закрепить в начале списка" checked={pinned} disabled={busy} onChange={setPinned} /><span>Категория и описание применятся ко всем выбранным файлам.</span></div>
        <div className={styles.fileSelection}><button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>Выбрать файлы</button><span>До 25 МБ каждый · можно выбрать несколько</span></div>
        <input ref={inputRef} hidden disabled={busy} type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip,.png,.jpg,.jpeg" aria-label="Файлы материалов" onChange={selectFiles} />
        {selectedFiles.length > 0 && <><ul className={styles.selectedFiles}>{selectedFiles.map((file, index) => <li key={file.name + ":" + file.lastModified + ":" + file.size}><div><strong>{file.name}</strong><span>{formatFileSize(file.size)}</span></div><button type="button" disabled={busy} aria-label={"Убрать файл " + file.name} onClick={() => setSelectedFiles((current) => current.filter((_, position) => position !== index))}>Убрать</button></li>)}</ul><div className={styles.uploadFooter}><span>Выбрано: {selectedFiles.length} · {formatFileSize(selectedFiles.reduce((sum, file) => sum + file.size, 0))}</span><button type="button" disabled={busy} className={styles.uploadButton} onClick={() => { void uploadFiles(); }}>{uploading ? "Загружаем…" : "Загрузить материалы"}</button></div></>}
      </div>}
    </div>}

    {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="Скрыть сообщение об ошибке">Скрыть</button></div>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {loadError && <div className={styles.error} role="alert"><span>{loadError}</span><button type="button" onClick={() => reloadRef.current()}>Повторить загрузку</button></div>}
    {loading && <div className={styles.loading} role="status"><span className={styles.loadingDot} aria-hidden="true" />{files.length ? "Обновляем список материалов…" : "Загружаем материалы…"}</div>}

    {(files.length > 0 || hasFilters) && <>
      <div className={styles.libraryTools}><SearchField label="Поиск материалов" value={query} onChange={(query) => changeView({ query })} placeholder="Название, описание или автор" /><Dropdown label="Порядок в списке" value={sort} onChange={(value) => changeView({ sort: value as typeof sort })} options={[{ value: "date", label: "Сначала новые" }, { value: "name", label: "По названию" }, { value: "size", label: "По размеру" }]} /></div>
      <div className={styles.categoryFilters} role="group" aria-label="Категории материалов">{availableCategories.map((item) => <button type="button" aria-pressed={categoryFilter === item} className={categoryFilter === item ? styles.categoryActive : ""} onClick={() => changeView({ category: item })} key={item}>{item}<span>{item === "Все" ? files.length : files.filter((file) => (file.category ?? "Материал") === item).length}</span></button>)}</div>
      <div className={styles.resultsSummary}><span>{hasFilters ? "Найдено: " + visibleFiles.length + " из " + files.length : "Материалов: " + files.length + " · " + formatFileSize(totalSize)}</span><span>{hasFilters ? <button type="button" onClick={resetFilters}>Сбросить фильтры</button> : "Закреплённые — в начале"}</span></div>
      {visibleFiles.length ? <div className={styles.fileList}>{visibleFiles.map((file) => <MaterialCard key={file.id} file={file} readOnly={readOnly} busy={busy} pinning={pinningId === file.id} onDownload={() => materialRepository.download(file)} onPreview={() => setPreviewFile(file)} onPin={() => { void togglePinned(file); }} onDelete={() => { setDeleteError(""); setPendingDelete(file); }} />)}</div> : !loading && !loadError && <div className={styles.emptyState}><span className={styles.emptyIcon} aria-hidden="true">⌕</span><strong>Материалы не найдены</strong><p>Попробуйте другое название или покажите все категории.</p><button type="button" onClick={resetFilters}>Показать все материалы</button></div>}
    </>}

    {!loading && !loadError && files.length === 0 && !hasFilters && !uploadOpen && <div className={styles.emptyState}><span className={styles.emptyIcon} aria-hidden="true">{readOnly ? "≡" : <ArrowIcon direction="up" size={22} />}</span><strong>{emptyHeading}</strong><p>{emptyHint}</p></div>}
    {pendingDelete && !readOnly && <ConfirmDialog title="Удалить материал?" busy={deleting} error={deleteError} onCancel={() => setPendingDelete(null)} onConfirm={() => { void deleteFile(pendingDelete.id); }}><p><strong>{pendingDelete.name}</strong></p><p>Файл исчезнет из этого раздела. Восстановить его можно только повторной загрузкой.</p></ConfirmDialog>}
    {previewFile && <FilePreview key={previewFile.id} name={previewFile.name} blob={previewFile.blob} onDownload={() => materialRepository.download(previewFile)} onClose={() => setPreviewFile(null)} />}
  </section>;
};

export default FileStorage;
