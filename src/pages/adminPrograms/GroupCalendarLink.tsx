import { Link } from "react-router-dom";
export default function GroupCalendarLink({ groupId }: { groupId: string }) {
  return <Link to={`/admin/calendars?group=${encodeURIComponent(groupId)}`}>Календарь группы</Link>;
}
