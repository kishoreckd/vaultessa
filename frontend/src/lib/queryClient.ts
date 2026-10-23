import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/api/client';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** toast title when the mutation fails (default "Something went wrong") */
      errorTitle?: string;
      /** the caller shows its own error UI */
      silentError?: boolean;
    };
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.name === 'CryptoError') return 'This item could not be decrypted with your keys.';
  return 'Please check your connection and try again.';
}

export const queryClient = new QueryClient({
  // One consistent error toast for every failed action, unless the screen handles it itself.
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silentError) return;
      toast.error(mutation.meta?.errorTitle ?? "Couldn't complete that", { description: errorMessage(error) });
    },
  }),
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});
