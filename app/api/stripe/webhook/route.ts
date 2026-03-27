import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getClientByEmail, updateClient } from '@/lib/airtable'
import { planFromPriceId } from '@/lib/plan'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  type AirtableFields = Record<string, string | number | boolean | null>

  async function updateByEmail(email: string, fields: AirtableFields) {
    const client = await getClientByEmail(email)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (client) await updateClient(client.id, fields as any)
  }

  async function updateByCustomerId(customerId: string, fields: AirtableFields) {
    // Find customer email from Stripe
    const customer = await getStripe().customers.retrieve(customerId) as Stripe.Customer
    if (customer.email) await updateByEmail(customer.email, fields)
  }

  /** Determine the Plan tier from a subscription's price IDs */
  function getPlanFromSubscription(sub: Stripe.Subscription): string {
    const priceId = sub.items?.data?.[0]?.price?.id
    if (!priceId) return 'standard'
    return planFromPriceId(priceId)
  }

  switch (event.type) {
    // ── Trial started / Subscription created ──
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription
      const email = sub.metadata?.email
      const plan = getPlanFromSubscription(sub)
      if (email) {
        await updateByEmail(email, {
          Stripe_Customer_Id: sub.customer as string,
          Stripe_Subscription_Id: sub.id,
          Subscription_Status: sub.status, // 'trialing' on day 1
          Trial_End: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          Plan: plan,
        })
      }
      break
    }

    // ── Payment succeeded / Trial converted / Plan changed ──
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const email = sub.metadata?.email
      const plan = getPlanFromSubscription(sub)
      const fields = {
        Subscription_Status: sub.status,
        Stripe_Subscription_Id: sub.id,
        Trial_End: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        Plan: plan,
      }
      if (email) {
        await updateByEmail(email, fields)
      } else {
        await updateByCustomerId(sub.customer as string, fields)
      }
      break
    }

    // ── Subscription cancelled or expired ──
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const email = sub.metadata?.email
      const fields = { Subscription_Status: 'canceled', Plan: 'free' }
      if (email) {
        await updateByEmail(email, fields)
      } else {
        await updateByCustomerId(sub.customer as string, fields)
      }
      break
    }

    // ── Payment failed ──
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const subId = (invoice as Stripe.Invoice & { subscription?: string }).subscription
      if (subId) {
        const sub = await getStripe().subscriptions.retrieve(subId)
        const email = sub.metadata?.email
        const fields = { Subscription_Status: 'past_due' }
        if (email) {
          await updateByEmail(email, fields)
        } else {
          await updateByCustomerId(sub.customer as string, fields)
        }
      }
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
