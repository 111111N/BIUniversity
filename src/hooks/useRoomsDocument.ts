import { useEffect, useState } from "react";
import { readRoomsDocument, subscribeRooms } from "../data/roomsRead";
import { emptyRooms } from "../domain/rooms";

const read = () => {
  try { return { document: readRoomsDocument(), error: "" }; }
  catch (error) { console.error("Не удалось прочитать аудитории для расписания:", error); return { document: emptyRooms(), error: "Справочник аудиторий недоступен. Работа с расписанием приостановлена; исходные данные сохранены." }; }
};
export default function useRoomsDocument() {
  const [state, setState] = useState(read);
  useEffect(() => subscribeRooms(() => setState(read())), []);
  return state;
}
