'use client'

// After /access login with ?plan=, kick off Checkout once on /pricing?plan=

import { useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { startStripeCheckout } from '@/lib/stripe-client'
import { type SubscriptionPlanId } from '@/lib/subscription-plans'

export function PricingAutoCheckout({ signedIn }: { signedIn: boolean }) {
  const params = useSearchParams()
  const router = useRouter()
  const started = useRef(false)
  const plan = params.get('plan')

  useEffect(() => {
    if (!signedIn || started.current) return
    if (plan !== 'plus' && plan !== 'nod-pro') return
    started.current = true
    void startStripeCheckout(plan as SubscriptionPlanId).then(() => {
      router.replace('/pricing') // Drop ?plan= so refresh doesn't re-fire
    })
  }, [signedIn, plan, router])

  return null
}
