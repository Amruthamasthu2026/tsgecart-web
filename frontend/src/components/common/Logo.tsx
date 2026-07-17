import { Link } from 'react-router-dom';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`flex shrink-0 items-center gap-2.5 ${className}`}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-2xl font-black text-ink shadow-blob">
        T
      </span>
      <span className="text-2xl font-extrabold tracking-tight text-ink">
        TSG <span className="font-bold">ecart</span>
      </span>
    </Link>
  );
}
