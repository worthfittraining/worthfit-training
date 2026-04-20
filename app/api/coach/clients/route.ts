import { NextResponse } from 'next/server'
import Airtable from 'airtable'
import { auth } from '@clerk/nextjs/server'

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
  try {
    // Local date string to match what clients send when logging food
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    // Fetch all clients (paginated) + only TODAY's food logs (not the entire history)
    const [clientRecords, logRecords] = await Promise.all([
      fetchAllPages(base('Clients').select()),
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

    return NextResponse.json({ clients })
  } catch (error) {
    console.error('Coach clients error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
