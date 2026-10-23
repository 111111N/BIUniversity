import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readNotificationFilters, updateNotificationFilters, type NotificationFilters } from "../domain/notificationNavigation";

export default function useNotificationView(compact: boolean) {
  const [params, setParams] = useSearchParams();
  const [local, setLocal] = useState<NotificationFilters>({ filter: "all", kind: "all", query: "" });
  const value = compact ? local : readNotificationFilters(params);
  const change = (patch: Partial<NotificationFilters>) => {
    if (compact) setLocal((current) => ({ ...current, ...patch }));
    else setParams((current) => updateNotificationFilters(current, patch), { replace: true });
  };
  return { ...value, change };
}
