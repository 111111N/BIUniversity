export const getScheduleRoomKey = (room: string) => room.toLocaleLowerCase("ru").replace(/^ауд[.]?\s*/u, "").replace(/\s+/g, "").trim();
