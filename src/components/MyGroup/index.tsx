import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAcademicGroup } from "../../data/academicCatalog";
import { getGroupStudentProfiles } from "../../data/studentProfiles";
import { useRole } from "../RoleContext";
import styles from "./index.module.scss";

const MyGroup = () => {
  const { currentUser } = useRole();
  const groupId = currentUser.memberships[0]?.groupIds[0];
  const group = getAcademicGroup(groupId);
  const [query, setQuery] = useState("");
  const members = useMemo(() => getGroupStudentProfiles(group?.name ?? ""), [group?.name]);
  const visible = members.filter((member) => member.name.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")));
  const countWord = members.length % 10 === 1 && members.length % 100 !== 11 ? "студент" : members.length % 10 >= 2 && members.length % 10 <= 4 && (members.length % 100 < 12 || members.length % 100 > 14) ? "студента" : "студентов";

  return <section className={styles.group} aria-labelledby="my-group-title">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Одногруппники</span><h2 id="my-group-title">Моя группа · {group?.name ?? "—"}</h2><p>Профили и личные сообщения студентам вашей группы.</p></div>
      <strong>{members.length} {countWord}</strong>
    </header>
    {members.length > 0 && <label className={styles.search}>Поиск по группе<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или фамилия" /></label>}
    <div className={styles.list}>
      {visible.map((member) => <article className={styles.member} key={member.id}>
        <span className={styles.avatar} aria-hidden="true">{member.initials}</span>
        <div className={styles.identity}><strong>{member.name}{member.id === currentUser.id && <small> · это вы</small>}</strong><span>{member.email}</span></div>
        <div className={styles.actions}><Link to={`/students/${member.id}`}>Профиль</Link>{member.id !== currentUser.id && <Link className={styles.message} to={`/messages?student=${member.id}`}>Написать</Link>}</div>
      </article>)}
      {!visible.length && <p className={styles.empty}>{members.length ? "По вашему запросу никого не найдено." : "Список группы пока не загружен."}</p>}
    </div>
  </section>;
};

export default MyGroup;
