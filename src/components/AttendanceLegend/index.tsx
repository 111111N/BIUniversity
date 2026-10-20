import styles from "./index.module.scss";
import { VisitMarkIcon } from "../ButtonIcons/Icons";

const items = [
  { status: "present", label: "Присутствовал", fill: "var(--ui-success)", ring: "var(--ui-success)" },
  { status: "sick", label: "Уважительная причина", fill: "var(--ui-warning)", ring: "var(--ui-warning)" },
  { status: "absent", label: "Пропуск", fill: "var(--ui-border)", ring: "var(--ui-error)" },
  { status: "unmarked", label: "Не отмечено", fill: "transparent", ring: "color-mix(in srgb, var(--ui-text-secondary) 65%, transparent)" },
];

const AttendanceLegend = () => <ul className={styles.legend} aria-label="Обозначения посещаемости">{items.map((item) => <li key={item.status}><span aria-hidden="true"><VisitMarkIcon size={22} color="var(--ui-dark-primary)" fill={item.fill} color2={item.ring} /></span>{item.label}</li>)}</ul>;
export default AttendanceLegend;
