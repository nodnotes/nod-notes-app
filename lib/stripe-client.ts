'use client'

// Client helpers that POST to Stripe Checkout / Customer Portal and redirect.

import type { SubscriptionPlanId } from '@/lib/subscription-plans'

async function postJson(url: string, body?: unknown): Promise<{ url?: string; error?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok) return { error: data.error || `Request failed (${res.status})` }
  return data
}

/** Start Checkout for a plan (or Portal if already subscribed). */
export async function startStripeCheckout(planId: SubscriptionPlanId): Promise<string | null> {
  const data = await postJson('/api/stripe/checkout', { planId })
  if (data.error || !data.url) {
    console.error('[stripe] checkout', data.error)
    alert(data.error || 'Could not start checkout')
    return null
  }
  window.location.href = data.url
  return data.url
}

/** Open Customer Portal to manage / cancel subscription. */
export async function openStripePortal(): Promise<string | null> {
  const data = await postJson('/api/stripe/portal')
  if (data.error || !data.url) {
    console.error('[stripe] portal', data.error)
    alert(data.error || 'Could not open billing portal')
    return null
  }
  window.location.href = data.url
  return data.url
}
