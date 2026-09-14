'use client'

// Floating toast for Notion sync check / status (top-right under the bar).

import { useSyncExternalStore } from 'react'
import { Check, Loader2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getNotionSyncNotice,
  subscribeNotionSyncNotice,
} from '@/lib/notion/sync-notice'

/** Host for the single Notion sync notice — mount once under NotionConnectProvider. */
export function NotionSyncNoticeHost() {
  const notice = useSyncExternalStore(
    subscribeNotionSyncNotice,
    getNotionSyncNotice,
    () => null
  )
  if (!notice) return null

  const Icon =
    notice.variant === 'progress'
      ? Loader2
      : notice.variant === 'success'
        ? Check
        : notice.variant === 'error'
          ? AlertCircle
          : Info

  return (
    <div
      role="status"
      aria-live="polite"
      data-notion-sync-notice
      className="pointer-events-none fixed top-16 right-4 z-[80] max-w-[min(320px,calc(100vw-2rem))]"
    >
      <div
        key={notice.id}
        className={cn(
          'flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm shadow-md',
          'animate-in fade-in slide-in-from-top-1 duration-200',
          notice.variant === 'progress' && 'border-gray-200 text-gray-800',
          notice.variant === 'success' && 'border-emerald-200 text-emerald-800',
          notice.variant === 'info' && 'border-blue-200 text-blue-800',
          notice.variant === 'error' && 'border-red-200 text-red-800'
        )}
      >
        <Icon
          className={cn(
            'h-4 w-4 flex-shrink-0',
            notice.variant === 'progress' && 'animate-spin text-gray-500',
            notice.variant === 'success' && 'text-emerald-600',
            notice.variant === 'info' && 'text-[#2383e2]',
            notice.variant === 'error' && 'text-red-600'
          )}
          aria-hidden
        />
        <span className="font-medium leading-snug">{notice.message}</span>
      </div>
    </div>
  )
}
