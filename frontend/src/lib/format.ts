/** Formats a number or numeric string as Indian Rupees. */
export function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    // Whole rupees show without decimals (₹200), paise amounts keep them (₹32.50)
    minimumFractionDigits: Number.isInteger(safe) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

/** Percentage discount between MRP and selling price, rounded. */
export function discountPercent(mrp: number | string, price: number | string): number {
  const m = typeof mrp === 'string' ? parseFloat(mrp) : mrp;
  const p = typeof price === 'string' ? parseFloat(price) : price;
  if (!m || m <= p) return 0;
  return Math.round(((m - p) / m) * 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
