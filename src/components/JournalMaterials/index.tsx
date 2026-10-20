import FileStorage from "../FileStorage";
import styles from "./index.module.scss";

interface Props {
  subject: { id: string; name: string };
  group: { id: string; name: string };
  readOnly?: boolean;
}

const JournalMaterials = ({ subject, group, readOnly = false }: Props) => <section className={styles.materials} aria-label="Учебные материалы">
  <div className={styles.scopeHint}><strong>Два пространства для учебных файлов</strong><p>Материалы дисциплины доступны всем её группам. Материалы группы — только группе {group.name}. {readOnly ? "Вы можете скачивать файлы; загружает и закрепляет их преподаватель." : "Выберите подходящий раздел перед загрузкой. Задания для сдачи создаются во вкладке «Задания»."}</p></div>
  <FileStorage storageKey={`subject:${subject.id}`} eyebrow="Для всех групп дисциплины" title="Конспекты и материалы" description={`Общий фонд по дисциплине «${subject.name}»: книги, конспекты и справочные материалы.`} emptyTitle="Общих материалов пока нет" emptyDescription={readOnly ? "Когда преподаватель добавит файлы по дисциплине, они появятся здесь." : "Загрузите конспект или пособие, которым будут пользоваться все группы этой дисциплины."} readOnly={readOnly} />
  <FileStorage storageKey={`group:${subject.id}:${group.id}`} eyebrow="Только для этой группы" title={`Материалы группы · ${group.name}`} description={`Файлы для группы ${group.name} по дисциплине «${subject.name}».`} emptyTitle="Материалов группы пока нет" emptyDescription={readOnly ? "Преподаватель ещё не загрузил файлы для вашей группы." : "Добавьте сборник, презентацию или рекомендации для этой группы."} readOnly={readOnly} />
</section>;

export default JournalMaterials;
