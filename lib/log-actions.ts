/**
 * Server-side food log operations — used by the chat route's tool use loop.
 * Keeps Airtable logic out of the frontend and centralises it here alongside lib/airtable.ts.
 */

import { fetchWithRetry } from './airtable'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const FOOD_LOGS_TABLE = 'Food Logs'
const CLIENTS_TABLE = 'Clients'

/** Returns all Airtable record IDs for a given email (handles duplicate records) */
export async function getClientRecordIds(email: string): Promise<string[]> {
  const normalizedEmail = email.toLowerCase().trim()
  const formula = encodeURIComponent(`LOWER({Email})="${normalizedEmail}"`)
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(CLIENTS_TABLE)}?filterByFormula=${formula}`
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: 'no-store',
  })
  const data = await res.json()
  return (data.records || []).map((r: { id: string }) => r.id)
}

export type SaveLogInput = {
  food_name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  meal_slot: string
  notes?: string
}

/** Save a food log entry for a user on a given date */
export async function saveLog(
  email: string,
  logData: SaveLogInput,
  date: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const clientIds = await getClientRecordIds(email)
  if (clientIds.length === 0) return { ok: false, error: 'Client not found' }

  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${AIRTABLE_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        food_name: logData.food_name,
        calories: Number(logData.calories) || 0,
        protein_g: Number(logData.protein_g) || 0,
        carbs_g: Number(logData.carbs_g) || 0,
        fat_g: Number(logData.fat_g) || 0,
        fiber_g: Number(logData.fiber_g) || 0,
        meal_slot: logData.meal_slot || 'snack',
        notes: logData.notes || '',
        Date: date,
        client_id: [clientIds[0]],
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('saveLog Airtable error:', err)
    return { ok: false, error: `Airtable error ${res.status}` }
  }

  const record = await res.json()
  return { ok: true, id: record.id }
}

/** Score-based food name matching — same logic as the delete route */
function nameScore(recordName: string, searchName: string): number {
  const rn = recordName.toLowerCase().trim()
  const sn = searchName.toLowerCase().trim()
  if (rn === sn) return 4
  if (sn.includes(rn)) return 3
  if (sn.split(' ').length > 1 && rn.includes(sn)) return 2
  const sWords = sn.split(' ').filter((w: string) => w.length > 3)
  if (sWords.length < 2) return 0
  const rWords = rn.split(' ')
  const hits = sWords.filter((sw: string) => rWords.some((rw: string) => rw === sw))
  return hits.length >= Math.ceil(sWords.length * 0.6) ? 1 : 0
}

/** Delete a food log entry by name + meal slot for a given date */
export async function deleteLog(
  email: string,
  food_name: string,
  meal_slot: string,
  date: string
): Promise<{ ok: boolean; deleted?: string; error?: string }> {
  const clientIds = await getClientRecordIds(email)
  if (clientIds.length === 0) return { ok: false, error: 'Client not found' }

  const filterFormula = encodeURIComponent(`DATETIME_FORMAT({Date},'YYYY-MM-DD')='${date}'`)
  const listUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}?filterByFormula=${filterFormula}`
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    cache: 'no-store',
  })
  if (!listRes.ok) return { ok: false, error: 'Failed to fetch logs' }

  const listData = await listRes.json()
  const records = listData.records || []
  const searchName = food_name.toLowerCase()

  let bestMatch: typeof records[0] | null = null
  let bestScore = 0

  for (const r of records) {
    const fields = r.fields
    const linkedIds: string[] = Array.isArray(fields.client_id) ? fields.client_id : []
    const recordDate = ((fields.Date || fields.date || '') as string).slice(0, 10)
    const recordName = ((fields.food_name || '') as string)
    const recordSlot = (fields.meal_slot || '') as string
    if (recordDate !== date) continue
    if (!linkedIds.some((id: string) => clientIds.includes(id))) continue
    if (meal_slot && recordSlot !== meal_slot) continue
    const score = nameScore(recordName, searchName)
    if (score > bestScore) { bestScore = score; bestMatch = r }
  }

  if (!bestMatch || bestScore === 0) return { ok: false, error: 'No matching food found' }

  const delUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(FOOD_LOGS_TABLE)}/${bestMatch.id}`
  const delRes = await fetch(delUrl, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  })

  if (!delRes.ok) return { ok: false, error: 'Failed to delete' }
  return { ok: true, deleted: bestMatch.fields.food_name as string }
}

export type MoveLogInput = {
  food_name: string
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  from_slot: string
  to_slot: string
}

/** Move a food entry from one meal slot to another (delete + re-log) */
export async function moveLog(
  email: string,
  moveData: MoveLogInput,
  date: string
): Promise<{ ok: boolean; error?: string }> {
  await deleteLog(email, moveData.food_name, moveData.from_slot, date)
  return saveLog(email, {
    food_name: moveData.food_name,
    calories: moveData.calories || 0,
    protein_g: moveData.protein_g || 0,
    carbs_g: moveData.carbs_g || 0,
    fat_g: moveData.fat_g || 0,
    meal_slot: moveData.to_slot,
  }, date)
}
