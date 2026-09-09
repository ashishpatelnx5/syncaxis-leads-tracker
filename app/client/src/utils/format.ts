const INR_FORMATTER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatInr(value: number): string {
  return `₹${INR_FORMATTER.format(value)}`;
}

export function formatLocation(entity: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
}): string {
  const parts = [entity.city, entity.state, entity.country].filter(Boolean).join(', ');
  return entity.pincode ? [parts, entity.pincode].filter(Boolean).join(' - ') : parts;
}

// Fixed display order for Product Interest dropdowns/filters, per the sales
// team's preferred grouping (main products first, then edge cases) rather
// than the alphabetical order a plain SQL "ORDER BY" would give.
const PRODUCT_INTEREST_ORDER = ['Dobot', 'Rexroth', 'Dobot + Rexroth', 'Vision System', 'Competitor Visit', 'Not Specified', 'Other'];

export function sortProductInterests(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const ai = PRODUCT_INTEREST_ORDER.indexOf(a);
    const bi = PRODUCT_INTEREST_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

// YYYY-MM-DD, matching how plain date columns (e.g. Next Follow-up) already display.
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 10);
}
