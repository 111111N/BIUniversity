export const isLocalNotificationHref = (href: string) => href.startsWith("/") && !href.startsWith("//") && !href.includes("\\")
  && !Array.from(href).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
