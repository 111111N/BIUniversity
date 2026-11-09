import type { ButtonHTMLAttributes } from "react";
import styles from "./index.module.scss";

const PickerButton = ({ className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button {...props} type={type} className={`${styles.button}${className ? ` ${className}` : ""}`} />
);

export default PickerButton;
