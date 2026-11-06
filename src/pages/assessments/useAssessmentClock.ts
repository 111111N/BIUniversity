import { useEffect, useState } from "react";

/** Re-evaluate a scheduled opening without requiring a page reload. Domain checks remain authoritative. */
export default function useAssessmentClock() {
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => { const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000); return () => window.clearInterval(timer); }, []);
  return now;
}
