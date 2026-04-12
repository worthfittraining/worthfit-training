#!/usr/bin/env node
// Sets Plan = "standard" for all Airtable records where Playbook_Active = true
// Run from your nutrition-ai folder: node scripts/playbook-set-standard.mjs

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

// Fetch all records where Playbook_Active = true
async function fetchPlaybookActive() {
  const records = []
  let offset = null
  do {
    const params = new URLSearchParams({
      filterByFormula: '{Playbook_Active}=1',
      fields: ['Email', 'Plan'],
      pageSize: '100',
    })
    if (offset) params.set('offset', offset)
    const url = `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}?${params}`
    const data = await airtableFetch(url)
    records.push(...(data.records || []))
    offset = data.offset || null
    console.log(`  Fetched ${records.length} records so far...`)
  } while (offset)
  return records
}

// Batch update records (max 10 per request per Airtable limit)
async function batchUpdate(records) {
  const chunks = []
  for (let i = 0; i < records.length; i += 10) {
    chunks.push(records.slice(i, i + 10))
  }
  let updated = 0
  for (const chunk of chunks) {
    const body = {
      records: chunk.map(r => ({
        id: r.id,
        fields: { Plan: 'standard' },
      })),
    }
    await airtableFetch(
      `https://api.airtable.com/v0/${BASE_ID}/${encodeURIComponent(TABLE)}`,
      { method: 'PATCH', body: JSON.stringify(body) }
    )
    updated += chunk.length
    process.stdout.write(`\r  Updated ${updated} / ${records.length}`)
  }
  console.log()
}

async function main() {
  console.log('Fetching all Playbook_Active = true records...')
  const records = await fetchPlaybookActive()
  console.log(`Found ${records.length} Playbook active records.`)

  // Only update records that aren't already standard or premium
  const toUpdate = records.filter(r => {
    const plan = r.fields?.Plan
    return plan !== 'standard' && plan !== 'premium'
  })

  console.log(`${records.length - toUpdate.length} already on standard or premium — skipping.`)
  console.log(`Updating ${toUpdate.length} records to Plan = standard...`)

  if (toUpdate.length === 0) {
    console.log('Nothing to update!')
    return
  }

  await batchUpdate(toUpdate)
  console.log(`\nDone! ${toUpdate.length} Playbook members set to standard.`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
