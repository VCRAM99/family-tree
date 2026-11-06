export function TreeMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M16 28 V14 M16 20 C11 20 8 16 6 11 M6 11 C5 7 8 5 11 6 M16 18 C21 18 24 14 26 9 M26 9 C27 5 24 4 21 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
