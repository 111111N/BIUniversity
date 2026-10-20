import type { CSSProperties } from "react";
import styles from "./index.module.scss";

interface ArrowIconProps {
  size?: number;
  color?: string;
  direction?: "up" | "down" | "left" | "right";
  className?: string;
}

const ROTATION = { right: 0, down: 90, left: 180, up: -90 };

const ArrowIcon = ({ size = 18, color = "currentColor", direction = "right", className = "" }: ArrowIconProps) => (
  <span
    className={`${styles.icon} ${className}`}
    style={{ "--arrow-size": `${size}px`, "--arrow-color": color, "--arrow-rotation": `${ROTATION[direction]}deg` } as CSSProperties}
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" focusable="false"><path d="M5 12H19M19 12L12 5M19 12L12 19" /></svg>
  </span>
);

export default ArrowIcon;
