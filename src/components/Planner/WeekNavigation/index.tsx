import { useEffect, useState, type RefObject } from "react";
import { format, isSameDay } from "date-fns";
import { ru } from "date-fns/locale";
import { toLocalDateKey } from "../../../domain/schedule";
import styles from "./index.module.scss";

interface Props { days: Date[]; counts: number[]; selectedKey: string; boardRef: RefObject<HTMLDivElement | null>; view: "board" | "list"; onSelect(day: Date): void }

const WeekNavigation = ({ days, counts, selectedKey, boardRef, view, onSelect }: Props) => {
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      const next = { overflow: view === "board" && board.scrollWidth > board.clientWidth + 2, left: board.scrollLeft > 2, right: board.scrollLeft + board.clientWidth < board.scrollWidth - 2 };
      setScroll((current) => current.overflow === next.overflow && current.left === next.left && current.right === next.right ? current : next);
    };
    update();
    board.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(board);
    return () => { board.removeEventListener("scroll", update); window.removeEventListener("resize", update); observer?.disconnect(); };
  }, [boardRef, view, days]);
  const move = (direction: number) => {
    const board = boardRef.current;
    if (!board) return;
    board.scrollBy({ left: board.clientWidth * .8 * direction, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return <nav className={styles.navigation} aria-label="Дни недели планировщика">
    <div className={styles.days}>{days.map((day, index) => <button type="button" key={toLocalDateKey(day)} className={`${styles.day} ${selectedKey === toLocalDateKey(day) ? styles.selected : ""} ${isSameDay(day, new Date()) ? styles.today : ""}`} aria-pressed={selectedKey === toLocalDateKey(day)} aria-label={`${format(day, "EEEE, d MMMM", { locale: ru })}. Задач: ${counts[index]}`} title={`Перейти к ${format(day, "d MMMM", { locale: ru })}`} onClick={() => onSelect(day)}><span>{format(day, "EEEEEE", { locale: ru })}</span><strong>{format(day, "d")}</strong>{counts[index] > 0 && <small>{counts[index]}</small>}</button>)}</div>
    {scroll.overflow && <div className={styles.scrollTools}><span>Листайте или тяните мышью</span><button type="button" disabled={!scroll.left} aria-label="Предыдущие дни" title="Предыдущие дни" onClick={() => move(-1)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M16 10H4m5-5-5 5 5 5" /></svg></button><button type="button" disabled={!scroll.right} aria-label="Следующие дни" title="Следующие дни" onClick={() => move(1)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg></button></div>}
  </nav>;
};

export default WeekNavigation;
