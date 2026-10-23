import { useEffect, useState } from "react";
import { subscribeManagedSchedule } from "../data/managedScheduleStore";

export default function useManagedScheduleUpdate() {
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeManagedSchedule(() => setRevision((value) => value + 1)), []);
  return revision;
}
