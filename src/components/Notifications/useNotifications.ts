import { useCallback, useEffect, useState } from "react";
import { readNotificationState, refreshNotifications, subscribeNotifications } from "../../data/notificationStore";
import { useRole } from "../RoleContext";

export const useNotificationItems = () => {
  const [initialSnapshot] = useState(readNotificationState);
  const [items, setItems] = useState(initialSnapshot.items);
  const [error, setError] = useState(initialSnapshot.error);
  const refresh = useCallback(() => {
    const snapshot = readNotificationState();
    setError(snapshot.error);
    // A temporary failure must not replace the last readable list with a demo fallback.
    if (!snapshot.error) setItems(snapshot.items);
  }, []);
  useEffect(() => { const unsubscribe = subscribeNotifications(refresh); refreshNotifications(); return unsubscribe; }, [refresh]);
  return [items, setItems, error, refreshNotifications] as const;
};

// Navigation only needs counts, not the popup UI.
export const useNotificationSummary = () => {
  const { currentUser } = useRole();
  const [items, , error] = useNotificationItems();
  const userItems = items.filter((item) => item.recipientUserId === currentUser.id);
  return { total: userItems.length, unread: userItems.filter((item) => !item.read).length, error };
};

export const useUnreadNotifications = () => useNotificationSummary().unread;
