import { Link } from 'react-router-dom';

const LINKS = [
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'FAQ', to: '/faq' },
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Refund Policy', to: '/refunds' },
];

export function Footer() {
  return (
    <footer className="mt-16 border-t border-black/5 bg-ink text-white">
      <div className="container-app grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-ink font-black">
              T
            </span>
            <span className="text-lg font-extrabold">TSG eCart</span>
          </div>
          <p className="mt-3 text-sm text-white/70">
            Fresh groceries delivered fast across Hyderabad.
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand">Company</h3>
          <ul className="space-y-2 text-sm text-white/70">
            {LINKS.slice(0, 3).map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand">Legal</h3>
          <ul className="space-y-2 text-sm text-white/70">
            {LINKS.slice(3).map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-brand">Delivery Area</h3>
          <p className="text-sm text-white/70">
            Currently serving Hyderabad, Telangana. More cities coming soon.
          </p>
        </div>
      </div>

      <div className="border-t border-white/10 py-4">
        <p className="container-app text-center text-xs text-white/50">
          © {new Date().getFullYear()} TSG eCart. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
