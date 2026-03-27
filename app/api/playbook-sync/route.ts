import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const CLIENTS_TABLE = 'Clients'

// Secret key to verify requests are genuinely from your Zapier zap
// Set PLAYBOOK_WEBHOOK_SECRET in Vercel env vars — use any long random string
const WEBHOOK_SECRET = process.env.PLAYBOOK_WEBHOOK_SECRET

async function findClientByEmail(email: string): Promise<{ id: string; fields: Record<string, unknown> } | null> {
  const formula = encodeURIComponent(`{Email}="${email.toLowerCase().trim()}"`)
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}?filterByFormula=${formula}&maxRecords=1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  })
  const data = await res.json()
  return data.records?.[0] ?? null
}

async function updateClientPlaybookStatus(recordId: string, active: boolean): Promise<void> {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}/${recordId}`
  await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        Playbook_Active: active,
      },
    }),
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, email, secret } = body

    // --- Security check ---
    // Reject requests that don't include the correct secret key.
    // In Zapier, add the secret as a body field: { "secret": "your-secret-here" }
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
      console.warn('Playbook webhook: invalid secret from', req.headers.get('x-forwarded-for'))
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
      // User hasn't signed up for Worth Fit yet — store their email so when
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
              Plan: 'free', // Will be resolved to standard via Playbook_Active flag
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

    // User exists — update their Playbook_Active status
    await updateClientPlaybookStatus(client.id, isActive)

    const currentPlan = String(client.fields.Plan || 'free')
    const action = isActive ? 'granted_standard' : 'revoked_standard'

    console.log(`Playbook sync: ${action} for ${normalizedEmail} (current Plan: ${currentPlan})`)

    return NextResponse.json({
      ok: true,
      action,
      email: normalizedEmail,
      playbook_active: isActive,
      // Their paid plan (if any) is unaffected — only Playbook_Active changed
      plan_unchanged: currentPlan,
    })
  } catch (error) {
    console.error('Playbook sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Health check — Zapier sometimes does a GET to verify the webhook URL is live
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Worth Fit Playbook Sync', status: 'ready' })
}
