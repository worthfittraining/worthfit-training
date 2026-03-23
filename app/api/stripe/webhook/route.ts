import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getClientByEmail, updateClient } from '@/lib/airtable'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  async function updateByEmail(email: string, fields: Record<string, unknown>) {
    const client = await getClientByEmail(email)
    if (client) await updateClient(client.id, fields)
  }

  async function updateByCustomerId(customerId: string, fields: Record<string, unknown>) {
    // Find customer email from Stripe
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
    if (customer.email) await updateByEmail(customer.email, fields)
  }

  switch (event.type) {
    // ── Trial started / Subscription created ──
    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription
      const email = sub.metadata?.email
      if (email) {
        await updateByEmail(email, {
          Stripe_Customer_Id: sub.customer as string,
          Stripe_Subscription_Id: sub.id,
          Subscription_Status: sub.status, // 'trialing' on day 1
          Trial_End: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        })
      }
      break
    }

    // ── Payment succeeded / Trial converted ──
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const email = sub.metadata?.email
      const fields = {
        Subscription_Status: sub.status,
        Stripe_Subscription_Id: sub.id,
        Trial_End: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
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
      const fields = { Subscription_Status: 'canceled' }
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
        const sub = await stripe.subscriptions.retrieve(subId)
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
