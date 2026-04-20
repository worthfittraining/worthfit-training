import Airtable from 'airtable'

function getBase() {
  return new Airtable({
    apiKey: process.env.AIRTABLE_TOKEN,
  }).base(process.env.AIRTABLE_BASE_ID!)
}

type Fields = Airtable.FieldSet

/** Fetch all pages from an Airtable select query (handles >100 records automatically) */
export async function fetchAllPages(query: Airtable.Query<Fields>): Promise<Airtable.Record<Fields>[]> {
  return new Promise((resolve, reject) => {
    const records: Airtable.Record<Fields>[] = []
    query.eachPage(
      (page, fetchNext) => { records.push(...page); fetchNext() },
      (err) => { if (err) reject(err); else resolve(records) }
    )
  })
}

/**
 * Wrap a fetch call with exponential backoff retry on Airtable 429 rate limit errors.
 * Airtable allows 5 requests/sec per base — under heavy load this kicks in.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, options)
    if (res.status !== 429) return res
    // Exponential backoff: 500ms, 1000ms, 2000ms
    const delay = 500 * Math.pow(2, attempt)
    console.warn(`Airtable rate limited (429), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
    await new Promise(r => setTimeout(r, delay))
    lastError = new Error('Airtable rate limit exceeded after retries')
  }
  throw lastError
}

// ── CLIENTS ──────────────────────────────────────

export async function getClientByEmail(email: string) {
  const normalizedEmail = email.toLowerCase().trim()
  const records = await getBase()('Clients')
    .select({ filterByFormula: `LOWER({Email}) = "${normalizedEmail}"` })
    .firstPage()
  return records[0] || null
}

export async function createClient(data: Fields) {
  const record = await getBase()('Clients').create(data)
  return record
}

export async function updateClient(id: string, data: Partial<Fields>) {
  const record = await getBase()('Clients').update(id, data)
  return record
}

// ── FOOD LOGS ─────────────────────────────────────

export async function createFoodLog(data: Fields) {
  const record = await getBase()('Food Logs').create({
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
  const record = await getBase()('Meal Plans').create(data)
  return record
}

export async function getMealPlan(clientId: string, weekNumber: number) {
  const records = await getBase()('Meal Plans')
    .select({
      filterByFormula: `AND({client_id} = "${clientId}", {week_number} = ${weekNumber})`,
      sort: [{ field: 'day', direction: 'asc' }],
    })
    .all()
  return records
}

// ── RESOURCES ─────────────────────────────────────

export async function getResources() {
  const records = await getBase()('Resources')
    .select({
      filterByFormula: `{Published} = 1`,
      sort: [{ field: 'Order', direction: 'asc' }],
    })
    .all()
  return records
}

// ── SESSION CONTEXTS ──────────────────────────────

export async function createSession(data: Fields) {
  const record = await getBase()('Session Contexts').create(data)
  return record
}

export async function getRecentSessions(clientId: string, limit = 3) {
  const records = await getBase()('Session Contexts')
    .select({
      filterByFormula: `{client_id} = "${clientId}"`,
      sort: [{ field: 'session_date', direction: 'desc' }],
      maxRecords: limit,
    })
    .firstPage()
  return records
}

export async function getRecentLogs(clientId: string, days = 1) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const dateStr = since.toISOString().split('T')[0]

  // Use eachPage (via fetchAllPages) instead of firstPage() to avoid the 100-record limit
  // for active users who log frequently across multiple days
  return fetchAllPages(
    getBase()('Food Logs').select({
      filterByFormula: `AND({client_id} = "${clientId}", {date} >= "${dateStr}")`,
      sort: [{ field: 'date', direction: 'desc' }],
    })
  )
}
