import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Stripe from 'stripe'
import { getClientByEmail } from '@/lib/airtable'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { email, priceId, promoCode } = await req.json()
  if (!email || !priceId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const stripe = getStripe()

  // Get or create Stripe customer
  let customerId: string | undefined
  try {
    const client = await getClientByEmail(email)
    if (client?.fields?.Stripe_Customer_Id) {
      customerId = client.fields.Stripe_Customer_Id as string
    }
  } catch { /* continue without existing customer */ }

  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { clerk_user_id: userId },
    })
    customerId = customer.id
  }

  // Look up promo code in Stripe if provided
  let discounts: { promotion_code: string }[] | undefined
  if (promoCode?.trim()) {
    try {
      const codes = await stripe.promotionCodes.list({ code: promoCode.trim(), active: true, limit: 1 })
      if (codes.data.length > 0) {
        discounts = [{ promotion_code: codes.data[0].id }]
      } else {
        return NextResponse.json({ error: `Promo code "${promoCode}" is invalid or expired.` }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: 'Could not validate promo code. Please try again.' }, { status: 400 })
    }
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { email },
    },
    // Use pre-validated promo code if provided, otherwise allow entry at checkout
    ...(discounts ? { discounts } : { allow_promotion_codes: true }),
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/subscribe`,
    metadata: { email },
  })

  return NextResponse.json({ url: session.url })
}
