import ProfileLink from "../ProfileLink";
import { Link, useSearchParams } from "react-router-dom";
import { getAcademicGroup } from "../../data/academicCatalog";
import { getGroupStudentProfiles } from "../../data/studentProfiles";
import { useDashboardUpdate } from "../../data/studentDashboard";
import { useRole } from "../RoleContext";
import SearchField from "../SearchField";
import { matchesSearchText } from "../../domain/search";
import { formatCount } from "../../domain/formatCount";
import styles from "./index.module.scss";

const MyGroup = () => {
  const { currentUser } = useRole();
  const groupId = currentUser.memberships[0]?.groupIds[0];
  const group = getAcademicGroup(groupId);
  const [params, setParams] = useSearchParams();
  const query = params.get("groupQ") ?? "";
  const setQuery = (value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set("groupQ", value); else next.delete("groupQ");
    return next;
  }, { replace: true });
  useDashboardUpdate();
  const members = getGroupStudentProfiles(group?.name ?? "");
  const visible = members.filter((member) => matchesSearchText(member.name, query));

  return <section className={styles.group} aria-labelledby="my-group-title">
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Одногруппники</span><h2 id="my-group-title">Моя группа · {group?.name ?? "—"}</h2><p>Профили и личные сообщения студентам вашей группы.</p></div>
      <strong>{formatCount(members.length, ["студент", "студента", "студентов"])}</strong>
    </header>
    {members.length > 0 && <div className={styles.search}><SearchField label="Поиск по группе" value={query} onChange={setQuery} placeholder="Имя или фамилия" /></div>}
    {query.trim() && <p className={styles.resultCount} role="status">Найдено: {visible.length} из {members.length}</p>}
    <div className={styles.list} data-profile-scroll="group-list">
      {visible.map((member) => <article className={styles.member} key={member.id}>
        <span className={styles.avatar} aria-hidden="true">{member.initials}</span>
        <div className={styles.identity}><strong>{member.name}{member.id === currentUser.id && <small> · это вы</small>}</strong><span>{member.email}</span></div>
        <div className={styles.actions}><ProfileLink to={`/students/${member.id}?groupId=${groupId}`}>Профиль</ProfileLink>{member.id !== currentUser.id && <Link className={styles.message} to={`/messages?student=${member.id}`}>Написать</Link>}</div>
      </article>)}
      {!visible.length && <div className={styles.empty}><p>{members.length ? "По вашему запросу никого не найдено." : "Список группы пока не загружен."}</p>{query && <button type="button" onClick={() => setQuery("")}>Показать всю группу</button>}</div>}
    </div>
  </section>;
};

export default MyGroup;
