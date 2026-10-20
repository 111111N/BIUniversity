const paths = {
  reply: "M9 5 3 11l6 6M3 11h10a7 7 0 0 1 7 7v2",
  copy: "M9 9h12v12H9zM15 5V3H3v12h2",
  select: "M4 4h16v16H4zM8 12l3 3 5-6",
  delete: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5",
  attach: "m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2M6 15l8-8",
  close: "m6 6 12 12M6 18 18 6",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15m5.5 13 5 5",
  send: "m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3",
  back: "m14 5-7 7 7 7M7 12h14",
  next: "m9 5 7 7-7 7",
  previous: "m15 5-7 7 7 7",
  up: "m6 15 6-6 6 6",
  down: "m6 9 6 6 6-6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  folder: "M3 7V4h7l2 3h9v13H3V7Z",
  compose: "m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z",
  group: "M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM2 21v-2a6 6 0 0 1 12 0v2M17 5a4 4 0 0 1 0 7M17 15a5 5 0 0 1 5 5v1",
  chat: "M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4Z",
};

export default function MessageActionIcon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
