// SearchInput.tsx

import React from "react";

interface SearchInputProps {
  /** Текущее значение поля ввода */
  query: string;
  /** Функция для обновления значения поля ввода */
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  /** Текст-подсказка (placeholder) для поля ввода */
  placeholder: string;
  /** Функция, вызываемая при нажатии на кнопку поиска или Enter (опционально) */
  onSearch: () => void;
  /** CSS-класс для контейнера, для инпута и для кнопки (если нужно сохранить ваши стили) */
  inputClassName?: string;
  searchButtonClassName?: string;
  containerClassName?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  query,
  setQuery,
  placeholder,
  onSearch,
  inputClassName = "input", // Условные классы
  searchButtonClassName = "searchButton", // Условные классы
  containerClassName = "searchRow" // Условные классы
}) => {
  // Добавляем обработчик нажатия Enter для удобства
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className={containerClassName}>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        className={inputClassName}
      />
      <button 
        onClick={onSearch} 
        className={searchButtonClassName}
      >
        {/* SVG-иконка лупы */}
        <svg
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
  );
};

export default SearchInput;