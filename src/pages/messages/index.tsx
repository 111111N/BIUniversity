import { useSearchParams } from "react-router-dom";
import Messages from "../../components/Messages";
import styles from "./index.module.scss";
import { useRole } from "../../components/RoleContext";

const MessagesPage = () => {
  const [searchParams] = useSearchParams();
  const { role, currentUser } = useRole();
  const contactId = searchParams.get("contact") ?? searchParams.get("student");
  return <div className={`pageContainer ${styles.page}`}><Messages key={`${role}:${currentUser.id}:${contactId ?? ""}`} initialContactId={contactId} /></div>;
};
export default MessagesPage;
