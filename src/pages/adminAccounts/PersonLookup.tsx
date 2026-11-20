import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SearchField from "../../components/SearchField";
import { useRole } from "../../components/RoleContext";
import usePeopleQuery from "../../hooks/usePeopleQuery";
import type { AccountDraft } from "../../domain/accounts";
import type { Person } from "../../domain/personTypes";
import styles from "../adminPeople/index.module.scss";

export default function PersonLookup({ draft, disabled, onChange }: { draft: AccountDraft; disabled: boolean; onChange(patch: Partial<AccountDraft>): void }) {
  const { currentUser } = useRole(); const [params] = useSearchParams();
  const [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [prefillId, setPrefillId] = useState(() => params.get("person") || undefined);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);
  const source = usePeopleQuery(currentUser.id, draft.personId ? "" : query, page, draft.personId || prefillId);
  useEffect(() => {
    const person = source.snapshot?.items.find(row => row.id === prefillId);
    if (!draft.personId && person && !disabled) { change.current({ personId: person.id, name: person.name }); setPrefillId(undefined); }
  }, [source.snapshot, prefillId, draft.personId, disabled]);
  const choose = (person: Person) => { onChange({ personId: person.id, name: person.name }); setPage(1); setPrefillId(undefined); };
  return <fieldset disabled={disabled} className={styles.lookup}>
    <legend>Человек для учётной записи</legend>
    {draft.personId ? <><p><strong>{draft.name}</strong></p><p className={styles.note}>personId: {draft.personId}</p><button type="button" onClick={() => { onChange({ personId: undefined, name: "" }); setPage(1); }}>Выбрать другого человека</button>{source.snapshot && source.snapshot.items[0]?.name !== draft.name && <p role="alert">Имя человека изменилось. Выберите запись заново.</p>}</> : <>
      <SearchField label="Найти человека по имени или внешнему ID" value={query} onChange={value => { setQuery(value.slice(0, 256)); setPage(1); setPrefillId(undefined); }} placeholder="" />
      {source.snapshot && <><p className={styles.note}>Найдено: {source.snapshot.total}. Совпадение имени не означает, что это один человек.</p><div className={styles.list}>{source.snapshot.items.map(person => <button className={styles.choice} type="button" key={person.id} onClick={() => choose(person)}><strong>{person.name}</strong><span>{person.externalReference ? `${person.externalReference.source}: ${person.externalReference.value}` : person.id}</span><span>Учётных записей: {source.snapshot!.accounts.filter(account => account.personId === person.id).length}</span></button>)}</div><div className={styles.actions}><button type="button" disabled={source.snapshot.page <= 1} onClick={() => setPage(value => value - 1)}>Назад</button><span>{source.snapshot.page} / {source.snapshot.pages}</span><button type="button" disabled={source.snapshot.page >= source.snapshot.pages} onClick={() => setPage(value => value + 1)}>Далее</button></div></>}
      <Link to="/admin/people">Открыть реестр людей и добавить нового человека</Link>
    </>}
    {source.loading && <p role="status">Загрузка людей…</p>}
    {source.error && <p role="alert">{source.error} <button type="button" onClick={source.refresh}>Повторить чтение</button></p>}
  </fieldset>;
}
