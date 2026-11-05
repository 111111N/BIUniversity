import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import type { PlannerNote } from "../../data/plannerStore";
import { createPlannerTaskDrag, PLANNER_DRAG_TYPE } from "./taskDrag";

export const usePlannerTaskDrag = (root: RefObject<HTMLElement | null>, scope: string, enabled: boolean, onMove: (note: PlannerNote, target: Date) => void) => {
  const session = useRef<ReturnType<typeof createPlannerTaskDrag> | null>(null);
  const [target, setTarget] = useState<{ scope: string; day: string } | null>(null);
  const lastScroll = useRef(0);
  const clear = () => { session.current?.cancel(); session.current = null; setTarget(null); };
  useEffect(() => {
    const stop = () => { session.current?.cancel(); session.current = null; setTarget(null); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") stop(); };
    const onVisibility = () => { if (document.hidden) stop(); };
    stop();
    window.addEventListener("blur", stop);
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      session.current?.cancel(); session.current = null;
      window.removeEventListener("blur", stop);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [scope, enabled]);
  return {
    targetDay: enabled && target?.scope === scope ? target.day : null,
    clear,
    start(event: DragEvent<HTMLButtonElement>, note: PlannerNote) {
      clear();
      if (!enabled) { event.preventDefault(); return; }
      try {
        const token = crypto.randomUUID();
        event.dataTransfer.clearData();
        event.dataTransfer.setData(PLANNER_DRAG_TYPE, token);
        event.dataTransfer.effectAllowed = "move";
        session.current = createPlannerTaskDrag(note, scope, token);
        event.currentTarget.focus({ preventScroll: true });
      } catch (error) {
        event.preventDefault(); clear();
        console.error("Не удалось начать перенос задачи. Используйте пункт «Перенести» в меню:", error);
      }
    },
    over(event: DragEvent<HTMLElement>, day: string) {
      if (!enabled || !session.current?.accepts(scope, day, Array.from(event.dataTransfer.types))) { setTarget(null); return; }
      event.preventDefault(); event.dataTransfer.dropEffect = "move";
      if (target?.day !== day || target.scope !== scope) setTarget({ scope, day });
      const board = root.current;
      if (!board || board.scrollWidth <= board.clientWidth || Date.now() - lastScroll.current < 40) return;
      const bounds = board.getBoundingClientRect();
      const direction = event.clientX < bounds.left + 48 ? -1 : event.clientX > bounds.right - 48 ? 1 : 0;
      if (direction) { board.scrollBy({ left: direction * 32, behavior: "auto" }); lastScroll.current = Date.now(); }
    },
    leave(event: DragEvent<HTMLElement>) {
      if (!event.relatedTarget || !(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTarget(null);
    },
    drop(event: DragEvent<HTMLElement>, day: string) {
      const gesture = session.current;
      if (!enabled || !gesture) { clear(); return; }
      try {
        const date = gesture.drop(scope, day, event.dataTransfer);
        clear();
        if (!date) return;
        event.preventDefault(); event.stopPropagation();
        onMove(gesture.note, date);
      } catch (error) { clear(); console.error("Не удалось перенести задачу перетаскиванием:", error); }
    },
  };
};
