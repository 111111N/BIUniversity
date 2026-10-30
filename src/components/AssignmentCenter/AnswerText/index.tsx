import { useId, useState } from "react";
import ArrowCircle from "../../ArrowCircle";
import styles from "./index.module.scss";

interface Props {
  text: string;
  collapsible?: boolean;
  className?: string;
  textClassName?: string;
}

const AnswerText = ({ text, collapsible = true, className = "", textClassName = "" }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const long = collapsible && (text.length > 900 || text.split("\n").length > 8);

  return <div className={`${styles.answer} ${className}`}>
    <p id={textId} className={`${styles.text} ${textClassName} ${long && !expanded ? styles.collapsed : ""}`}>{text || "Ответ без текста"}</p>
    {long && <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((value) => !value)}>
      {expanded ? "Свернуть ответ" : "Читать ответ полностью"}<ArrowCircle direction={expanded ? "up" : "down"} />
    </button>}
  </div>;
};

export default AnswerText;
