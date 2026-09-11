// Server-only Stripe client — never import from client components.

import Stripe from 'stripe'

let stripe: Stripe | null = null // Lazy singleton so missing env fails at call time

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY // Test or live secret from Dashboard
  if (!key || key.includes('your-stripe') || key.includes('your-')) {
    throw new Error('STRIPE_SECRET_KEY is not configured') // Block checkout until real key is set
  }
  if (!stripe) {
    stripe = new Stripe(key, {
      apiVersion: '2025-08-27.basil', // Match installed stripe package default
      typescript: true,
    })
  }
  return stripe
}

export function getSiteUrl(): string {
  // Prefer explicit site URL; fall back to Vercel preview / localhost for Checkout redirects
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3031')
  )
}
