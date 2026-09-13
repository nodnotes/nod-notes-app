// POST /api/stripe/checkout — create a Stripe Checkout Session for Plus or Nod Pro.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSiteUrl, getStripe } from '@/lib/stripe'
import {
  SUBSCRIPTION_TRIAL_DAYS,
  getStripePriceId,
  isPaidSubscriptionTier,
  type SubscriptionPlanId,
} from '@/lib/subscription-plans'

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { planId?: string }
    const planId = body.planId as SubscriptionPlanId | undefined
    if (planId !== 'plus' && planId !== 'nod-pro') {
      return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('stripe_customer_id, subscription_tier')
      .eq('id', user.id)
      .maybeSingle()

    // Already subscribed → send them to the Customer Portal instead of a second Checkout
    if (isPaidSubscriptionTier(profile?.subscription_tier) && profile?.stripe_customer_id) {
      const stripe = getStripe()
      const portal = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${getSiteUrl()}/pricing`,
      })
      return NextResponse.json({ url: portal.url })
    }

    const stripe = getStripe()
    const priceId = getStripePriceId(planId)
    let customerId = profile?.stripe_customer_id ?? null

    // Reuse Stripe Customer when we already created one for this user
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.user_metadata?.full_name || undefined,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await admin
        .from('profiles')
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq('id', user.id)
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id, // Webhook fallback if metadata is missing
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: {
        trial_period_days: SUBSCRIPTION_TRIAL_DAYS,
        metadata: { supabase_user_id: user.id, nod_plan: planId },
      },
      metadata: { supabase_user_id: user.id, nod_plan: planId },
      success_url: `${getSiteUrl()}/pricing?checkout=success`,
      cancel_url: `${getSiteUrl()}/pricing?checkout=cancel`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Checkout session missing URL' }, { status: 500 })
    }
    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[stripe/checkout]', err)
    const message = err instanceof Error ? err.message : 'Checkout failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
