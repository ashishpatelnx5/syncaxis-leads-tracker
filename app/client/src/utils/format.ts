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

// YYYY-MM-DD, matching how plain date columns (e.g. Next Follow-up) already display.
export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toISOString().slice(0, 10);
}
