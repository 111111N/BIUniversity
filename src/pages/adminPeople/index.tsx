import { useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import Card from "../../components/Card";
import SearchField from "../../components/SearchField";
import RecordEditor, { RecordEditorActions } from "../../components/RecordEditor";
import { useRole } from "../../components/RoleContext";
import { useUnsavedChangesGuard } from "../../components/UnsavedChangesProvider";
import useUnsavedChangesWarning from "../../hooks/useUnsavedChangesWarning";
import usePeopleQuery from "../../hooks/usePeopleQuery";
import { accountService } from "../../data/accountStore";
import { ACCOUNT_ROLE_LABELS, type AccountCommandContext } from "../../domain/accounts";
import type { Person } from "../../domain/personTypes";
import styles from "./index.module.scss";

interface Draft { name: string; source: string; value: string }
interface Editor { person?: Person; draft: Draft; initial: Draft; context: AccountCommandContext }
function PeopleWorkspace({ actorId }: { actorId: string }) {
  const [query, setQuery] = useState(""), [page, setPage] = useState(1), [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const pending = useRef(false), fieldId = useId();
  const { requestAction } = useUnsavedChangesGuard();
  const source = usePeopleQuery(actorId, editor?.person ? "" : query, page, editor?.person?.id);
  const snapshot = source.snapshot;
  const dirty = Boolean(editor && JSON.stringify(editor.draft) !== JSON.stringify(editor.initial));
  useUnsavedChangesWarning(dirty || busy);
  const stale = Boolean(editor && snapshot && (snapshot.revision !== editor.context.expectedRevision || snapshot.actorRevision !== editor.context.actorRevision));
  const locked = busy || source.loading || Boolean(source.error) || stale;
  const close = () => { if (!busy) requestAction(() => { setEditor(null); setError(""); }); };
  const open = (person?: Person) => {
    if (!snapshot) return;
    const draft = { name: person?.name ?? query.trim(), source: person?.externalReference?.source ?? "", value: person?.externalReference?.value ?? "" };
    setError(""); setMessage("");
    setEditor({ person, draft, initial: { ...draft }, context: { actorId, actorRevision: snapshot.actorRevision, expectedRevision: snapshot.revision } });
  };
  const patch = (field: keyof Draft, value: string) => { setError(""); setEditor(previous => previous ? { ...previous, draft: { ...previous.draft, [field]: value } } : previous); };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!editor || locked || pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const draft = { name: editor.draft.name, ...(editor.draft.source.trim() || editor.draft.value.trim() ? { externalReference: { source: editor.draft.source.trim(), value: editor.draft.value.trim() } } : {}) };
      const person = await accountService.savePerson(editor.person ? { ...editor.context, type: "update", personId: editor.person.id, personRevision: editor.person.revision, draft } : { ...editor.context, type: "create", draft });
      setEditor(null); setMessage(`Сохранено: ${person.name}.`);
    } catch (failure) { console.error("Не удалось сохранить карточку человека:", failure); setError(failure instanceof Error ? failure.message : "Не удалось сохранить человека. Ввод сохранён."); }
    finally { pending.current = false; setBusy(false); }
  };
  const valid = Boolean(editor && editor.draft.name.trim().length >= 2 && editor.draft.name.trim().length <= 120 && Boolean(editor.draft.source.trim()) === Boolean(editor.draft.value.trim()));
  return <div className={`pageContainer ${styles.page}`}>
    <Link to="/admin/accounts">К учётным записям</Link>
    {source.error && <p className={styles.error} role="alert">{source.error} <button type="button" onClick={source.refresh}>Повторить чтение</button></p>}
    {message && <p role="status">{message}</p>}
    {source.loading && <p role="status">Загрузка реестра людей…</p>}
    {editor ? <RecordEditor title={editor.person ? editor.person.name : "Новый человек"} context="Карточка человека существует независимо от входа в систему" dirty={dirty} busy={busy} onClose={close}>
      {stale && <p className={styles.error} role="alert">Реестр или права изменились. Ввод сохранён. Закройте форму и откройте актуальную карточку перед сохранением.</p>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <form className={styles.form} onSubmit={event => void save(event)}>
        <fieldset disabled={locked} className={styles.form}>
          <legend>Данные человека</legend>
          <label className={styles.field} htmlFor={`${fieldId}-name`}>Имя и фамилия<input id={`${fieldId}-name`} required minLength={2} maxLength={120} value={editor.draft.name} onChange={event => patch("name", event.target.value)} /></label>
          <label className={styles.field} htmlFor={`${fieldId}-source`}>Источник внешнего ID (необязательно)<input id={`${fieldId}-source`} maxLength={120} value={editor.draft.source} onChange={event => patch("source", event.target.value)} /></label>
          <label className={styles.field} htmlFor={`${fieldId}-value`}>Внешний ID<input id={`${fieldId}-value`} maxLength={256} value={editor.draft.value} onChange={event => patch("value", event.target.value)} /></label>
          <p className={styles.note}>{editor.person ? "Имя изменится во всех связанных учётных записях. Логины, почта, типы, доступ, зачётки и результаты сохранятся." : "Проверьте результаты поиска перед созданием. Одинаковые имена допустимы; автоматического объединения нет. Учётная запись и вход сейчас не создаются."}</p>
        </fieldset>
        <RecordEditorActions label="Сохранить человека" disabled={locked || !valid || Boolean(editor.person && !dirty)} busy={busy} onCancel={close} />
      </form>
      {editor.person && <><p className={styles.note}>personId: {editor.person.id}{editor.person.legacyAccountId ? " · перенесён из существующей учётной записи" : ""}</p><h3>История человека</h3>{snapshot?.historyTotal ? <><p className={styles.note}>Последние {snapshot.history.length} из {snapshot.historyTotal} событий</p><ol className={styles.history}>{snapshot.history.map(event => <li key={event.id}>{new Date(event.occurredAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} (Москва) · {event.action === "created" ? "Создан" : "Изменён"} · {event.snapshot.name}{event.snapshot.externalReference ? ` · ${event.snapshot.externalReference.source}: ${event.snapshot.externalReference.value}` : ""}</li>)}</ol></> : <p className={styles.note}>Сохранённых событий нет. Ранняя история не восстанавливалась предположениями.</p>}</>}
    </RecordEditor> : <>
      <Card className={styles.toolbar}><SearchField label="Поиск людей по имени, personId или внешнему ID" value={query} onChange={value => { setQuery(value.slice(0, 256)); setPage(1); }} placeholder="" /><div className={styles.actions}><span className={styles.note}>{snapshot ? `Людей: ${snapshot.total}` : ""}</span><button type="button" disabled={!snapshot || source.loading || query.trim().length < 2} onClick={() => open()}>Добавить человека</button></div><p className={styles.note}>Перед добавлением введите имя или ID в поиск и проверьте найденные записи.</p></Card>
      <div className={styles.list}>{snapshot?.items.map(person => <Card key={person.id} className={styles.card}><h2>{person.name}</h2><p className={styles.note}>{person.id}</p>{person.externalReference && <p>{person.externalReference.source}: {person.externalReference.value}</p>}<div className={styles.actions}><button type="button" onClick={() => open(person)}>Карточка человека</button><Link to={`/admin/accounts?create=student&person=${encodeURIComponent(person.id)}`}>Создать учётную запись</Link></div>{snapshot.accounts.some(account => account.personId === person.id) ? <ul>{snapshot.accounts.filter(account => account.personId === person.id).map(account => <li key={account.id}><Link to={`/admin/accounts?account=${encodeURIComponent(account.id)}`}>{ACCOUNT_ROLE_LABELS[account.role]} · {account.login}</Link></li>)}</ul> : <p className={styles.note}>Учётных записей нет. Вход не создан.</p>}</Card>)}</div>
      {snapshot && !snapshot.total && <Card>Люди по заданным условиям не найдены.</Card>}
      {snapshot && <nav className={styles.actions} aria-label="Страницы людей"><button type="button" disabled={snapshot.page <= 1 || source.loading} onClick={() => setPage(value => value - 1)}>Назад</button><span>{snapshot.page} / {snapshot.pages}</span><button type="button" disabled={snapshot.page >= snapshot.pages || source.loading} onClick={() => setPage(value => value + 1)}>Далее</button></nav>}
    </>}
  </div>;
}
export default function AdminPeople() { const { currentUser } = useRole(); return <PeopleWorkspace key={currentUser.id} actorId={currentUser.id} />; }
