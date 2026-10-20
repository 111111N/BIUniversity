import { Fragment, type ReactNode } from "react";
import styles from "./index.module.scss";

const highlight = (text: string, query: string): ReactNode => {
  if (!query.trim()) return text;
  const fold = (value: string) => value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
  const source = fold(text);
  const ranges: Array<[number, number]> = [];
  for (const needle of new Set(fold(query).trim().split(/\s+/))) {
    let index = source.indexOf(needle);
    while (index >= 0) { ranges.push([index, index + needle.length]); index = source.indexOf(needle, index + needle.length); }
  }
  const merged: Array<[number, number]> = [];
  ranges.sort((a, b) => a[0] - b[0]).forEach(([start, end]) => {
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  });
  const result: ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([start, end]) => { result.push(text.slice(cursor, start), <mark key={start} className={styles.match}>{text.slice(start, end)}</mark>); cursor = end; });
  result.push(text.slice(cursor));
  return result;
};

export default function MessageText({ text, query = "", linkify = true }: { text: string; query?: string; linkify?: boolean }) {
  if (!linkify) return <>{highlight(text, query)}</>;
  return <>{text.split(/(https?:\/\/[^\s<>]+)/gi).map((part, index) => /^https?:\/\//i.test(part)
    ? <a key={index} className={styles.link} href={part} target="_blank" rel="noopener noreferrer">{highlight(part, query)}</a>
    : <Fragment key={index}>{highlight(part, query)}</Fragment>)}</>;
}
