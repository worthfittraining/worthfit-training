import { NextResponse } from 'next/server'
import Airtable from 'airtable'
import { auth, currentUser } from '@clerk/nextjs/server'

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)

async function fetchAllPages(query: Airtable.Query<Airtable.FieldSet>): Promise<Airtable.Record<Airtable.FieldSet>[]> {
  return new Promise((resolve, reject) => {
    const records: Airtable.Record<Airtable.FieldSet>[] = []
    query.eachPage(
      (page, fetchNext) => { records.push(...page); fetchNext() },
      (err) => { if (err) reject(err); else resolve(records) }
    )
  })
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only head coach can see all clients
  const user = await currentUser()
  const email = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()
  const headCoachEmail = (process.env.HEAD_COACH_EMAIL || '').toLowerCase().trim()

  if (email !== headCoachEmail) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const records = await fetchAllPages(base('Clients').select({
      fields: ['Name', 'Email', 'Coach_Email', 'Goal', 'Calories', 'Protein_g'],
      sort: [{ field: 'Name', direction: 'asc' }],
    }))

    const clients = records.map(r => ({
      id: r.id,
      Name: (r.fields.Name as string) || '',
      Email: (r.fields.Email as string) || '',
      Coach_Email: (r.fields.Coach_Email as string) || '',
      Goal: (r.fields.Goal as string) || '',
      Calories: Number(r.fields.Calories) || 0,
      Protein_g: Number(r.fields.Protein_g) || 0,
    }))

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('All clients error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
