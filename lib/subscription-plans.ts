// Shared paid-plan copy so the public pricing page and in-app upgrade panel stay in sync.

export type SubscriptionPlanId = 'plus' | 'nod-pro' // plus was monthly; nod-pro was yearly

export type SubscriptionPlan = {
  id: SubscriptionPlanId
  name: string
  price: number // USD shown on the card
  period: string // billed cadence suffix, e.g. "/month"
  blurb: string // one-line under the name
  cta: string // button label
  recommended?: boolean // Nod Pro is the highlighted default
}

export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'plus',
    name: 'Plus',
    price: 4,
    period: '/month',
    blurb: 'Billed monthly',
    cta: 'Upgrade to Plus — $4/month',
  },
  {
    id: 'nod-pro',
    name: 'Nod Pro',
    price: 10,
    period: '/month',
    blurb: 'Billed monthly',
    cta: 'Upgrade to Nod Pro — $10/month',
    recommended: true,
  },
]

export const SUBSCRIPTION_FEATURES = [
  'Unlimited conversations',
  'Advanced AI models',
  'Priority support',
  'Early access to new features',
  'Export and backup options',
] as const
