'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { subscribeAccountIsolation } from '@/lib/auth-session-isolation'

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0, // Account switch must not serve a prior user's cached boards
            gcTime: 0, // Drop inactive queries immediately (was 5m default)
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // Notion-style isolation: wipe boards/threads caches when auth.uid changes
  useEffect(() => subscribeAccountIsolation(queryClient), [queryClient])

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
