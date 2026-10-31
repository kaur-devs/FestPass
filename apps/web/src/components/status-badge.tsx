import type { EventStatus } from '@festpass/shared';

const STYLES: Record<EventStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'border-ink-muted text-ink-muted' },
  PUBLISHED: { label: 'Published', className: 'border-success text-success' },
  CANCELLED: { label: 'Cancelled', className: 'border-danger text-danger' },
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`rounded-control border px-2 py-0.5 font-mono text-xs uppercase ${style.className}`}
    >
      {style.label}
    </span>
  );
}
