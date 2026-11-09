import React from "react";
import styles from "./index.module.scss";
import SearchField from "../SearchField";
import PickerButton from "../PickerButton";

interface SearchProps {
  searchMode: "group" | "auditorium";
  setSearchMode: React.Dispatch<React.SetStateAction<"group" | "auditorium">>;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  onSearch: () => void;
}

const Search: React.FC<SearchProps> = ({ searchMode, setSearchMode, query, setQuery, onSearch }) => {
  
  const searchLabel = searchMode === "group" ? "Группа" : "Аудитория";
  const searchAction = query.trim() ? "Найти расписание" : "Открыть расписание";

  return (
    <div className={styles.dashboardCard}>
      <div className={styles.toggleRow}>
        <PickerButton
          aria-pressed={searchMode === "auditorium"}
          onClick={() => setSearchMode("auditorium")}
        >
          Поиск по аудитории
        </PickerButton>
        <PickerButton
          aria-pressed={searchMode === "group"}
          onClick={() => setSearchMode("group")}
        >
          Поиск по группе
        </PickerButton>
      </div>

      <SearchField
        searchButtonLabel={searchAction}
        value={query}
        onChange={setQuery}
        label={searchLabel}
        hideLabel
        placeholder=""
        onSearch={onSearch}
      />
    </div>
  );
};

export default Search;
