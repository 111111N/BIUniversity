import { decodeRooms, emptyRooms, ROOMS_KEY } from "../domain/rooms";
export const ROOMS_CHANGE_EVENT = "bi-university-rooms-change";
export const readRoomsDocument = () => { const raw = localStorage.getItem(ROOMS_KEY); return raw === null ? emptyRooms() : decodeRooms(raw); };
export const subscribeRooms = (listener: () => void) => {
  const storage = (event: StorageEvent) => { if (event.key === null || event.key === ROOMS_KEY) listener(); };
  window.addEventListener(ROOMS_CHANGE_EVENT, listener); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(ROOMS_CHANGE_EVENT, listener); window.removeEventListener("storage", storage); };
};
