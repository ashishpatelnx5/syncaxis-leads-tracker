const INR_FORMATTER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatInr(value: number): string {
  return `₹${INR_FORMATTER.format(value)}`;
}

export function formatLocation(entity: { city?: string | null; state?: string | null; country?: string | null }): string {
  return [entity.city, entity.state, entity.country].filter(Boolean).join(', ');
}
