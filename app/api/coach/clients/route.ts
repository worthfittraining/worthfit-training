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

// Coach email config — set these in your Vercel environment variables:
//   HEAD_COACH_EMAIL   = your email (sees ALL clients)
//   COACH_EMAILS       = comma-separated list of ALL coach emails (including yours)
function getCoachConfig() {
  const headCoach = (process.env.HEAD_COACH_EMAIL || '').toLowerCase().trim()
  const allCoaches = (process.env.COACH_EMAILS || headCoach)
    .split(',')
    .map(e => e.toLowerCase().trim())
    .filter(Boolean)
  return { headCoach, allCoaches }
}

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get the logged-in user's email
  const user = await currentUser()
  const email = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()

  // Gate: only designated coaches can access this endpoint
  const { headCoach, allCoaches } = getCoachConfig()
  if (!allCoaches.includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isHeadCoach = email === headCoach

  try {
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Head coach sees all ASSIGNED clients; assistant coaches see only their assigned clients
    // Both views filter to only clients who have a Coach_Email set (actual coaching clients)
    const clientQuery = isHeadCoach
      ? base('Clients').select({
          filterByFormula: `{Coach_Email} != ""`,
        })
      : base('Clients').select({
          filterByFormula: `LOWER({Coach_Email})="${email}"`,
        })

    const [clientRecords, logRecords] = await Promise.all([
      fetchAllPages(clientQuery),
      fetchAllPages(base('Food Logs').select({
        filterByFormula: `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${today}'`,
      })),
    ])

    const clients = clientRecords.map(client => {
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

    return NextResponse.json({ clients, isHeadCoach })
  } catch (error) {
    console.error('Coach clients error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
