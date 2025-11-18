import * as React from "react";
import { useState, useMemo, useCallback, KeyboardEvent } from 'react';
import styles from './index.module.scss';
import SearchInput from '../SearchWidget/search'; 

// Определяем типы для результатов
type FilterKey = 'group' | 'auditory' | 'teacher';
type FilterType = FilterKey | null;

interface FilterResult {
    id: number;
    title: string;
    type: FilterKey;
}

// Тестовые данные для демонстрации
const DUMMY_RESULTS: Record<FilterKey, FilterResult[]> = {
    group: [
        { id: 1, title: 'Группа ИС-21', type: 'group' },
        { id: 2, title: 'Группа БИ-19', type: 'group' },
        { id: 3, title: 'Группа МК-22', type: 'group' },
        { id: 4, title: 'Группа АА-23', type: 'group' }, 
        { id: 5, title: 'Группа ТТ-20', type: 'group' }, 
        { id: 6, title: 'Группа УУ-24', type: 'group' }, 
    ],
    auditory: [
        { id: 11, title: 'Аудитория 205', type: 'auditory' },
        { id: 12, title: 'Аудитория 312', type: 'auditory' },
        { id: 13, title: 'Лаборатория А-10', type: 'auditory' },
    ],
    teacher: [
        { id: 21, title: 'Иванов И.И.', type: 'teacher' },
        { id: 22, title: 'Петрова С.А.', type: 'teacher' },
        { id: 23, title: 'Сидоров К.В.', type: 'teacher' },
    ],
};

interface FiltersProps {
    onSearch?: () => void;
}

const Filters: React.FC<FiltersProps> = ({ onSearch }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterType>('group');

    const displayedResults = useMemo(() => {
        if (!activeFilter) return [];

        const allResults = DUMMY_RESULTS[activeFilter as FilterKey] || [];
        const query = searchQuery.toLowerCase().trim();

        if (query === '') {
            return allResults;
        } else {
            return allResults.filter(result => 
                result.title.toLowerCase().includes(query)
            );
        }
    }, [activeFilter, searchQuery]);
    
    const handleResultClick = useCallback((result: FilterResult) => {
        setSearchQuery(result.title);
        onSearch?.();
    }, [onSearch]);

    const handleResultKeyDown = (event: KeyboardEvent<HTMLDivElement>, result: FilterResult) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); 
            handleResultClick(result);
        }
    };

    const handleSearchClick = useCallback(() => {
        onSearch?.();
    }, [onSearch]);

    const handleFilterClick = useCallback((filter: FilterKey) => {
        setActiveFilter(filter);
        setSearchQuery('');
    }, []);

    return (
        <div className={styles.filtersContainer}>
            <h2 className={styles.title}>Расписание</h2>

            <div className={styles.filterGroup}>
                {(['group', 'auditory', 'teacher'] as FilterKey[]).map((filterKey) => (
                    <button
                        key={filterKey}
                        className={`${styles.button} ${activeFilter === filterKey ? styles.active : ''}`}
                        onClick={() => handleFilterClick(filterKey)}
                    >
                        {filterKey === 'group' ? 'Группа' : filterKey === 'auditory' ? 'Аудитория' : 'Преподаватель'}
                    </button>
                ))}
            </div>
            
            <div className={styles.mainContentWrapper}> 
                <div className={styles.searchWrapper}>
                    <SearchInput
                        query={searchQuery}
                        setQuery={setSearchQuery}
                        placeholder={`Ваш запрос`}
                        onSearch={handleSearchClick}
                        containerClassName={styles.searchInputWrapper} 
                        inputClassName={styles.input} 
                        searchButtonClassName={styles.searchButton} 
                    />
                </div>
                
                <div 
                    className={styles.searchResults}
                    role="listbox" 
                    aria-label="Результаты поиска"
                >
                    {displayedResults.length > 0 ? (
                        <>
                            <div className={styles.resultsHeader}>
                                {searchQuery.trim() === '' ? 'Популярные результаты:' : 'Результаты:'}
                            </div>
                            {displayedResults.map((result) => (
                                <div 
                                    key={result.id} 
                                    className={styles.searchResultItem}
                                    onClick={() => handleResultClick(result)}
                                    onKeyDown={(e) => handleResultKeyDown(e, result)}
                                    role="option" 
                                    tabIndex={0} 
                                    aria-selected={searchQuery === result.title} 
                                >
                                    {result.title}
                                </div>
                            ))}
                        </>
                    ) : (
                        searchQuery.trim() !== '' && (
                            <div className={styles.resultsHeader}>
                                Ничего не найдено.
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
};

export default Filters;
