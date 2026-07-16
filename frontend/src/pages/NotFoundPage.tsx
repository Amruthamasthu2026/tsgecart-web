import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="container-app grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="text-7xl font-black text-brand">404</p>
        <h1 className="mt-2 text-2xl font-bold">Page not found</h1>
        <p className="mt-2 text-ink-muted">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn-primary mt-6">
          Back to home
        </Link>
      </div>
    </div>
  );
}
