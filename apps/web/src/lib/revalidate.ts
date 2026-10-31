'use server';

import { updateTag } from 'next/cache';
import { PUBLIC_EVENTS_TAG } from './server-api';

export async function refreshPublicEvents(): Promise<void> {
  updateTag(PUBLIC_EVENTS_TAG);
  return Promise.resolve();
}
