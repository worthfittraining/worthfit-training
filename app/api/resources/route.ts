import { NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const RESOURCES_TABLE = 'Resources'

export async function GET() {
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(RESOURCES_TABLE)}?sort[0][field]=Order&sort[0][direction]=asc`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    })

    if (!res.ok) {
      // Table might not exist yet — return empty array gracefully
      return NextResponse.json({ resources: [] })
    }

    const data = await res.json()
    const resources = (data.records || []).map((r: { id: string; fields: Record<string, unknown> }) => ({
      id: r.id,
      title: r.fields.Title || '',
      description: r.fields.Description || '',
      url: r.fields.URL || '',
      category: r.fields.Category || 'General',
      type: r.fields.Type || 'link', // 'link' | 'pdf' | 'video'
    }))

    return NextResponse.json({ resources })
  } catch {
    return NextResponse.json({ resources: [] })
  }
}
