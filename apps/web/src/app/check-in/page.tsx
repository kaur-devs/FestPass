import type { Metadata } from 'next';
import { CheckInEvents } from './check-in-events';

export const metadata: Metadata = { title: 'Gate check-in' };

export default function CheckInPage() {
  return <CheckInEvents />;
}
