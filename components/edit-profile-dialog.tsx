'use client'

// Standalone Edit profile window — avatar + camera, color row, OpenMoji grid, pinned Save.
import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { OpenMojiImg, OpenMojiPicker } from '@/components/openmoji-picker'
import {
  AVATAR_COLOR_SWATCHES,
  DEFAULT_AVATAR_COLOR,
  resolveAvatarColor,
} from '@/lib/avatar-colors'

export type EditProfileAvatarValue = {
  emoji: string | null
  unified: string | null
  color: string
}

type EditProfileDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: EditProfileAvatarValue
  initials: string // Fallback letter(s) when no emoji
  onSave: (value: EditProfileAvatarValue) => void | Promise<void>
}

export function EditProfileDialog({
  open,
  onOpenChange,
  initial,
  initials,
  onSave,
}: EditProfileDialogProps) {
  const [emoji, setEmoji] = useState(initial.emoji)
  const [unified, setUnified] = useState(initial.unified)
  const [color, setColor] = useState(resolveAvatarColor(initial.color))
  const [saving, setSaving] = useState(false)

  // Reset draft when the window opens with fresh profile data
  useEffect(() => {
    if (!open) return
    setEmoji(initial.emoji)
    setUnified(initial.unified)
    setColor(resolveAvatarColor(initial.color))
  }, [open, initial.emoji, initial.unified, initial.color])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ emoji, unified, color }) // Persist + update on-site preview
      onOpenChange(false)
    } catch (err) {
      console.error('Error saving profile avatar:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Flex column + max-height so the Save bar stays pinned (emoji grid scrolls) */}
      <DialogContent className="sm:max-w-[380px] p-0 gap-0 overflow-hidden dark:bg-gray-900 dark:border-gray-700 flex flex-col max-h-[min(90vh,640px)]">
        <DialogHeader className="px-5 pt-5 pb-2 pr-12 shrink-0">
          <DialogTitle className="text-base dark:text-white">Edit profile</DialogTitle>
        </DialogHeader>

        {/* Scrollable middle: avatar, colors, emojis */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Avatar preview + camera badge */}
          <div className="flex flex-col items-center px-5 pb-3">
            <div className="relative">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: color || DEFAULT_AVATAR_COLOR }}
              >
                {emoji || unified ? (
                  <OpenMojiImg
                    native={emoji}
                    unified={unified}
                    size={88}
                    className="h-[88px] w-[88px]"
                    alt="Profile emoji"
                  />
                ) : (
                  <span className="text-white font-semibold text-3xl">{initials}</span>
                )}
              </div>
              <button
                type="button"
                className="absolute bottom-0 right-0 w-7 h-7 bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-600 transition-colors"
                aria-label="Choose emoji"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>('[data-openmoji-search]')
                  input?.focus()
                  input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                }}
              >
                <Camera className="h-3.5 w-3.5 text-white" />
              </button>
            </div>
          </div>

          {/* Background color row */}
          <div className="px-5 pb-3">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Background</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {AVATAR_COLOR_SWATCHES.map((swatch) => {
                const selected = color.toLowerCase() === swatch.hex.toLowerCase()
                return (
                  <button
                    key={swatch.id}
                    type="button"
                    title={swatch.name}
                    aria-label={swatch.name}
                    aria-pressed={selected}
                    onClick={() => setColor(swatch.hex)}
                    className={`h-7 w-7 shrink-0 rounded-full border-2 transition-shadow ${
                      selected
                        ? 'border-gray-900 dark:border-white ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-500'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                )
              })}
            </div>
          </div>

          {/* OpenMoji grid */}
          <div className="px-3 pb-2">
            <OpenMojiPicker
              embedded
              onSelect={(sel) => {
                setEmoji(sel.native)
                setUnified(sel.unified)
              }}
              className="w-full"
            />
          </div>
        </div>

        {/* Always-visible Save bar */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
