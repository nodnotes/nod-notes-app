// POST /api/webhooks/stripe — sync subscription state onto profiles (service role).

import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import {
  planIdFromStripePriceId,
  type SubscriptionPlanId,
} from '@/lib/subscription-plans'

export const runtime = 'nodejs' // Stripe signature verify needs raw body + Node crypto

function tierFromSubscription(sub: Stripe.Subscription): SubscriptionPlanId | 'free' {
  const priceId = sub.items.data[0]?.price?.id
  const fromPrice = planIdFromStripePriceId(priceId)
  if (fromPrice) return fromPrice
  const fromMeta = sub.metadata?.nod_plan
  if (fromMeta === 'plus' || fromMeta === 'nod-pro') return fromMeta
  // Active but unknown price — treat as Plus so access isn't revoked incorrectly
  if (sub.status === 'active' || sub.status === 'trialing') return 'plus'
  return 'free'
}

async function applySubscriptionToUser(opts: {
  userId: string
  customerId: string | null
  subscription: Stripe.Subscription | null
}) {
  const admin = createAdminClient()
  const { userId, customerId, subscription } = opts

  if (!subscription || subscription.status === 'canceled' || subscription.status === 'unpaid') {
    await admin
      .from('profiles')
      .update({
        subscription_tier: 'free',
        stripe_subscription_id: null,
        ...(customerId ? { stripe_customer_id: customerId } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    return
  }

  // active | trialing | past_due keep paid access; incomplete waits for payment
  const paidOk =
    subscription.status === 'active' ||
    subscription.status === 'trialing' ||
    subscription.status === 'past_due'

  await admin
    .from('profiles')
    .update({
      subscription_tier: paidOk ? tierFromSubscription(subscription) : 'free',
      stripe_customer_id: customerId ?? undefined,
      stripe_subscription_id: subscription.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
}

async function resolveUserId(opts: {
  clientReferenceId?: string | null
  metadataUserId?: string | null
  customerId?: string | null
}): Promise<string | null> {
  if (opts.clientReferenceId) return opts.clientReferenceId
  if (opts.metadataUserId) return opts.metadataUserId
  if (!opts.customerId) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', opts.customerId)
    .maybeSingle()
  return data?.id ?? null
}

export async function POST(req: Request) {
  const stripe = getStripe()
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret || secret.includes('your-')) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET missing')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const rawBody = await req.text() // Must be raw for constructEvent
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret)
  } catch (err) {
    console.error('[stripe/webhook] signature', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break
        const userId = await resolveUserId({
          clientReferenceId: session.client_reference_id,
          metadataUserId: session.metadata?.supabase_user_id,
          customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
        })
        if (!userId || !session.subscription) break
        const subId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        const subscription = await stripe.subscriptions.retrieve(subId)
        await applySubscriptionToUser({
          userId,
          customerId: typeof session.customer === 'string' ? session.customer : null,
          subscription,
        })
        break
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const customerId =
          typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
        const userId = await resolveUserId({
          metadataUserId: subscription.metadata?.supabase_user_id,
          customerId,
        })
        if (!userId) {
          console.warn('[stripe/webhook] no user for subscription', subscription.id)
          break
        }
        await applySubscriptionToUser({
          userId,
          customerId,
          subscription: event.type === 'customer.subscription.deleted' ? null : subscription,
        })
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error('[stripe/webhook] handler', event.type, err)
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
