import { NextResponse } from 'next/server'
import Airtable from 'airtable'

const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Fetch all clients
    const clientRecords = await base('Clients').select().all()

    // Fetch all food logs
    const logRecords = await base('Food Logs').select().all()

    const clients = clientRecords.map(client => {
      // Find today's logs for this client
      const todayLogs = logRecords.filter(log => {
        const clientIds = (log.fields.client_id as string[]) || []
        const logDate = String(log.fields.Date || '').split('T')[0]
        return clientIds.includes(client.id) && logDate === today
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