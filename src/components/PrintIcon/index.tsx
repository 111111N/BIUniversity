interface Props { size?: number; className?: string }

const PrintIcon = ({ size = 20, className }: Props) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M7 8V3h10v5M7 17H4V9h16v8h-3" />
    <path d="M7 14h10v7H7zM16 11h1" />
  </svg>
);

export default PrintIcon;
