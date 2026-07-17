import type { OrderStatus } from '../../features/orders/orders.api';

const STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'CONFIRMED', label: 'Order Confirmed' },
  { status: 'PREPARING', label: 'Preparing' },
  { status: 'PACKED', label: 'Packed' },
  { status: 'OUT_FOR_DELIVERY', label: 'Out for Delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
];

export function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        This order was cancelled.
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === status);

  return (
    <ol className="relative space-y-6 pl-6">
      {STEPS.map((step, i) => {
        const done = i <= currentIndex;
        const active = i === currentIndex;
        return (
          <li key={step.status} className="relative">
            <span
              className={`absolute -left-6 top-0.5 grid h-4 w-4 place-items-center rounded-full ring-4 ${
                done ? 'bg-brand ring-brand-100' : 'bg-gray-200 ring-gray-50'
              }`}
            >
              {done && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={`absolute -left-[18px] top-4 h-6 w-0.5 ${done ? 'bg-brand' : 'bg-gray-200'}`}
              />
            )}
            <p className={`text-sm ${active ? 'font-bold' : done ? 'font-medium' : 'text-ink-muted'}`}>
              {step.label}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
