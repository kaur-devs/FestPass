const SERVER_API_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const PUBLIC_EVENTS_TAG = 'public-events';

interface FetchOptions {
  revalidateSeconds?: number;
  tags?: string[];
}

export async function fetchPublic<T>(
  path: string,
  { revalidateSeconds, tags }: FetchOptions = {},
): Promise<T | null> {
  const res = await fetch(`${SERVER_API_URL}${path}`, {
    ...(revalidateSeconds === undefined
      ? { cache: 'no-store' as const }
      : { next: { revalidate: revalidateSeconds, ...(tags && { tags }) } }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API responded ${res.status} for ${path}`);
  return (await res.json()) as T;
}
