import { useNavigate } from "react-router-dom";
import { useRole } from "../RoleContext";
import { ACCOUNT_ROLE_LABELS, isAccountActive } from "../../domain/accounts";
import Dropdown from "../Dropdown";
import styles from "./index.module.scss";
import DemoDataManager from "../DemoDataManager";
import { useUnsavedChangesGuard } from "../UnsavedChangesProvider";

const RoleSwitcher = () => {
  const { currentUser, accounts, selectAccount, accountError } = useRole();
  const navigate = useNavigate();
  const { requestAction } = useUnsavedChangesGuard();

  const selectDemoAccount = (id: string) => {
    if (id === currentUser.id) return;
    requestAction(() => {
      selectAccount(id);
      navigate("/");
    });
  };

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>Демо-режим</span>
      <Dropdown label="Демонстрационная учётная запись" searchable hideLabel value={currentUser.id} options={accounts.filter(isAccountActive).map((account) => ({ value: account.id, label: `${account.name} · ${ACCOUNT_ROLE_LABELS[account.role]}`, searchText: account.login }))} onChange={selectDemoAccount} disabled={Boolean(accountError)} />
      {accountError && <p className={styles.error} role="alert">{accountError}</p>}
      <DemoDataManager />
    </div>
  );
};

export default RoleSwitcher;
