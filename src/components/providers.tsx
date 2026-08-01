'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import { ServiceWorkerRegister } from '@/components/sw-register';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <ServiceWorkerRegister />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 4000,
          style: {
            fontFamily: 'var(--font-arabic), Tahoma, sans-serif',
            fontSize: '14px',
            borderRadius: '10px',
          },
          error: { duration: 6000 },
        }}
      />
    </QueryClientProvider>
  );
}
