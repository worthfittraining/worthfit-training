import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const CLIENTS_TABLE = 'Clients'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!)

// Secret key to verify requests are genuinely from your Zapier zap
// Set PLAYBOOK_WEBHOOK_SECRET in Vercel env vars — use any long random string
const WEBHOOK_SECRET = process.env.PLAYBOOK_WEBHOOK_SECRET

async function findClientByEmail(email: string): Promise<{ id: string; fields: Record<string, unknown> } | null> {
   const formula = encodeURIComponent(`LOWER({Email})="${email.toLowerCase().trim()}"`)
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}?filterByFormula=${formula}&maxRecords=1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  })
  const data = await res.json()
  return data.records?.[0] ?? null
}

async function updateClientPlaybookStatus(recordId: string, active: boolean, currentPlan?: string): Promise<void> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}/${recordId}`
  const fields: Record<string, unknown> = { Playbook_Active: active }
  // When activating, always ensure Plan = standard
  // When deactivating, only drop to free if they aren't on premium (Stripe subscribers keep their plan)
  if (active) {
    fields.Plan = 'standard'
  } else if (!active && currentPlan !== 'premium') {
    fields.Plan = 'free'
  }
  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Secret can come from:
    //   - URL query param: ?secret=xxx  (used when Playbook posts directly)
    //   - Body field: { "secret": "xxx" }  (used when Zapier posts)
    const secretFromQuery = req.nextUrl.searchParams.get('secret')
    const secret = secretFromQuery ?? body.secret

    // --- Security check ---
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      console.warn('Playbook webhook: invalid secret from', req.headers.get('x-forwarded-for'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Event can come from:
    //   - URL query param: ?event=activated  (used when Playbook posts directly — encode it in the URL)
    //   - Body field: { "event": "activated" }  (used when Zapier posts)
    const eventFromQuery = req.nextUrl.searchParams.get('event')
    const event = eventFromQuery ?? body.event

    // Email can come from body.email (both Playbook native and Zapier)
    const email = body.email

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    if (!event || !['activated', 'deactivated'].includes(event)) {
      return NextResponse.json({ error: 'event must be "activated" or "deactivated"' }, { status: 400 })
    }

    const isActive = event === 'activated'
    const normalizedEmail = email.toLowerCase().trim()

    console.log(`Playbook sync: ${event} for ${normalizedEmail}`)

    const client = await findClientByEmail(normalizedEmail)

    if (!client) {
      // User hasn't signed up for Nutrition by Nali yet — store their email so when
      // they do sign up, they'll get Standard automatically.
      // We create a minimal placeholder record that onboarding will fill in.
      if (isActive) {
        const createUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}`
        await fetch(createUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${AIRTABLE_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fields: {
              Email: normalizedEmail,
              Playbook_Active: true,
              Plan: 'standard',
            },
          }),
        })
        console.log(`Playbook sync: pre-created record for ${normalizedEmail} (not yet signed up)`)
        return NextResponse.json({ ok: true, action: 'pre_created', email: normalizedEmail })
      } else {
        // They cancelled but never signed up — nothing to do
        return NextResponse.json({ ok: true, action: 'no_op', reason: 'user not found' })
      }
    }

    const currentPlan = String(client.fields.Plan || 'free')

    // User exists — update their Playbook_Active status + Plan
    await updateClientPlaybookStatus(client.id, isActive, currentPlan)
    const currentStatus = String(client.fields.Subscription_Status || '')
    const stripeSubId = client.fields.Stripe_Subscription_Id as string | undefined

    let stripeAction = 'none'

    // If they're being activated as a Playbook member and are currently paying for
    // Standard, cancel their subscription at period end — they get it free via Playbook.
    // We only cancel Standard, not Premium (they may want to keep paying for Premium features).
    if (
      isActive &&
      currentPlan === 'standard' &&
      ['active', 'trialing'].includes(currentStatus) &&
      stripeSubId
    ) {
      try {
        await getStripe().subscriptions.update(stripeSubId, {
          cancel_at_period_end: true,
        })
        stripeAction = 'scheduled_cancellation'
        console.log(`Playbook sync: scheduled Stripe cancellation at period end for ${normalizedEmail} (sub: ${stripeSubId})`)
      } catch (stripeErr) {
        // Non-fatal — Playbook access is already granted, just log the error
        console.error(`Playbook sync: failed to cancel Stripe sub for ${normalizedEmail}:`, stripeErr)
        stripeAction = 'cancellation_failed'
      }
    }

    const action = isActive ? 'granted_standard' : 'revoked_standard'
    console.log(`Playbook sync: ${action} for ${normalizedEmail} (current Plan: ${currentPlan})`)

    return NextResponse.json({
      ok: true,
      action,
      email: normalizedEmail,
      playbook_active: isActive,
      plan_unchanged: currentPlan,
      stripe_action: stripeAction,
    })
  } catch (error) {
    console.error('Playbook sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Health check — Zapier sometimes does a GET to verify the webhook URL is live
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Nutrition by Nali Playbook Sync', status: 'ready' })
}
