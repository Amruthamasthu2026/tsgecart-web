import { Link } from 'react-router-dom';

const COMPANY = [
  { label: 'About', to: '/about' },
  { label: 'Contact', to: '/contact' },
  { label: 'FAQ', to: '/faq' },
];
const LEGAL = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Refund Policy', to: '/refunds' },
];

export function Footer() {
  return (
    <footer className="mt-16 bg-ink text-white">
      <div className="container-app grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-2xl font-black text-ink">
              T
            </span>
            <span className="text-xl font-extrabold">
              TSG <span className="font-bold">ecart</span>
            </span>
          </div>
          <p className="mt-4 max-w-xs text-sm text-white/60">
            Fresh groceries delivered fast across Hyderabad. Fruits, vegetables, dairy and daily
            essentials in minutes.
          </p>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-brand">Company</h3>
          <ul className="space-y-2.5 text-sm text-white/70">
            {COMPANY.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-brand">Legal</h3>
          <ul className="space-y-2.5 text-sm text-white/70">
            {LEGAL.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="transition-colors hover:text-brand">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-brand">Delivery Area</h3>
          <p className="text-sm text-white/70">
            Currently serving Hyderabad, Telangana. More cities coming soon.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">10–20 min</span>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs">Free over ₹499</span>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 py-5">
        <p className="container-app text-center text-xs text-white/50">
          © {new Date().getFullYear()} TSG eCart. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
