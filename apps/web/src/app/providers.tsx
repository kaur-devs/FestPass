'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';

function RedirectWhenSignedOut() {
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    const redirect = (error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401) return;
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
    };
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') redirect(event.action.error);
    });
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') redirect(event.action.error);
    });
    return () => {
      stopQueries();
      stopMutations();
    };
  }, [queryClient, router]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RedirectWhenSignedOut />
      {children}
    </QueryClientProvider>
  );
}
