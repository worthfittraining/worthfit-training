import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Airtable from 'airtable'

function getBase() {
  return new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)
}

// GET /api/measurements?email=xxx — fetch all measurements for a user
export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = req.nextUrl.searchParams.get('email')
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  try {
    const records = await getBase()('Measurements')
      .select({
        filterByFormula: `{Email} = "${email}"`,
        sort: [{ field: 'Date', direction: 'asc' }],
        maxRecords: 365,
      })
      .all()

    const measurements = records.map(r => ({
      id: r.id,
      date: r.fields.Date,
      weight_lbs: r.fields.Weight_lbs ?? null,
      waist_in: r.fields.Waist_in ?? null,
      hips_in: r.fields.Hips_in ?? null,
      chest_in: r.fields.Chest_in ?? null,
      arms_in: r.fields.Arms_in ?? null,
      thighs_in: r.fields.Thighs_in ?? null,
      notes: r.fields.Notes ?? '',
    }))

    return NextResponse.json(measurements)
  } catch (err) {
    console.error('Measurements GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch measurements' }, { status: 500 })
  }
}

// POST /api/measurements — log a new measurement
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const { email, date, weight_lbs, waist_in, hips_in, chest_in, arms_in, thighs_in, notes } = body

    if (!email || !date) return NextResponse.json({ error: 'Missing email or date' }, { status: 400 })

    const fields: Airtable.FieldSet = { Email: email, Date: date }
    if (weight_lbs != null && weight_lbs !== '') fields.Weight_lbs = Number(weight_lbs)
    if (waist_in != null && waist_in !== '') fields.Waist_in = Number(waist_in)
    if (hips_in != null && hips_in !== '') fields.Hips_in = Number(hips_in)
    if (chest_in != null && chest_in !== '') fields.Chest_in = Number(chest_in)
    if (arms_in != null && arms_in !== '') fields.Arms_in = Number(arms_in)
    if (thighs_in != null && thighs_in !== '') fields.Thighs_in = Number(thighs_in)
    if (notes) fields.Notes = notes

    const record = await getBase()('Measurements').create(fields)
    return NextResponse.json({ id: record.id, ...fields })
  } catch (err) {
    console.error('Measurements POST error:', err)
    return NextResponse.json({ error: 'Failed to save measurement' }, { status: 500 })
  }
}

// DELETE /api/measurements?id=xxx — delete a measurement entry
export async function DELETE(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    await getBase()('Measurements').destroy(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Measurements DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete measurement' }, { status: 500 })
  }
}
