interface Props { size?: number; className?: string }

const SearchIcon = ({ size = 18, className }: Props) => <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className={className}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>;

export default SearchIcon;
