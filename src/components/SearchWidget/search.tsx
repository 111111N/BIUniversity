import React, { useId } from "react";
import { searchOnEnter } from "./keyboard";

interface SearchInputProps {
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  label: string;
  labelClassName?: string;
  onSearch: () => void;
  inputClassName?: string;
  searchButtonClassName?: string;
  containerClassName?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  query,
  setQuery,
  label,
  labelClassName,
  onSearch,
  inputClassName = "input",
  searchButtonClassName = "searchButton",
  containerClassName = "searchRow"
}) => {
  const inputId = useId();

  return (
    <>
    <label htmlFor={inputId} className={labelClassName}>{label}</label>
    <div className={containerClassName}>
      <input
        id={inputId}
        type="text"
        placeholder=""
        enterKeyHint="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={(event) => searchOnEnter(event, onSearch)}
        className={inputClassName}
      />
      <button 
        type="button"
        aria-label="Найти расписание"
        onClick={onSearch} 
        className={searchButtonClassName}
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    </div>
    </>
  );
};

export default SearchInput;
