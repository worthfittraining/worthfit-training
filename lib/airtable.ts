import Airtable from 'airtable'

const base = new Airtable({
  apiKey: process.env.AIRTABLE_TOKEN,
}).base(process.env.AIRTABLE_BASE_ID!)

type Fields = Airtable.FieldSet

// ── CLIENTS ──────────────────────────────────────

export async function getClientByEmail(email: string) {
  const records = await base('Clients')
    .select({ filterByFormula: `{Email} = "${email}"` })
    .firstPage()
  return records[0] || null
}

export async function createClient(data: Fields) {
  const record = await base('Clients').create(data)
  return record
}

export async function updateClient(id: string, data: Partial<Fields>) {
  const record = await base('Clients').update(id, data)
  return record
}

// ── FOOD LOGS ─────────────────────────────────────

export async function createFoodLog(data: Fields) {
  const record = await base('Food Logs').create({
    food_name: data.food_name,
    client_id: data.client_id,
    date: data.date,
    meal_slot: data.meal_slot,
    calories: data.calories,
    protein_g: data.protein_g,
    carbs_g: data.carbs_g,
    fat_g: data.fat_g,
    notes: data.notes,
    confirmed: data.confirmed,
  })
  return record
}

// ── MEAL PLANS ────────────────────────────────────

export async function createMealPlan(data: Fields) {
  const record = await base('Meal Plans').create(data)
  return record
}

export async function getMealPlan(clientId: string, weekNumber: number) {
  const records = await base('Meal Plans')
    .select({
      filterByFormula: `AND({client_id} = "${clientId}", {week_number} = ${weekNumber})`,
      sort: [{ field: 'day', direction: 'asc' }],
    })
    .all()
  return records
}

// ── SESSION CONTEXTS ──────────────────────────────

export async function createSession(data: Fields) {
  const record = await base('Session Contexts').create(data)
  return record
}

export async function getRecentSessions(clientId: string, limit = 3) {
  const records = await base('Session Contexts')
    .select({
      filterByFormula: `{client_id} = "${clientId}"`,
      sort: [{ field: 'session_date', direction: 'desc' }],
      maxRecords: limit,
    })
    .firstPage()
  return records
}export async function getRecentLogs(clientId: string, days = 1) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const dateStr = since.toISOString().split('T')[0]

  const records = await base('Food Logs')
    .select({
      filterByFormula: `AND({client_id} = "${clientId}", {date} >= "${dateStr}")`,
      sort: [{ field: 'date', direction: 'desc' }],
    })
    .firstPage()
  return records
}