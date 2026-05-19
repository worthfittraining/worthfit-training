import { NextResponse } from 'next/server'
import Airtable from 'airtable'
import { auth, currentUser } from '@clerk/nextjs/server'

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)

export async function PATCH(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only head coach can reassign clients
  const user = await currentUser()
  const email = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()
  const headCoachEmail = (process.env.HEAD_COACH_EMAIL || '').toLowerCase().trim()

  if (email !== headCoachEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { clientId?: string; coachEmail?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { clientId, coachEmail } = body
  if (!clientId || coachEmail === undefined) {
    return NextResponse.json({ error: 'clientId and coachEmail are required' }, { status: 400 })
  }

  try {
    await base('Clients').update(clientId, {
      Coach_Email: coachEmail,
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Assign coach error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
