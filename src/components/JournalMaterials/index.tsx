import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { materialRepository } from "../../data/materialRepository";
import FileStorage from "../FileStorage";
import Tabs from "../Tabs";
import styles from "./index.module.scss";

interface Props {
  subject: { id: string; name: string };
  group: { id: string; name: string };
  readOnly?: boolean;
}

const JournalMaterials = ({ subject, group, readOnly = false }: Props) => {
  const [params, setParams] = useSearchParams();
  const scope = params.get("materials") === "group" ? "group" : "subject";
  const subjectKey = `subject:${subject.id}`;
  const groupKey = `group:${subject.id}:${group.id}`;
  const [counts, setCounts] = useState<{ subject?: number; group?: number }>({});
  const [countError, setCountError] = useState(false);
  useEffect(() => {
    let active = true;
    let request = 0;
    setCounts({});
    const load = async () => {
      const version = ++request;
      try {
        const [subjectCount, groupCount] = await Promise.all([materialRepository.count(subjectKey), materialRepository.count(groupKey)]);
        if (active && version === request) { setCounts({ subject: subjectCount, group: groupCount }); setCountError(false); }
      } catch (error) {
        console.error("Не удалось получить количество учебных материалов:", error);
        if (active && version === request) { setCounts({}); setCountError(true); }
      }
    };
    void load();
    const unsubscribeSubject = materialRepository.subscribe(subjectKey, () => { void load(); });
    const unsubscribeGroup = materialRepository.subscribe(groupKey, () => { void load(); });
    return () => { active = false; unsubscribeSubject(); unsubscribeGroup(); };
  }, [subjectKey, groupKey]);
  const changeScope = (value: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === "subject") next.delete("materials"); else next.set("materials", "group");
    return next;
  });
  const common = scope === "subject";
  return <section className={styles.materials} aria-label="Учебные материалы">
    <Tabs ariaLabel="Область учебных материалов" value={scope} onChange={changeScope} items={[{ value: "subject", label: "Дисциплина", count: counts.subject }, { value: "group", label: "Группа", count: counts.group }]} />
    <p className={styles.audience}>{common ? "Видят все группы дисциплины" : `Видит только группа ${group.name}`}{readOnly ? " · Загрузку выполняет преподаватель" : " · Новые файлы попадут в выбранный раздел"}</p>
    {countError && <p className={styles.countError} role="status">Количество файлов пока недоступно. Состояние загрузки — в библиотеке ниже.</p>}
    <FileStorage key={common ? subjectKey : groupKey} storageKey={common ? subjectKey : groupKey} eyebrow={common ? "Для всех групп дисциплины" : "Только для этой группы"} title={common ? "Конспекты и материалы" : `Материалы группы · ${group.name}`} description={`Дисциплина «${subject.name}». Файлы хранятся в этом браузере.`} emptyTitle={common ? "Общих материалов пока нет" : "Материалов группы пока нет"} emptyDescription={readOnly ? "Когда преподаватель добавит файлы, они появятся здесь." : "Добавьте конспекты, презентации или рекомендации для выбранной аудитории."} readOnly={readOnly} />
  </section>;
};

export default JournalMaterials;
