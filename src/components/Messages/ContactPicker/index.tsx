import { useId, useState } from "react";
import { matchesSearchText } from "../../../domain/search";
import type { MessagingContact } from "../../../domain/messaging";
import Modal from "../../Modal";
import SearchField from "../../SearchField";
import DialogListItem from "../DialogListItem";
import MessageActionIcon from "../MessageActionIcon";
import styles from "./index.module.scss";

interface Props { people: MessagingContact[]; suggested: MessagingContact[]; onSelect(contact: MessagingContact): void; onCreateGroup(): void; onClose(): void }
export default function ContactPicker({ people, suggested, onSelect, onCreateGroup, onClose }: Props) {
  const id = useId();
  const [kind, setKind] = useState<"student" | "teacher">("student");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const list = (query.trim() || showAll ? people : suggested).filter((contact) => contact.kind === kind && matchesSearchText(`${contact.name} ${contact.subtitle}`, query));
  return <Modal labelledBy={id} onClose={onClose} className={styles.dialog}><header><div><span>Университет рядом</span><h2 id={id}>Новый диалог</h2></div><button type="button" onClick={onClose} aria-label="Закрыть"><MessageActionIcon name="close" /></button></header>
    <button type="button" className={styles.createGroup} onClick={onCreateGroup}><MessageActionIcon name="group" /><span><strong>Создать беседу</strong><small>Студенты и преподаватели в одном чате</small></span><MessageActionIcon name="next" /></button>
    <SearchField label="Найти человека" value={query} onChange={setQuery} placeholder="Имя, группа или кафедра" />
    <div className={styles.filters} role="group" aria-label="Категория людей"><button type="button" aria-pressed={kind === "student"} onClick={() => setKind("student")}>Студенты</button><button type="button" aria-pressed={kind === "teacher"} onClick={() => setKind("teacher")}>Преподаватели</button></div>
    <p className={styles.hint}>{query.trim() || showAll ? "Каталог университета" : "Сначала люди из ваших учебных групп и дисциплин"}</p>
    <div className={styles.list}>{list.map((contact) => <DialogListItem key={contact.id} contact={contact} active={false} onClick={() => onSelect(contact)} />)}{!list.length && <p className={styles.empty}>Никого не найдено. Измените запрос или категорию.</p>}</div>
    {!query.trim() && <button type="button" className={styles.all} onClick={() => setShowAll((value) => !value)}>{showAll ? "Только связанные с вами" : "Показать весь каталог"}</button>}
  </Modal>;
}
