import type { CSSProperties } from "react";
import ArrowIcon from "../ArrowIcon";
import styles from "./index.module.scss";

interface ArrowCircleProps {
  direction?: "up" | "down" | "left" | "right";
  color?: string;
  hoverColor?: string;
  hoverBackground?: string;
  className?: string;
}

const ArrowCircle = ({ direction = "right", color, hoverColor, hoverBackground, className = "" }: ArrowCircleProps) => (
  <span
    className={`${styles.circle} ${styles[direction]} ${className}`}
    style={{
      "--arrow-circle-color": color === "inherit" ? "currentColor" : color,
      // В custom property `inherit` наследует саму переменную, а не цвет текста.
      "--arrow-circle-hover-color": hoverColor === "inherit" ? "currentColor" : hoverColor,
      "--arrow-circle-hover-background": hoverBackground,
    } as CSSProperties}
    aria-hidden="true"
  >
    <ArrowIcon size={18} direction={direction} />
  </span>
);

export default ArrowCircle;
