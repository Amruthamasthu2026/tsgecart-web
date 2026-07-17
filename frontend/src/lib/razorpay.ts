const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let loaderPromise: Promise<boolean> | null = null;

/** Lazily loads the Razorpay Checkout script once. */
export function loadRazorpay(): Promise<boolean> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve) => {
    if (typeof window !== 'undefined' && 'Razorpay' in window) return resolve(true);
    const script = document.createElement('script');
    script.src = RAZORPAY_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
  return loaderPromise;
}

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  orderId: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact?: string };
  onSuccess: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  onDismiss: () => void;
}

interface RazorpayInstance {
  open: () => void;
}
interface RazorpayConstructor {
  new (options: Record<string, unknown>): RazorpayInstance;
}

/** Opens the Razorpay checkout modal. */
export function openRazorpayCheckout(options: RazorpayCheckoutOptions): void {
  const RazorpayCtor = (window as unknown as { Razorpay: RazorpayConstructor }).Razorpay;
  const rzp = new RazorpayCtor({
    key: options.key,
    amount: options.amount,
    currency: options.currency,
    order_id: options.orderId,
    name: options.name,
    description: options.description,
    prefill: options.prefill,
    theme: { color: '#FFE60D' },
    handler: options.onSuccess,
    modal: { ondismiss: options.onDismiss },
  });
  rzp.open();
}
