import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const NavigationScroll = () => {
  const location = useLocation();
  useEffect(() => {
    const saved = location.state?.restoreScroll;
    if (typeof saved !== "number" || !Number.isFinite(saved)) return;
    let frame = 0;
    const deadline = performance.now() + 2000;
    const restoreAreas = () => {
      const areas = location.state?.restoreAreas;
      if (!Array.isArray(areas)) return;
      const elements = [...document.querySelectorAll<HTMLElement>("[data-profile-scroll]")];
      areas.forEach((area) => {
        if (!area || typeof area.key !== "string" || !Number.isFinite(area.top) || !Number.isFinite(area.left)) return;
        elements.find((element) => element.dataset.profileScroll === area.key)?.scrollTo({ top: area.top, left: area.left, behavior: "instant" });
      });
    };
    const restore = () => {
      if (!document.querySelector('.page-loader') && document.documentElement.scrollHeight >= saved + window.innerHeight) {
        window.scrollTo({ top: Math.max(0, saved), behavior: "instant" });
        restoreAreas();
      } else if (performance.now() < deadline) frame = requestAnimationFrame(restore);
      else { window.scrollTo({ top: Math.max(0, saved), behavior: "instant" }); restoreAreas(); }
    };
    frame = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(frame);
  }, [location]);
  return null;
};

export default NavigationScroll;
