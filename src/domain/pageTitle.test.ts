import { describe, expect, it } from "vitest";
import { getPortalPageTitle } from "./pageTitle";

describe("portal page titles", () => {
  it("distinguishes open sections and identifies a known journal subject", () => {
    expect(getPortalPageTitle("/messages", "teacher")).toBe("Сообщения · BIUniversity");
    expect(getPortalPageTitle("/notifications", "student")).toBe("Уведомления · BIUniversity");
    expect(getPortalPageTitle("/journal/theory-of-probability/112-mko", "student")).toContain("Теория вероятностей — Журнал");
    expect(getPortalPageTitle("/journal/not-a-subject", "teacher")).toBe("Журнал · BIUniversity");
  });
  it("uses the correct cabinet label for each role and handles trailing slashes", () => {
    expect(getPortalPageTitle("/cabinet/", "student")).toBe("Мой профиль · BIUniversity");
    expect(getPortalPageTitle("/cabinet", "teacher")).toBe("Кабинет преподавателя · BIUniversity");
    expect(getPortalPageTitle("/missing", "teacher")).toBe("Страница не найдена · BIUniversity");
  });
  it("names configurator sections separately from the teacher cabinet", () => {
    expect(getPortalPageTitle("/admin/schedule", "configurator")).toBe("Настройка расписания · BIUniversity");
    expect(getPortalPageTitle("/admin/accounts/", "configurator")).toBe("Учётные записи · BIUniversity");
    expect(getPortalPageTitle("/admin/groups", "configurator")).toBe("Учебные группы · BIUniversity");
    expect(getPortalPageTitle("/admin/accounts/import", "configurator")).toBe("Импорт студентов · BIUniversity");
    expect(getPortalPageTitle("/admin/students", "configurator")).toBe("Реестр студентов · BIUniversity");
    expect(getPortalPageTitle("/", "configurator")).toBe("Настройка расписания · BIUniversity");
  });
});
