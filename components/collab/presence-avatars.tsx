'use client'

// Top-bar stack of peers currently on this board (Miro/Notion-style presence)

import { OpenMojiImg } from '@/components/openmoji-picker'
import { useBoardCollab } from '@/lib/collab/board-collab-context'

const MAX_SHOWN = 5

export function CollabPresenceAvatars() {
  const { configured, synced, peers, localUser } = useBoardCollab()
  if (!configured || !synced) return null // Collab off or still connecting

  const shown = peers.slice(0, MAX_SHOWN)
  const overflow = peers.length - shown.length
  if (shown.length === 0 && !localUser) return null

  return (
    <div
      className="flex items-center -space-x-1.5 pr-1"
      title={
        peers.length === 0
          ? 'Only you on this board'
          : `${peers.length} other${peers.length === 1 ? '' : 's'} here`
      }
      data-collab-presence
    >
      {localUser && (
        <span
          className="relative z-[1] flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-white dark:ring-[#1f1f1f] text-[11px] font-medium text-white"
          style={{ backgroundColor: localUser.color }}
          title={`${localUser.name} (you)`}
        >
          {localUser.avatarEmoji ? (
            <OpenMojiImg
              native={localUser.avatarEmoji}
              unified={localUser.avatarUnified ?? undefined}
              size={20}
              className="h-5 w-5"
              alt=""
            />
          ) : (
            (localUser.name[0] || '?').toUpperCase()
          )}
        </span>
      )}
      {shown.map((p) => (
        <span
          key={p.clientId}
          className="relative flex h-7 w-7 items-center justify-center rounded-full ring-2 ring-white dark:ring-[#1f1f1f] text-[11px] font-medium text-white"
          style={{ backgroundColor: p.color }}
          title={p.name}
        >
          {p.avatarEmoji ? (
            <OpenMojiImg
              native={p.avatarEmoji}
              unified={p.avatarUnified ?? undefined}
              size={20}
              className="h-5 w-5"
              alt=""
            />
          ) : (
            (p.name[0] || '?').toUpperCase()
          )}
        </span>
      ))}
      {overflow > 0 && (
        <span className="relative flex h-7 min-w-7 items-center justify-center rounded-full bg-gray-200 dark:bg-[#333] ring-2 ring-white dark:ring-[#1f1f1f] px-1.5 text-[10px] font-medium text-gray-700 dark:text-gray-200">
          +{overflow}
        </span>
      )}
    </div>
  )
}
