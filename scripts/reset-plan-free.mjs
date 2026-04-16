#!/usr/bin/env node
// Resets Plan = "free" for all records where:
//   - Playbook_Active = false (not a current Playbook subscriber)
//   - Plan = "standard" (was accidentally set by the botched bulk update)
//   - No active Stripe subscription (Stripe_Customer_Id is empty)
// Run from your nutrition-ai folder: node scripts/reset-plan-free.mjs

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Load .env.local
const envFile = path.join(__dirname, '..', '.env.local')
const env = fs.readFileSync(envFile, 'utf8')
for (const line of env.split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) process.env[key.trim()] = rest.join('=').trim()
}

const TOKEN = process.env.AIRTABLE_TOKEN
const BASE_ID = process.env.AIRTABLE_BASE_ID
const TABLE = 'Clients'

if (!TOKEN || !BASE_ID) {
  console.error('Missing AIRTABLE_TOKEN or AIRTABLE_BASE_ID in .env.local')
  process.exit(1)
}

async function airtableFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Airtable error ${res.status}: ${text}`)
  }
  return res.json()
}

async function fetchAllRecords() {
  const records = []
  let offset = null
  do {
    const params = new URLSearchParams({ pageSize: '100' })
    params.append('fields[]', 'Email')
    params.append('fields[]', 'Plan')
    params.append('fields[]', 'Playbook_Active')
    params.append('fields[]', 'Stripe_Customer_Id')
    if (offset) params.set('offset', offset)
    const data = await airtableFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}?${params}`
    )
    records.push(...(data.records || []))
    offset = data.offset || null
    process.stdout.write(`\r  Fetched ${records.length} records...`)
  } while (offset)
  console.log()
  return records
}

async function batchUpdate(records) {
  const chunks = []
  for (let i = 0; i < records.length; i += 10) chunks.push(records.slice(i, i + 10))
  let updated = 0
  for (const chunk of chunks) {
    await airtableFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          records: chunk.map(r => ({ id: r.id, fields: { Plan: 'free' } })),
        }),
      }
    )
    updated += chunk.length
    process.stdout.write(`\r  Reset ${updated} / ${records.length}`)
  }
  console.log()
}

async function main() {
  console.log('=== Reset Plan → free for non-subscribers ===')
  console.log('Fetching all Airtable records...')
  const all = await fetchAllRecords()
  console.log(`Total records: ${all.length}`)

  // Only reset records that:
  // 1. Are NOT Playbook active
  // 2. Have Plan = "standard" (accidentally set)
  // 3. Have no Stripe customer (not paying subscribers)
  const toReset = all.filter(r => {
    const playbookActive = !!r.fields?.Playbook_Active
    const plan = r.fields?.Plan || 'free'
    const hasStripe = !!(r.fields?.Stripe_Customer_Id || '').toString().trim()
    return !playbookActive && plan === 'standard' && !hasStripe
  })

  const protected_ = all.filter(r => {
    const playbookActive = !!r.fields?.Playbook_Active
    const plan = r.fields?.Plan || 'free'
    const hasStripe = !!(r.fields?.Stripe_Customer_Id || '').toString().trim()
    return !playbookActive && plan === 'standard' && hasStripe
  })

  console.log(`${toReset.length} records to reset to free (no Playbook, no Stripe)`)
  console.log(`${protected_.length} records kept at standard (no Playbook but has Stripe sub — leaving untouched)`)

  if (toReset.length === 0) {
    console.log('Nothing to update!')
    return
  }

  console.log('Resetting...')
  await batchUpdate(toReset)
  console.log(`\nDone! ${toReset.length} records reset to Plan = free.`)
  if (protected_.length > 0) {
    console.log(`Note: ${protected_.length} paying Stripe customers were left at standard.`)
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
