/** Centered brand spinner for full-page loading states. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`grid min-h-[40vh] place-items-center ${className}`}>
      <span className="h-9 w-9 animate-spin rounded-full border-4 border-brand border-t-transparent" />
    </div>
  );
}
