import type { HTMLAttributes } from "react";
import styles from "./index.module.scss";

interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "div" | "section" | "article";
}

const Card = ({ as: Element = "div", className, ...props }: CardProps) => (
  <Element {...props} className={`${styles.card}${className ? ` ${className}` : ""}`} />
);

export default Card;
