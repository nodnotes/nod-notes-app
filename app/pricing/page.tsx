import { Check } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import { HomeTopNav } from '@/components/home-top-nav'
import { PricingAutoCheckout } from '@/components/pricing-auto-checkout'
import { PricingCheckoutButton } from '@/components/pricing-checkout-button'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { SUBSCRIPTION_PLANS } from '@/lib/subscription-plans'

// Public subscription page — same chrome as `/` (HomeTopNav, young-serif, blue-500)
export default async function PricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ checkout?: string; plan?: string }>
}) {
  const params = (await searchParams) ?? {}
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="relative min-h-screen bg-background text-foreground" data-home-page>
      <HomeTopNav />
      <Suspense fallback={null}>
        <PricingAutoCheckout signedIn={!!user} />
      </Suspense>

      <main>
        <section className="relative z-10 container mx-auto px-4 min-[900px]:px-6 py-16 min-[900px]:py-24 text-center">
          <h1 className="mb-4 font-young-serif text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-[0.02em] text-foreground leading-[1.1]">
            Simple plans for every board
          </h1>
          <p className="mx-auto mb-14 max-w-xl font-notes-sans text-lg min-[900px]:text-xl text-gray-600">
            Start free, then pick Plus or Nod Pro when you need more.
          </p>

          {params.checkout === 'success' ? (
            <p className="mx-auto mb-8 max-w-xl rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-foreground">
              Thanks — your subscription is updating. Refresh if your plan label still shows Free.
            </p>
          ) : null}

          <div className="mx-auto grid max-w-4xl gap-6 min-[900px]:grid-cols-2 min-[900px]:gap-8 text-left">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <article
                key={plan.id}
                className={cn(
                  'flex flex-col rounded-2xl border bg-background p-6 min-[900px]:p-8',
                  plan.recommended ? 'border-blue-500 shadow-sm' : 'border-border'
                )}
              >
                <div className="mb-6 flex items-center gap-2">
                  <h2 className="font-young-serif text-2xl text-foreground">{plan.name}</h2>
                  {plan.recommended ? (
                    <span className="text-xs font-medium bg-blue-500 text-white px-2 py-0.5 rounded-full">
                      Recommended
                    </span>
                  ) : null}
                </div>
                <p className="mb-4 text-sm text-muted-foreground">{plan.blurb}</p>
                <div className="mb-6 flex items-baseline gap-1">
                  <span className="font-young-serif text-4xl text-foreground">${plan.price}</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <ul className="mb-8 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                      <span className="text-sm text-foreground/80">{feature}</span>
                    </li>
                  ))}
                </ul>
                <PricingCheckoutButton
                  planId={plan.id}
                  label={plan.cta}
                  recommended={plan.recommended}
                  signedIn={!!user}
                />
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-muted/20">
          <div className="container mx-auto px-4 min-[900px]:px-6 py-16 text-center">
            <h2 className="mb-3 font-young-serif text-2xl min-[900px]:text-3xl tracking-tight">
              Cancel anytime
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-muted-foreground">
              All plans include a 7-day free trial. Start on a blank board, then upgrade when you are ready.
            </p>
            <Link
              href={user ? '/board' : '/access'}
              className="inline-flex items-center justify-center rounded-full bg-foreground text-background px-8 py-3 font-young-serif text-sm min-[900px]:text-base hover:opacity-90 transition-opacity"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
