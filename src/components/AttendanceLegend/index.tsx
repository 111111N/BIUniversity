import styles from "./index.module.scss";
import { VisitMarkIcon } from "../ButtonIcons/Icons";

const items = [
  { status: "present", label: "Присутствовал", fill: "var(--journal-present)", ring: "var(--journal-present-ring)" },
  { status: "sick", label: "Уважительная причина", fill: "transparent", ring: "var(--journal-sick)" },
  { status: "absent", label: "Пропуск", fill: "var(--journal-absent)", ring: "var(--journal-outline)" },
  { status: "unmarked", label: "Не отмечено", fill: "transparent", ring: "color-mix(in srgb, var(--ui-text-secondary) 65%, transparent)" },
];

const AttendanceLegend = () => <ul className={styles.legend} aria-label="Обозначения посещаемости">{items.map((item) => <li key={item.status}><span aria-hidden="true"><VisitMarkIcon size={22} color="var(--ui-dark-primary)" fill={item.fill} color2={item.ring} showInner={item.status !== "sick"} /></span>{item.label}</li>)}</ul>;
export default AttendanceLegend;
