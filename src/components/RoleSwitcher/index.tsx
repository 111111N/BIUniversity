import { useNavigate } from "react-router-dom";
import { useRole, UserRole } from "../RoleContext";
import styles from "./index.module.scss";
import DemoDataManager from "../DemoDataManager";
import { useUnsavedChangesGuard } from "../UnsavedChangesProvider";

const roles: Array<{ value: UserRole; label: string }> = [
  { value: "teacher", label: "Преподаватель" },
  { value: "student", label: "Студент" },
];

const RoleSwitcher = () => {
  const { role, setRole } = useRole();
  const navigate = useNavigate();
  const { requestAction } = useUnsavedChangesGuard();

  const selectRole = (nextRole: UserRole) => {
    if (nextRole === role) return;
    requestAction(() => {
      setRole(nextRole);
      navigate("/");
    });
  };

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Демо-режим</span>
      <div className={styles.switcher} aria-label="Роль пользователя">
        {roles.map((item) => (
          <button
            key={item.value}
            type="button"
            className={role === item.value ? styles.active : ""}
            aria-pressed={role === item.value}
            onClick={() => selectRole(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <DemoDataManager />
    </div>
  );
};

export default RoleSwitcher;
