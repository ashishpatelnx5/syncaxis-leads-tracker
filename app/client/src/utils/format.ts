const INR_FORMATTER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatInr(value: number): string {
  return `₹${INR_FORMATTER.format(value)}`;
}

export function formatLocation(entity: { city?: string | null; state?: string | null; country?: string | null }): string {
  return [entity.city, entity.state, entity.country].filter(Boolean).join(', ');
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
