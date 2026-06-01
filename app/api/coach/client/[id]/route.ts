import { NextRequest, NextResponse } from 'next/server'
import { auth, currentUser } from '@clerk/nextjs/server'
import { fetchWithRetry } from '@/lib/airtable'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!

function getCoachConfig() {
  const headCoach = (process.env.HEAD_COACH_EMAIL || '').toLowerCase().trim()
  const additional = (process.env.ADDITIONAL_COACH_EMAILS || '')
    .split(',').map(e => e.toLowerCase().trim()).filter(Boolean)
  const allCoaches = Array.from(new Set([headCoach, ...additional].filter(Boolean)))
  return { headCoach, allCoaches }
}

// Build last N days as YYYY-MM-DD strings in local-ish order
function lastNDays(n: number): string[] {
  const days: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    )
  }
  return days
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const coachEmail = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()
  const { headCoach, allCoaches } = getCoachConfig()

  if (!allCoaches.includes(coachEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: clientAirtableId } = await params

  // Fetch the client to verify coach ownership
  const clientUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients/${clientAirtableId}`
  const clientRes = await fetchWithRetry(clientUrl, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: 'no-store',
  })
  if (!clientRes.ok) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const clientRecord = await clientRes.json()
  const client = clientRecord.fields

  if (coachEmail !== headCoach) {
    const assignedCoach = (client.Coach_Email as string || '').toLowerCase().trim()
    if (assignedCoach !== coachEmail) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let body: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const fields: Record<string, number> = {}
  if (body.calories !== undefined) fields['Calories'] = Number(body.calories)
  if (body.protein_g !== undefined) fields['Protein_g'] = Number(body.protein_g)
  if (body.carbs_g !== undefined) fields['Carbs_g'] = Number(body.carbs_g)
  if (body.fat_g !== undefined) fields['Fat_g'] = Number(body.fat_g)
  if (body.fiber_g !== undefined) fields['Fiber_g'] = Number(body.fiber_g)

  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  try {
    const patchRes = await fetchWithRetry(clientUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    })
    if (!patchRes.ok) {
      const err = await patchRes.text()
      return NextResponse.json({ error: err }, { status: patchRes.status })
    }
    const updated = await patchRes.json()
    const f = updated.fields
    return NextResponse.json({
      ok: true,
      targets: {
        calories: Number(f.Calories) || 0,
        protein_g: Number(f.Protein_g) || 0,
        carbs_g: Number(f.Carbs_g) || 0,
        fat_g: Number(f.Fat_g) || 0,
        fiber_g: Number(f.Fiber_g) || 0,
      },
    })
  } catch (err) {
    console.error('Update macros error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await currentUser()
  const coachEmail = (user?.primaryEmailAddress?.emailAddress || user?.emailAddresses[0]?.emailAddress || '').toLowerCase().trim()
  const { headCoach, allCoaches } = getCoachConfig()

  if (!allCoaches.includes(coachEmail)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: clientAirtableId } = await params

  try {
    // Fetch the client record
    const clientUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Clients/${clientAirtableId}`
    const clientRes = await fetchWithRetry(clientUrl, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: 'no-store',
    })
    if (!clientRes.ok) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    const clientRecord = await clientRes.json()
    const client = clientRecord.fields

    // Verify this coach owns this client (unless head coach)
    if (coachEmail !== headCoach) {
      const assignedCoach = (client.Coach_Email as string || '').toLowerCase().trim()
      if (assignedCoach !== coachEmail) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Fetch food logs for the last 14 days
    // NOTE: client_id is a linked record field in Airtable — formulas cannot filter
    // linked record fields by record ID. Instead we filter by date range only in
    // Airtable, then filter by client_id in JavaScript after fetching.
    const days = lastNDays(14)
    const oldest = days[days.length - 1]
    const dateConditions = days.map(d => `DATETIME_FORMAT({Date},'YYYY-MM-DD')='${d}'`).join(',')
    const formula = encodeURIComponent(`OR(${dateConditions})`)
    const logsUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Food%20Logs?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=desc`

    const allLogs: any[] = []
    let offset: string | undefined
    do {
      const pageUrl = offset ? `${logsUrl}&offset=${offset}` : logsUrl
      const logsRes = await fetchWithRetry(pageUrl, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
        cache: 'no-store',
      })
      if (!logsRes.ok) break
      const logsData = await logsRes.json()
      // Filter client-side: only keep logs belonging to this client
      const clientLogs = (logsData.records || []).filter((r: any) => {
        const linkedIds: string[] = Array.isArray(r.fields.client_id) ? r.fields.client_id : []
        return linkedIds.includes(clientAirtableId)
      })
      allLogs.push(...clientLogs)
      offset = logsData.offset
    } while (offset)

    // Group logs by date
    const byDate: Record<string, {
      cal: number; pro: number; carb: number; fat: number; fib: number
      items: { id: string; food_name: string; meal_slot: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; notes: string }[]
    }> = {}

    for (const date of days) byDate[date] = { cal: 0, pro: 0, carb: 0, fat: 0, fib: 0, items: [] }

    for (const record of allLogs) {
      const f = record.fields
      const date = String(f.Date || '').split('T')[0]
      if (!byDate[date]) continue
      const entry = {
        id: record.id,
        food_name: String(f.food_name || ''),
        meal_slot: String(f.meal_slot || 'snack'),
        calories: Number(f.calories) || 0,
        protein_g: Number(f.protein_g) || 0,
        carbs_g: Number(f.carbs_g) || 0,
        fat_g: Number(f.fat_g) || 0,
        fiber_g: Number(f.fiber_g) || 0,
        notes: String(f.notes || ''),
      }
      byDate[date].cal += entry.calories
      byDate[date].pro += entry.protein_g
      byDate[date].carb += entry.carbs_g
      byDate[date].fat += entry.fat_g
      byDate[date].fib += entry.fiber_g
      byDate[date].items.push(entry)
    }

    // Sort items within each day by meal slot order
    const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack', 'dessert']
    for (const date of days) {
      byDate[date].items.sort((a, b) => {
        const ai = MEAL_ORDER.indexOf(a.meal_slot)
        const bi = MEAL_ORDER.indexOf(b.meal_slot)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
    }

    return NextResponse.json({
      client: {
        id: clientAirtableId,
        name: String(client.Name || ''),
        email: String(client.Email || ''),
        goal: String(client.Goal || ''),
        program_week: Number(client.Program_week) || 1,
        targets: {
          calories: Number(client.Calories) || 0,
          protein_g: Number(client.Protein_g) || 0,
          carbs_g: Number(client.Carbs_g) || 0,
          fat_g: Number(client.Fat_g) || 0,
          fiber_g: Number(client.Fiber_g) || 0,
        },
        stats: {
          height_in: Number(client.height_in) || null,
          weight_lbs: Number(client.Weight_lbs) || null,
          age: Number(client.Age) || null,
          sex: String(client.Sex || ''),
          activity_level: String(client.Activity_Level || ''),
        },
      },
      days: days.map(date => ({
        date,
        cal: Math.round(byDate[date].cal),
        pro: Math.round(byDate[date].pro),
        carb: Math.round(byDate[date].carb),
        fat: Math.round(byDate[date].fat),
        fib: Math.round(byDate[date].fib),
        items: byDate[date].items,
      })),
    })
  } catch (err) {
    console.error('Coach client detail error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
