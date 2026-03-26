import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const FOOD_LOGS_TABLE = 'Food Logs'
const CLIENTS_TABLE = 'Clients'

async function getClientRecordId(email: string): Promise<string | null> {
  const formula = encodeURIComponent(`{Email}="${email}"`)
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}?filterByFormula=${formula}&maxRecords=1`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  })
  const data = await res.json()
  return data.records?.[0]?.id ?? null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, food_name, calories, protein_g, carbs_g, fat_g, fiber_g, meal_slot, notes, date } = body

    if (!email || !food_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const clientId = await getClientRecordId(email)
    if (!clientId) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const logDate = date || new Date().toISOString().split('T')[0]

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          food_name,
          calories: Number(calories) || 0,
          protein_g: Number(protein_g) || 0,
          carbs_g: Number(carbs_g) || 0,
          fat_g: Number(fat_g) || 0,
          fiber_g: Number(fiber_g) || 0,
          meal_slot: meal_slot || 'snack',
          notes: notes || '',
          Date: logDate,
          client_id: [clientId],
        },
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('Airtable error:', err)
      return NextResponse.json({ error: 'Failed to save to Airtable' }, { status: 500 })
    }

    const record = await res.json()
    return NextResponse.json({ ok: true, id: record.id })
  } catch (error) {
    console.error('POST /api/log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email')
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    const clientId = await getClientRecordId(email)
    if (!clientId) {
      return NextResponse.json({ logs: [] })
    }

    // ?date=YYYY-MM-DD for a specific date, ?days=7 for past N days, default = today
    const dateParam = req.nextUrl.searchParams.get('date')
    const daysParam = req.nextUrl.searchParams.get('days')
    const today = new Date().toISOString().split('T')[0]

    let targetDates: string[] = []
    if (daysParam) {
      const numDays = Math.min(parseInt(daysParam) || 7, 30)
      for (let i = 0; i < numDays; i++) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        targetDates.push(d.toISOString().split('T')[0])
      }
    } else {
      targetDates = [dateParam || today]
    }

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}?maxRecords=200&sort[0][field]=Date&sort[0][direction]=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
    }

    const data = await res.json()
    const allRecords = data.records || []

    const filtered = allRecords.filter((r: any) => {
      const fields = r.fields
      const recordDate = fields.Date || fields.date || ''
      const clientIds: string[] = Array.isArray(fields.client_id) ? fields.client_id : []
      return targetDates.includes(recordDate) && clientIds.includes(clientId)
    })

    const logs = filtered.map((r: any) => ({
      id: r.id,
      food_name: r.fields.food_name || '',
      calories: r.fields.calories || 0,
      protein_g: r.fields.protein_g || 0,
      carbs_g: r.fields.carbs_g || 0,
      fat_g: r.fields.fat_g || 0,
      fiber_g: r.fields.fiber_g || 0,
      meal_slot: r.fields.meal_slot || 'snack',
      notes: r.fields.notes || '',
      date: r.fields.Date || r.fields.date || '',
    }))

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('GET /api/log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}/${id}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    })

    if (!res.ok) {
      const err = await res.json()
      console.error('Airtable delete error:', err)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
