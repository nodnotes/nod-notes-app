// Shared paid-plan copy + Stripe price wiring for /pricing and Upgrade panel.
// Ladder mirrors Notion Free → Plus → Business; Nod Pro is the Business-step (AI + MCP).

export type SubscriptionPlanId = 'plus' | 'nod-pro'

export type SubscriptionPlan = {
  id: SubscriptionPlanId
  name: string
  price: number // USD shown on the card
  period: string // billed cadence suffix, e.g. "/month"
  blurb: string // one-line under the name
  cta: string // button label
  features: readonly string[] // bullets unique to this tier (Pro includes "Everything in Plus")
  priceEnv: string // process.env key holding the Stripe Price id
  recommended?: boolean // Nod Pro is the highlighted default
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plus',
    name: 'Plus',
    price: 4,
    period: '/month',
    blurb: 'Unlimited boards + Notion sync — AI on the fast model',
    cta: 'Upgrade to Plus — $4/month',
    priceEnv: 'STRIPE_PRICE_PLUS',
    features: [
      'Unlimited boards',
      'Full Notion two-way sync',
      'Standard AI credits (fast model)',
      'Export and backup',
      'Guest editing on boards',
    ],
  },
  {
    id: 'nod-pro',
    name: 'Nod Pro',
    price: 10,
    period: '/month',
    blurb: 'Higher AI pool, advanced models, and MCP',
    cta: 'Upgrade to Nod Pro — $10/month',
    recommended: true,
    priceEnv: 'STRIPE_PRICE_NOD_PRO',
    features: [
      'Everything in Plus',
      'Advanced AI models + higher credit pool',
      'MCP for Cursor, Claude, and more',
      'Chat import + AI on frames and threads',
      'Priority support + early access',
    ],
  },
]

export const SUBSCRIPTION_TRIAL_DAYS = 7 // Matches pricing page copy

/** Resolve Stripe Price id for a plan from env (server-only). */
export function getStripePriceId(planId: SubscriptionPlanId): string {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
  if (!plan) throw new Error(`Unknown plan: ${planId}`)
  const priceId = process.env[plan.priceEnv]
  if (!priceId) throw new Error(`Missing ${plan.priceEnv} for plan ${planId}`)
  return priceId
}

/** Map a Stripe Price id → Nod plan id (webhook + portal sync). */
export function planIdFromStripePriceId(priceId: string | null | undefined): SubscriptionPlanId | null {
  if (!priceId) return null
  for (const plan of SUBSCRIPTION_PLANS) {
    if (process.env[plan.priceEnv] === priceId) return plan.id
  }
  // Legacy single-price env used before Plus/Pro split
  if (process.env.STRIPE_PRICE_ID === priceId) return 'plus'
  return null
}

/** Human label for profiles.subscription_tier (supports legacy pro/enterprise). */
export function subscriptionTierLabel(tier: string | null | undefined): string {
  switch (tier) {
    case 'plus':
    case 'pro': // Legacy Plus
      return 'Plus'
    case 'nod-pro':
    case 'enterprise': // Legacy Nod Pro
      return 'Nod Pro'
    default:
      return 'Free Plan'
  }
}

/** True when the user has any paid Nod plan (legacy or current). */
export function isPaidSubscriptionTier(tier: string | null | undefined): boolean {
  return tier === 'plus' || tier === 'nod-pro' || tier === 'pro' || tier === 'enterprise'
}
