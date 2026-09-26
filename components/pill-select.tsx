'use client'

// Floating pill select — desktop segmented control; phone: mode dropdown + tools
import { useEffect, useRef, useState } from 'react' // Local selected value + parent sync + phone menu dismiss
import { ChevronDown, Circle } from 'lucide-react' // Phone mode chevron + same radio dot as utility
import { cn } from '@/lib/utils' // Class merge
import { usePhoneModeMenu } from './phone-mode-menu-context' // Portal host for tools (inside the pill)

interface PillSelectOption {
  value: string
  label: string
}

interface PillSelectProps {
  options: PillSelectOption[]
  value?: string
  onChange?: (value: string) => void
  className?: string
}

export function PillSelect({ options, value, onChange, className }: PillSelectProps) {
  const [selectedValue, setSelectedValue] = useState(value || options[0]?.value || '')
  const { setToolsHost, phoneTools } = usePhoneModeMenu() // Portal; overflow → pill (left-aligned)
  const selectedLabel = options.find((option) => option.value === selectedValue)?.label ?? options[0]?.label // Trigger text
  const [modeOpen, setModeOpen] = useState(false) // Phone: same hanging menu as the utility toggle
  const toggleRef = useRef<HTMLDivElement>(null) // Click-away + Escape close

  useEffect(() => {
    if (!modeOpen) return // Nothing to dismiss
    const onDoc = (e: Event) => {
      if (toggleRef.current?.contains(e.target as Node)) return // Click stayed on the chip / menu
      setModeOpen(false) // Outside → close
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModeOpen(false) // Same as the utility menu
    }
    document.addEventListener('pointerdown', onDoc) // Board / chrome click
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [modeOpen])

  // Stay in sync when the parent drives mode (toolbar / context)
  useEffect(() => {
    if (value !== undefined && value !== selectedValue) {
      setSelectedValue(value)
    }
  }, [value, selectedValue])

  const handleSelect = (optionValue: string) => {
    setSelectedValue(optionValue) // Keep the trigger label in sync
    onChange?.(optionValue) // Toolbar swaps that mode’s tools
  }

  return (
    <div
      className={cn(
        'relative flex items-stretch w-fit pointer-events-auto', // Cluster sizes to dropdown + tools
        phoneTools ? 'ml-2' : 'mx-auto' // Tools in pill → left-aligned; segmented control stays centered
      )}
    >
      <div
        data-edit-menu-pill // Mode toggle shell; Filter/Sort aligns to [data-edit-menu-select] inside
        className={cn(
          // Same rounded-xl grey shell as utility mode toggles; hairline matches Ask / chat composer
          'relative z-10 flex items-center gap-0.5 px-1 py-1 rounded-xl bg-[var(--nod-chat-prompt)] border border-black/10 dark:border-white/10 shadow-sm overflow-visible', // Grey + hairline; overflow visible so Smart draw glow isn’t clipped by the shell
          className
        )}
      >
        {phoneTools ? (
          <>
            <div ref={toggleRef} className="relative min-w-0"> {/* Chip is the placement box — same as utility */}
              <button
                type="button"
                data-edit-menu-select // Phone Filter/Sort left-aligns to this mode chip
                className="inline-flex h-7 flex-shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 text-sm font-medium text-gray-700 hover:bg-white dark:bg-white dark:text-gray-300 dark:hover:bg-white" // h-7 + px-2.5 match utility so dropdown rows can share this box
                aria-label="Mode"
                aria-expanded={modeOpen}
                onClick={() => setModeOpen((open) => !open)} // Toggle the list under this bar
              >
                <span className="whitespace-nowrap">{selectedLabel}</span>
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
              </button>
              {modeOpen ? (
                <div className="absolute left-0 top-[calc(100%+9px)] z-50 flex min-w-full flex-col gap-0.5 rounded-xl border border-black/10 bg-[var(--nod-chat-prompt)] p-1 shadow-md dark:border-white/10"> {/* Same gap / radius / fill as utility; left-0 = menu left = chip left */}
                  {options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className="inline-flex h-7 w-full min-w-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-gray-700 hover:bg-[var(--nod-on-chrome)] dark:text-gray-300" // Same row chrome as utility; selected is the radio dot only
                      onClick={() => {
                        handleSelect(option.value) // Swap Actions / Layout / Draw
                        setModeOpen(false) // Close after pick
                      }}
                    >
                      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center"> {/* Same radio slot as utility */}
                        {option.value === selectedValue ? <Circle className="h-2 w-2 fill-current" /> : null} {/* Filled dot on the current mode */}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div
              ref={setToolsHost} // EditorToolbar portals undo|/|mode tools here
              data-phone-mode-tools
              className="flex items-center gap-0 overflow-x-auto max-w-[min(calc(100vw-5rem),480px)] min-h-7" // gap-0: slash margins space groups; undo lives inside now
            />
          </>
        ) : (
          options.map((option) => {
            const isSelected = selectedValue === option.value // Desktop: selected chip
            return (
              <button
                key={option.value}
                type="button"
                data-edit-menu-select={isSelected ? '' : undefined} // Filter/Sort strip left-aligns to the selected mode chip
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'inline-flex items-center px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200',
                  isSelected
                    ? 'bg-white dark:bg-white text-gray-700 dark:text-gray-300' // White background when selected (desktop only)
                    : 'bg-transparent text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
                )}
              >
                {option.label}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
