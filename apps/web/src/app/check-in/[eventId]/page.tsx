import type { Metadata } from 'next';
import { GateScanner } from './gate-scanner';

export const metadata: Metadata = { title: 'Scanner' };

export default async function GateScannerPage({ params }: PageProps<'/check-in/[eventId]'>) {
  const { eventId } = await params;
  return <GateScanner eventId={eventId} />;
}
