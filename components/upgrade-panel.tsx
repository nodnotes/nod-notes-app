'use client'

// In-app upgrade drawer — Stripe Checkout for Plus / Nod Pro

import { useState } from 'react'
import { X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'
import {
  SUBSCRIPTION_PLANS,
  type SubscriptionPlanId,
} from '@/lib/subscription-plans'
import { NodNotesIcon } from '@/components/nod-notes-icon'
import { startStripeCheckout } from '@/lib/stripe-client'

interface UpgradePanelProps {
  open: boolean
  onClose: () => void
  user: User
}

export function UpgradePanel({ open, onClose }: UpgradePanelProps) {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlanId>('nod-pro') // default to highlighted Nod Pro
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const handleCheckout = async (planType: SubscriptionPlanId) => {
    setSelectedPlan(planType)
    setBusy(true)
    try {
      await startStripeCheckout(planType)
    } finally {
      setBusy(false)
    }
  }

  const selected = SUBSCRIPTION_PLANS.find((plan) => plan.id === selectedPlan)

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity"
        onClick={onClose}
      />

      <div className="fixed right-0 top-0 h-full w-[600px] max-w-full bg-background text-foreground shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="font-young-serif text-xl text-foreground">Upgrade</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <div className="flex justify-center">
                <NodNotesIcon nodIdle className="h-12 w-auto text-gray-700" />
              </div>
              <h3 className="font-young-serif text-2xl text-foreground">Choose your plan</h3>
              <p className="font-notes-sans text-sm text-gray-600">
                Unlock all features and get the most out of Nod Notes
              </p>
            </div>

            <div className="space-y-4">
              {SUBSCRIPTION_PLANS.map((plan) => {
                const isSelected = selectedPlan === plan.id
                return (
                  <button
                    key={plan.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setSelectedPlan(plan.id)}
                    className={cn(
                      'w-full p-4 rounded-xl border-2 transition-all text-left bg-background',
                      isSelected
                        ? 'border-blue-500'
                        : 'border-border hover:border-blue-500'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-young-serif text-lg text-foreground">{plan.name}</h4>
                          {plan.recommended ? (
                            <span className="text-xs font-medium bg-blue-500 text-white px-2 py-0.5 rounded-full">
                              Recommended
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {plan.blurb}
                        </p>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-semibold text-foreground">${plan.price}</span>
                          <span className="text-sm text-muted-foreground">{plan.period}</span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <div
                          className={cn(
                            'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                            isSelected
                              ? 'border-blue-500 bg-blue-500'
                              : 'border-border'
                          )}
                        >
                          <Check className={cn('h-3 w-3 text-white', !isSelected && 'hidden')} />
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="pt-6 border-t border-border">
              <h4 className="text-sm font-semibold mb-4 text-foreground">What&apos;s included:</h4>
              <ul className="space-y-3">
                {(selected?.features ?? []).map((feature) => (
                  <li key={feature} className="flex items-center gap-3">
                    <Check className="h-5 w-5 text-blue-500 flex-shrink-0" />
                    <span className="text-sm text-foreground/80">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-6 space-y-3">
              <Button
                onClick={() => selected && handleCheckout(selected.id)}
                disabled={busy || !selected}
                className="w-full rounded-xl bg-blue-500 hover:bg-blue-600 text-white"
                size="lg"
              >
                {busy ? 'Redirecting…' : selected?.cta}
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground pt-4">
              You can cancel anytime. All plans include a 7-day free trial.
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
