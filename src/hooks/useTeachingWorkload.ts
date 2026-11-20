import { useCallback, useEffect, useState } from "react";
import { readTeachingWorkload, subscribeTeachingWorkload } from "../data/teachingWorkload";

export default function useTeachingWorkload(teacherId: string) {
  const read = useCallback(() => {
    try { return { teacherId, data: readTeachingWorkload(teacherId), error: "" }; }
    catch (error) { console.error("Не удалось рассчитать нагрузку преподавателя:", error); return { teacherId, error: "Учебная нагрузка недоступна. Проверьте назначения и учебные планы." }; }
  }, [teacherId]);
  const [state, setState] = useState(read);
  useEffect(() => { setState(read()); return subscribeTeachingWorkload(() => setState(read())); }, [read]);
  return state.teacherId === teacherId ? state : null;
}
