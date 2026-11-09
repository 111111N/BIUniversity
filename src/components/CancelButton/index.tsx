import type { ComponentPropsWithRef } from "react";
import styles from "./index.module.scss";

type Props = ComponentPropsWithRef<"button"> & { size?: "default" | "compact" };

const CancelButton = ({ children = "Отмена", className, type = "button", size = "default", ...props }: Props) => (
  <button {...props} type={type} data-size={size} className={`${styles.button}${className ? ` ${className}` : ""}`}>{children}</button>
);

export default CancelButton;
