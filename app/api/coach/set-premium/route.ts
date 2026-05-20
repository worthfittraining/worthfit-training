import { NextResponse } from 'next/server'
import Airtable from 'airtable'
import { auth, currentUser } from '@clerk/nextjs/server'

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)

export async function PATCH(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only head coach can set Premium_Until
  const user = await currentUser()
  const email = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()
  const headCoachEmail = (process.env.HEAD_COACH_EMAIL || '').toLowerCase().trim()

  if (email !== headCoachEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { clientId?: string; premiumUntil?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId, premiumUntil } = body
  if (!clientId || premiumUntil === undefined) {
    return NextResponse.json({ error: 'clientId and premiumUntil are required' }, { status: 400 })
  }

  // Validate date format if provided (must be YYYY-MM-DD or empty string to clear)
  if (premiumUntil && !/^\d{4}-\d{2}-\d{2}$/.test(premiumUntil)) {
    return NextResponse.json({ error: 'premiumUntil must be YYYY-MM-DD format or empty string' }, { status: 400 })
  }

  try {
    await base('Clients').update(clientId, {
      // Pass empty string to clear, or the date string to set
      Premium_Until: premiumUntil || '',
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Set premium error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
