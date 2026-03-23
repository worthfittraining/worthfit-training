import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { getClientByEmail } from '@/lib/airtable'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, priceId } = await req.json()
  if (!email || !priceId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  // Get or create Stripe customer
  let customerId: string | undefined
  const client = await getClientByEmail(email)
  if (client?.fields?.Stripe_Customer_Id) {
    customerId = client.fields.Stripe_Customer_Id as string
  } else {
    const customer = await getStripe().customers.create({
      email,
      metadata: { clerk_user_id: userId },
    })
    customerId = customer.id
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { email },
    },
    allow_promotion_codes: true,      // ← enables discount codes at checkout
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscribe`,
    metadata: { email },
  })

  return NextResponse.json({ url: session.url })
}
