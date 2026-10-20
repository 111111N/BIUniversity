import type { CSSProperties } from "react";
import styles from "./index.module.scss";

interface ChevronIconProps {
  size?: number;
  color?: string;
  direction?: "up" | "down" | "left" | "right";
  className?: string;
}

const ROTATION = { down: 0, left: 90, up: 180, right: -90 };

const ChevronIcon = ({ size = 16, color = "currentColor", direction = "down", className = "" }: ChevronIconProps) => (
  <span
    className={`${styles.icon} ${className}`}
    style={{ "--chevron-size": `${size}px`, "--chevron-color": color, "--chevron-rotation": `${ROTATION[direction]}deg` } as CSSProperties}
    aria-hidden="true"
  >
    <svg viewBox="0 0 16 16" focusable="false"><path d="m3.5 6 4.5 4 4.5-4" /></svg>
  </span>
);

export default ChevronIcon;
