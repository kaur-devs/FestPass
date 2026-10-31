import type { Metadata } from 'next';
import { OrganizeView } from './organize-view';

export const metadata: Metadata = { title: 'Organize' };

export default function OrganizePage() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Organize</h1>
        <p className="text-sm text-ink-muted">Events run by your teams, including drafts.</p>
      </div>
      <OrganizeView />
    </>
  );
}
