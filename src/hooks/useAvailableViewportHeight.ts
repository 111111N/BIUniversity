import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";

// Высота считается от начала страницы, чтобы прокрутка окна не растягивала саму сетку.
const useAvailableViewportHeight = (targetRef: RefObject<HTMLElement | null>, enabled: boolean) => {
  const measure = useCallback(() => {
    if (!enabled) return;
    const target = targetRef.current;
    const page = target?.closest<HTMLElement>(".pageContainer");
    if (!target || !page || !target.getClientRects().length) return;
    try {
      let bottomSpacing = parseFloat(getComputedStyle(page).paddingBottom) || 0;
      for (let parent = target.parentElement; parent && parent !== page; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        bottomSpacing += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0) + (parseFloat(style.marginBottom) || 0);
      }
      const offset = Math.ceil(Math.max(0, target.getBoundingClientRect().top - page.getBoundingClientRect().top) + bottomSpacing);
      const value = `${offset}px`;
      if (target.style.getPropertyValue("--workspace-viewport-offset") !== value) target.style.setProperty("--workspace-viewport-offset", value);
    } catch (error) { console.error("Не удалось рассчитать доступную высоту рабочей области:", error); }
  }, [enabled, targetRef]);

  useLayoutEffect(measure);
  useEffect(() => {
    if (!enabled) return;
    const page = targetRef.current?.closest(".pageContainer");
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (page) observer?.observe(page);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [enabled, measure, targetRef]);
};

export default useAvailableViewportHeight;
