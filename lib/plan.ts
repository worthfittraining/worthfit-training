/**
 * Plan tiers and feature flags for Nutrition by Nali
 *
 * Free     — $0    Food logging (manual + search), 5 Nali messages/day, no memory
 * Standard — $9.99 + barcode scanner, photo log (5/day), meal plans (1/week), 10 Nali messages/day, 7-day memory
 * Premium  — $29.99 + grocery list, AI check-ins, measurements + charts, unlimited meal plans,
 *             photo log (15/day), unlimited Nali, unlimited memory
 */

export type Plan = 'free' | 'standard' | 'premium'

export const PLAN_LIMITS = {
  free: {
    naliMessagesPerDay: 5,
    memoryHours: 0,
    mealPlansPerWeek: 0,
    photoLogsPerDay: 0,
    barcode: false,
    photoLog: false,
    mealPlan: false,
    groceryList: false,
    checkIns: false,
    measurements: false,
  },
  standard: {
    naliMessagesPerDay: 10,
    memoryHours: 168, // 7 days
    mealPlansPerWeek: 1,
    photoLogsPerDay: 5,
    barcode: true,
    photoLog: true,
    mealPlan: true,
    groceryList: false,
    checkIns: false,
    measurements: false,
  },
  premium: {
    naliMessagesPerDay: Infinity,
    memoryHours: Infinity,
    mealPlansPerWeek: Infinity,
    photoLogsPerDay: 15,
    barcode: true,
    photoLog: true,
    mealPlan: true,
    groceryList: true,
    checkIns: true,
    measurements: true,
  },
} as const

/** Map a Stripe price ID to a plan tier */
export function planFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_STANDARD_PRICE_ID) return 'standard'
  if (priceId === process.env.STRIPE_PREMIUM_PRICE_ID) return 'premium'
  // Fallback — legacy price IDs (old monthly/annual)
  const legacy = [
    process.env.STRIPE_MONTHLY_PRICE_ID,
    process.env.STRIPE_ANNUAL_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID,
    process.env.NEXT_PUBLIC_STRIPE_ANNUAL_PRICE_ID,
  ]
  if (legacy.includes(priceId)) return 'premium' // treat old plans as premium
  // Unknown price ID — default to standard (paying customer, don't downgrade to free)
  console.warn(`planFromPriceId: unrecognized price ID "${priceId}" — defaulting to standard`)
  return 'standard'
}

/** Resolve a plan string from Airtable to a typed Plan */
export function resolvePlan(raw: string | undefined | null): Plan {
  if (raw === 'premium') return 'premium'
  if (raw === 'standard') return 'standard'
  if (raw === 'free') return 'free'
  return 'free'
}

// ── Daily message counter (localStorage) ──────────────────────────────────

// Use local date so the daily message counter resets at local midnight, not UTC midnight.
// Without this, US users (e.g. Eastern, UTC-5) would see their limit reset at 7 PM local time.
function localDateKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const MESSAGE_STORAGE_KEY = () => `nali_msgs_${localDateKey()}`

export function getNaliMessageCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(MESSAGE_STORAGE_KEY()) || '0', 10)
}

export function incrementNaliMessageCount(): number {
  if (typeof window === 'undefined') return 0
  const key = MESSAGE_STORAGE_KEY()
  const next = parseInt(localStorage.getItem(key) || '0', 10) + 1
  localStorage.setItem(key, String(next))
  return next
}

export function canSendNaliMessage(plan: Plan): boolean {
  const limit = PLAN_LIMITS[plan].naliMessagesPerDay
  if (!isFinite(limit)) return true
  return getNaliMessageCount() < limit
}

// ── Daily photo log counter (localStorage) ────────────────────────────────

const PHOTO_STORAGE_KEY = () => `photo_log_${localDateKey()}`

export function getPhotoLogCount(): number {
  if (typeof window === 'undefined') return 0
  return parseInt(localStorage.getItem(PHOTO_STORAGE_KEY()) || '0', 10)
}

export function incrementPhotoLogCount(): number {
  if (typeof window === 'undefined') return 0
  const key = PHOTO_STORAGE_KEY()
  const next = parseInt(localStorage.getItem(key) || '0', 10) + 1
  localStorage.setItem(key, String(next))
  return next
}

export function canUsePhotoLog(plan: Plan): boolean {
  const limit = PLAN_LIMITS[plan].photoLogsPerDay
  if (!isFinite(limit)) return true
  if (limit === 0) return false
  return getPhotoLogCount() < limit
}
