import { useSearchParams } from "react-router-dom";

const useCabinetTabs = (student = false) => {
  const [params, setParams] = useSearchParams();
  const items = [
    { value: "overview", label: "Обзор" },
    ...(student ? [{ value: "group", label: "Моя группа" }] : []),
    { value: "study-plan", label: "Учебный план" },
    { value: "files", label: "Мои файлы" },
    { value: "settings", label: "Настройки" },
  ];
  const requested = params.get("tab");
  const activeTab = items.find((item) => item.value === requested)?.value ?? "overview";
  const setActiveTab = (tab: string) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    return next;
  });
  return { items, activeTab, setActiveTab };
};

export default useCabinetTabs;
