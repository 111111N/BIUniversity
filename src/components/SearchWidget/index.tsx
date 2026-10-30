import React from "react";
import styles from "./index.module.scss";
import SearchInput from "./search";

interface SearchProps {
  searchMode: "group" | "auditorium";
  setSearchMode: React.Dispatch<React.SetStateAction<"group" | "auditorium">>;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  onSearch: () => void;
}

const Search: React.FC<SearchProps> = ({ searchMode, setSearchMode, query, setQuery, onSearch }) => {
  
  const searchLabel = searchMode === "group" ? "Группа" : "Аудитория";

  return (
    <div className={styles.dashboardCard}>
      <div className={styles.toggleRow}>
        <button
          type="button"
          aria-pressed={searchMode === "auditorium"}
          className={`${styles.toggleButton} ${searchMode === "auditorium" ? styles.active : ""}`}
          onClick={() => setSearchMode("auditorium")}
        >
          Поиск по аудитории
        </button>
        <button
          type="button"
          aria-pressed={searchMode === "group"}
          className={`${styles.toggleButton} ${searchMode === "group" ? styles.active : ""}`}
          onClick={() => setSearchMode("group")}
        >
          Поиск по группе
        </button>
      </div>

      <SearchInput
        query={query}
        setQuery={setQuery}
        label={searchLabel}
        labelClassName={styles.searchLabel}
        onSearch={onSearch}
        containerClassName={styles.searchRow}
        inputClassName={styles.input}
        searchButtonClassName={styles.searchButton}
      />
    </div>
  );
};

export default Search;
