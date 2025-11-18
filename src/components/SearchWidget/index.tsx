// Search.tsx
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
  
  const placeholderText = searchMode === "group" 
    ? "Введите название группы" 
    : "Введите номер аудитории";

  return (
    <div className={styles.dashboardCard}>
      <div className={styles.toggleRow}>
        <button
          className={`${styles.toggleButton} ${searchMode === "auditorium" ? styles.active : ""}`}
          onClick={() => setSearchMode("auditorium")}
        >
          Поиск по аудитории
        </button>
        <button
          className={`${styles.toggleButton} ${searchMode === "group" ? styles.active : ""}`}
          onClick={() => setSearchMode("group")}
        >
          Поиск по группе
        </button>
      </div>

      {/* Вместо старого блока searchRow используем новый компонент SearchInput */}
      <SearchInput
        query={query}
        setQuery={setQuery}
        placeholder={placeholderText}
        onSearch={onSearch} // Передаем функцию поиска
        // Передаем классы из ваших исходных стилей, чтобы сохранить внешний вид
        containerClassName={styles.searchRow}
        inputClassName={styles.input}
        searchButtonClassName={styles.searchButton}
      />
    </div>
  );
};

export default Search;