import { useLayoutEffect } from "react";

interface BodyScrollLock {
  count: number;
  overflow: string;
  priority: string;
}

const bodyLocks = new Map<HTMLElement, BodyScrollLock>();

// Each overlay releases only its own lock, regardless of closing order.
export const acquireBodyScrollLock = () => {
  if (typeof document === "undefined" || !document.body) return () => {};
  const body = document.body;
  const existing = bodyLocks.get(body);
  const lock = existing ?? { count: 0, overflow: body.style.getPropertyValue("overflow"), priority: body.style.getPropertyPriority("overflow") };
  if (!existing) {
    bodyLocks.set(body, lock);
    body.style.setProperty("overflow", "hidden", lock.priority);
  }
  lock.count += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    lock.count -= 1;
    if (lock.count > 0) return;
    if (lock.overflow) body.style.setProperty("overflow", lock.overflow, lock.priority);
    else body.style.removeProperty("overflow");
    bodyLocks.delete(body);
  };
};

const useBodyScrollLock = (active = true) => {
  useLayoutEffect(() => {
    if (active) return acquireBodyScrollLock();
  }, [active]);
};

export default useBodyScrollLock;
