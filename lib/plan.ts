/**
 * Plan tiers and feature flags for WorthFit Training
 *
 * Free     — $0    Food logging (manual + search), 5 Nali messages/day, no memory
 * Standard — $9.99 + barcode scanner, photo log, meal plans, 30 Nali messages/day, 24hr memory
 * Premium  — $29.99 + grocery list, AI check-ins, unlimited Nali, 7-day memory
 */

export type Plan = 'free' | 'standard' | 'premium'

export const PLAN_LIMITS = {
  free: {
    naliMessagesPerDay: 5,
    memoryHours: 0,
    barcode: false,
    photoLog: false,
    mealPlan: false,
    groceryList: false,
    checkIns: false,
  },
  standard: {
    naliMessagesPerDay: 30,
    memoryHours: 24,
    barcode: true,
    photoLog: true,
    mealPlan: true,
    groceryList: false,
    checkIns: false,
  },
  premium: {
    naliMessagesPerDay: Infinity,
    memoryHours: 168, // 7 days
    barcode: true,
    photoLog: true,
    mealPlan: true,
    groceryList: true,
    checkIns: true,
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

const MESSAGE_STORAGE_KEY = () => `nali_msgs_${new Date().toISOString().split('T')[0]}`

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
