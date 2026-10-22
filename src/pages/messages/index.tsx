import { useLocation, useSearchParams } from "react-router-dom";
import Messages from "../../components/Messages";
import styles from "./index.module.scss";
import { useRole } from "../../components/RoleContext";

const MessagesPage = () => {
  const [searchParams] = useSearchParams();
  const { role, currentUser } = useRole();
  const contactId = searchParams.get("contact") ?? searchParams.get("student");
  const areas = useLocation().state?.restoreAreas;
  const readingArea = Array.isArray(areas) ? areas.find((area) => area && area.key === "message-thread" && typeof area.top === "number" && Number.isFinite(area.top) && area.top >= 0) : undefined;
  return <div className={`pageContainer ${styles.page}`}><Messages key={`${role}:${currentUser.id}:${contactId ?? ""}`} initialContactId={contactId} initialThreadTop={readingArea?.top} /></div>;
};
export default MessagesPage;
