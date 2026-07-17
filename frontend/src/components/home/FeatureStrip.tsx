import { LeafIcon, TruckIcon, ShieldIcon } from '../ui/icons';

const FEATURES = [
  {
    Icon: LeafIcon,
    title: 'Farm Fresh',
    text: 'Sourced directly from local farms for maximum freshness and quality',
  },
  {
    Icon: TruckIcon,
    title: 'Fast Delivery',
    text: 'Same-day delivery available for orders placed before 2pm',
  },
  {
    Icon: ShieldIcon,
    title: 'Quality Guaranteed',
    text: "Not satisfied? We'll replace it or refund you, no questions asked",
  },
];

export function FeatureStrip() {
  return (
    <section className="container-app grid gap-8 py-12 sm:grid-cols-3">
      {FEATURES.map(({ Icon, title, text }) => (
        <div key={title} className="flex flex-col items-center text-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-brand-100 text-brand-800">
            <Icon />
          </div>
          <h3 className="mt-4 text-xl font-bold text-ink">{title}</h3>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">{text}</p>
        </div>
      ))}
    </section>
  );
}
