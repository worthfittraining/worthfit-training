import { NextResponse } from 'next/server'
import Airtable from 'airtable'
import { auth, currentUser } from '@clerk/nextjs/server'

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)

/** Fetch all pages from an Airtable select query */
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

  // Get the logged-in user's email
  const user = await currentUser()
  const email = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()

  const headCoachEmail = (process.env.HEAD_COACH_EMAIL || '').toLowerCase().trim()
  const isHeadCoach = email === headCoachEmail

  try {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    if (isHeadCoach) {
      // Head coach sees all clients that have any Coach_Email set
      const [clientRecords, logRecords] = await Promise.all([
        fetchAllPages(base('Clients').select({
          filterByFormula: `{Coach_Email} != ""`,
        })),
        fetchAllPages(base('Food Logs').select({
          filterByFormula: `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${today}'`,
        })),
      ])

      const clients = buildClients(clientRecords, logRecords)
      return NextResponse.json({ clients, isHeadCoach: true })
    } else {
      // Check if this email is a coach by seeing if any client has them as Coach_Email
      const myClientRecords = await fetchAllPages(base('Clients').select({
        filterByFormula: `LOWER({Coach_Email})="${email}"`,
      }))

      if (myClientRecords.length === 0) {
        // Check if email is in the additional coach emails list (allows new coaches with no clients yet)
        const additionalCoachEmails = (process.env.ADDITIONAL_COACH_EMAILS || '')
          .split(',')
          .map(e => e.toLowerCase().trim())
          .filter(Boolean)
        if (additionalCoachEmails.includes(email)) {
          return NextResponse.json({ clients: [], isHeadCoach: false })
        }
        // Not a coach — no clients assigned to them
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const logRecords = await fetchAllPages(base('Food Logs').select({
        filterByFormula: `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${today}'`,
      }))

      const clients = buildClients(myClientRecords, logRecords)
      return NextResponse.json({ clients, isHeadCoach: false })
    }
  } catch (error) {
    console.error('Coach clients error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

function buildClients(
  clientRecords: Airtable.Record<Airtable.FieldSet>[],
  logRecords: Airtable.Record<Airtable.FieldSet>[]
) {
  return clientRecords.map(client => {
    const todayLogs = logRecords.filter(log => {
      const clientIds = (log.fields.client_id as string[]) || []
      return clientIds.includes(client.id)
    })

    const todayCalories = todayLogs.reduce((s, l) => s + (Number(l.fields.calories) || 0), 0)
    const todayProtein = todayLogs.reduce((s, l) => s + (Number(l.fields.protein_g) || 0), 0)
    const targetCalories = Number(client.fields.Calories) || 1
    const targetProtein = Number(client.fields.Protein_g) || 1

    return {
      id: client.id,
      ...client.fields,
      todayCalories,
      todayProtein,
      caloriePercent: Math.round((todayCalories / targetCalories) * 100),
      proteinPercent: Math.round((todayProtein / targetProtein) * 100),
    }
  })
}
