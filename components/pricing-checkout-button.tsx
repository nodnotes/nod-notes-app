'use client'

// Pricing CTA — logged-in users go to Stripe Checkout; anonymous → /access (early-access login).

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { startStripeCheckout } from '@/lib/stripe-client'
import type { SubscriptionPlanId } from '@/lib/subscription-plans'

type Props = {
  planId: SubscriptionPlanId
  label: string
  recommended?: boolean
  signedIn: boolean
}

export function PricingCheckoutButton({ planId, label, recommended, signedIn }: Props) {
  const [busy, setBusy] = useState(false)

  if (!signedIn) {
    return (
      <Link
        href={`/access?next=${encodeURIComponent(`/pricing?plan=${planId}`)}`}
        className={cn(
          'inline-flex h-11 items-center justify-center rounded-xl px-6 text-base font-medium transition-colors',
          recommended
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-foreground text-background hover:opacity-90'
        )}
      >
        {label}
      </Link>
    )
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await startStripeCheckout(planId)
        } finally {
          setBusy(false)
        }
      }}
      className={cn(
        'inline-flex h-11 items-center justify-center rounded-xl px-6 text-base font-medium transition-colors disabled:opacity-60',
        recommended
          ? 'bg-blue-500 text-white hover:bg-blue-600'
          : 'bg-foreground text-background hover:opacity-90'
      )}
    >
      {busy ? 'Redirecting…' : label}
    </button>
  )
}
