import type { ButtonHTMLAttributes } from "react";
import ArrowIcon from "../ArrowIcon";
import styles from "./index.module.scss";

interface ArrowButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  label: string;
  direction?: "up" | "down" | "left" | "right";
}

const ArrowButton = ({ label, direction = "right", className, type = "button", title = label, ...props }: ArrowButtonProps) => (
  <button {...props} type={type} aria-label={label} title={title} className={`${styles.button}${className ? ` ${className}` : ""}`}>
    <ArrowIcon direction={direction} size={18} />
  </button>
);

export default ArrowButton;
