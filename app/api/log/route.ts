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
    // IMPORTANT: always use client-provided date as anchor to avoid UTC/local timezone mismatch.
    // US users logging at 8 PM local time are already "tomorrow" in UTC, which causes logs to disappear.
    const dateParam = req.nextUrl.searchParams.get('date')
    const daysParam = req.nextUrl.searchParams.get('days')
    // Anchor date: prefer client-sent date, fall back to UTC today only as last resort
    const anchorDate = dateParam || new Date().toISOString().split('T')[0]

    let targetDates: string[] = []
    if (daysParam) {
      const numDays = Math.min(parseInt(daysParam) || 7, 30)
      // Count back from the anchor using midnight UTC of the anchor date — fully deterministic
      const anchorMs = new Date(anchorDate + 'T00:00:00Z').getTime()
      for (let i = 0; i < numDays; i++) {
        const d = new Date(anchorMs - i * 24 * 60 * 60 * 1000)
        targetDates.push(d.toISOString().split('T')[0])
      }
    } else {
      targetDates = [anchorDate]
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

    // Delete by ID (manual log deletion)
    if (id) {
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
    }

    // Delete by food_name + meal_slot + email + date (Nali chat deletion)
    const email = req.nextUrl.searchParams.get('email')
    const food_name = req.nextUrl.searchParams.get('food_name')
    const meal_slot = req.nextUrl.searchParams.get('meal_slot')
    const date = req.nextUrl.searchParams.get('date')

    if (!email || !food_name) {
      return NextResponse.json({ error: 'Missing id or email+food_name' }, { status: 400 })
    }

    const clientId = await getClientRecordId(email)
    if (!clientId) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    // Fetch recent logs and fuzzy-match the food name
    const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}?maxRecords=100&sort[0][field]=Date&sort[0][direction]=desc`
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    })
    if (!listRes.ok) return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })

    const listData = await listRes.json()
    const records = listData.records || []

    // Target date is today if not provided
    const targetDate = date || new Date().toISOString().split('T')[0]
    const searchName = food_name.toLowerCase()

    // Find the best matching record (today's date, same client, closest name match)
    const match = records.find((r: { id: string; fields: Record<string, unknown> }) => {
      const fields = r.fields
      const clientIds: string[] = Array.isArray(fields.client_id) ? fields.client_id as string[] : []
      const recordDate = (fields.Date || fields.date || '') as string
      const recordName = ((fields.food_name || '') as string).toLowerCase()
      const recordSlot = (fields.meal_slot || '') as string
      const dateMatch = recordDate === targetDate
      const clientMatch = clientIds.includes(clientId)
      const nameMatch = recordName.includes(searchName) || searchName.includes(recordName) ||
        recordName.split(' ').some((w: string) => searchName.includes(w) && w.length > 3)
      const slotMatch = !meal_slot || recordSlot === meal_slot
      return dateMatch && clientMatch && nameMatch && slotMatch
    })

    if (!match) {
      return NextResponse.json({ error: 'No matching food log found', ok: false })
    }

    const delUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}/${match.id}`
    const delRes = await fetch(delUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    })

    if (!delRes.ok) {
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, deleted: match.fields.food_name, id: match.id })
  } catch (error) {
    console.error('DELETE /api/log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
