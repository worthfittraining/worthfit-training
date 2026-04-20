import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const FOOD_LOGS_TABLE = 'Food Logs'
const CLIENTS_TABLE = 'Clients'

async function getClientRecordId(email: string): Promise<string | null> {
  const ids = await getClientRecordIds(email)
  return ids[0] ?? null
}

// Returns ALL matching client record IDs for an email — handles duplicate records
// (e.g. Playbook pre-created record + sign-up record for the same user)
async function getClientRecordIds(email: string): Promise<string[]> {
  const normalizedEmail = email.toLowerCase().trim()
  const formula = encodeURIComponent(`LOWER({Email})="${normalizedEmail}"`)
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}?filterByFormula=${formula}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return (data.records || []).map((r: { id: string }) => r.id)
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
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const email = req.nextUrl.searchParams.get('email')
    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 })
    }

    const clientIds = await getClientRecordIds(email)
    console.log('[GET /api/log] email:', email, '| clientIds:', clientIds)
    if (clientIds.length === 0) {
      console.log('[GET /api/log] No client record found for email:', email)
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

    // Filter by date in Airtable. Use DATETIME_FORMAT to handle both plain-text Date fields
    // and Airtable Date type fields (which may store full ISO timestamps like 2026-04-07T00:00:00.000Z).
    // Client_id is a linked record field — Airtable formulas can't match by record ID,
    // so we filter by client in JavaScript below after fetching the date-filtered set.
    const dateConditions = targetDates.map(d => `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${d}'`).join(',')
    const filterFormula = encodeURIComponent(`OR(${dateConditions})`)
    const baseUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}?filterByFormula=${filterFormula}&sort[0][field]=Date&sort[0][direction]=desc`

    // Paginate through ALL Airtable records — default page size is 100, but busy days
    // can exceed that across all clients. Fetch until no more offset token is returned.
    const allRecords: any[] = []
    let offset: string | undefined = undefined
    do {
      const pageUrl = offset ? `${baseUrl}&offset=${offset}` : baseUrl
      const res = await fetch(pageUrl, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })
      }
      const data = await res.json()
      allRecords.push(...(data.records || []))
      offset = data.offset
    } while (offset)

    console.log('[GET /api/log] Airtable returned', allRecords.length, 'total records for dates:', targetDates, '| looking for clientIds:', clientIds)

    // Filter client-side. Check against ALL client record IDs for this email
    // to handle users with duplicate Airtable records (e.g. Playbook pre-created + sign-up).
    const filtered = allRecords.filter((r: any) => {
      const fields = r.fields
      const recordDate = (fields.Date || fields.date || '').slice(0, 10)
      const linkedIds: string[] = Array.isArray(fields.client_id) ? fields.client_id : []
      return targetDates.includes(recordDate) && linkedIds.some(id => clientIds.includes(id))
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

    console.log('[GET /api/log] Filtered to', filtered.length, 'logs for this client')
    return NextResponse.json({ logs }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('GET /api/log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { id, food_name, calories, protein_g, carbs_g, fat_g, meal_slot, notes } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const updateFields: Record<string, unknown> = {}
    if (food_name !== undefined) updateFields.food_name = food_name
    if (calories !== undefined) updateFields.calories = Number(calories)
    if (protein_g !== undefined) updateFields.protein_g = Number(protein_g)
    if (carbs_g !== undefined) updateFields.carbs_g = Number(carbs_g)
    if (fat_g !== undefined) updateFields.fat_g = Number(fat_g)
    if (meal_slot !== undefined) updateFields.meal_slot = meal_slot
    if (notes !== undefined) updateFields.notes = notes

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}/${id}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: updateFields }),
    })
    if (!res.ok) {
      const err = await res.json()
      console.error('Airtable PATCH error:', err)
      return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('PATCH /api/log error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const allClientIds = await getClientRecordIds(email)
    if (allClientIds.length === 0) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    // Target date is today if not provided
    const targetDate = date || new Date().toISOString().split('T')[0]

    // Filter by date only — client_id is a linked record field and can't be matched
    // by record ID in Airtable formulas, so JavaScript handles client filtering below.
    // Use DATETIME_FORMAT to handle both text and Airtable Date type fields.
    const deleteFilterFormula = encodeURIComponent(`DATETIME_FORMAT({Date},'YYYY-MM-DD')='${targetDate}'`)
    const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}?filterByFormula=${deleteFilterFormula}&sort[0][field]=Date&sort[0][direction]=desc`
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: 'no-store',
    })
    if (!listRes.ok) return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })

    const listData = await listRes.json()
    const records = listData.records || []

    const searchName = food_name.toLowerCase()

    // Score-based name matching — returns 0 (no match) to 4 (exact)
    function nameScore(recordName: string, searchName: string): number {
      const rn = recordName.toLowerCase().trim()
      const sn = searchName.toLowerCase().trim()
      if (rn === sn) return 4                                     // exact
      if (sn.includes(rn)) return 3                              // search is more specific than stored
      if (sn.split(' ').length > 1 && rn.includes(sn)) return 2  // multi-word phrase contained in record
      // Word overlap: require 2+ significant words to match exactly
      const sWords = sn.split(' ').filter((w: string) => w.length > 3)
      if (sWords.length < 2) return 0                            // single-word terms must be exact/contained
      const rWords = rn.split(' ')
      const hits = sWords.filter((sw: string) => rWords.some((rw: string) => rw === sw))
      return hits.length >= Math.ceil(sWords.length * 0.6) ? 1 : 0
    }

    // Find the best-scoring candidate that passes date/client/slot filters
    let bestMatch: typeof records[0] | null = null
    let bestScore = 0
    for (const r of records) {
      const fields = r.fields
      const linkedIds: string[] = Array.isArray(fields.client_id) ? fields.client_id as string[] : []
      const recordDate = ((fields.Date || fields.date || '') as string).slice(0, 10)
      const recordName = ((fields.food_name || '') as string).toLowerCase()
      const recordSlot = (fields.meal_slot || '') as string
      if (recordDate !== targetDate) continue
      if (!linkedIds.some(id => allClientIds.includes(id))) continue
      if (meal_slot && recordSlot !== meal_slot) continue
      const score = nameScore(recordName, searchName)
      if (score > bestScore) { bestScore = score; bestMatch = r }
    }
    const match = bestScore > 0 ? bestMatch : null

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
