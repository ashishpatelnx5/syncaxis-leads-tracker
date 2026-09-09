import type { FollowUpStatus, Priority } from '../types';

export function StatusBadge({ status }: { status: FollowUpStatus }) {
  return <span className={`badge status-${status.replace(/\s+/g, '-').toLowerCase()}`}>{status}</span>;
}

const PRIORITY_ICON: Record<Priority, string> = {
  Hot: '\u{1F525}',
  Warm: '\u{1F324}',
  Cold: '❄️',
};

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span className={`badge priority-${priority.toLowerCase()}`}>
      {PRIORITY_ICON[priority]} {priority}
    </span>
  );
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Colors loosely follow each brand's own site: Rexroth's deep navy blue,
// Dobot's teal. Anything without a specific product-<slug> rule below (a
// new free-text value, since this is datalist-suggested not enum-locked)
// just falls through to the plain .badge default - never unstyled.
export function ProductBadge({ product }: { product: string | null }) {
  if (!product) return <span className="cell-secondary">-</span>;
  return <span className={`badge product-${slug(product)}`}>{product}</span>;
}
