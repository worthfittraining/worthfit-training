import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const USDA_API_KEY = process.env.USDA_API_KEY

// Force dynamic so Next.js never caches barcode lookup responses
export const dynamic = 'force-dynamic'

// ─── Community Airtable lookup ───────────────────────────────────────────────
async function lookupCommunity(code: string) {
  try {
    const formula = encodeURIComponent(`{Barcode}="${code}"`)
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Barcode_Products?filterByFormula=${formula}&maxRecords=1`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: 'no-store',
    })
    const data = await res.json()
    const record = data.records?.[0]?.fields
    if (!record) return null
    return {
      name: String(record.Name || 'Unknown Product'),
      brand: String(record.Brand || ''),
      calories_per_100g: Number(record.Calories_per_100g || 0),
      protein_per_100g: Number(record.Protein_per_100g || 0),
      carbs_per_100g: Number(record.Carbs_per_100g || 0),
      fat_per_100g: Number(record.Fat_per_100g || 0),
      serving_size_g: record.Serving_size_g ? Number(record.Serving_size_g) : null,
      image_url: null,
      source: 'community',
    }
  } catch {
    return null
  }
}

// ─── Open Food Facts lookup (v2 API) ─────────────────────────────────────────
async function lookupOFF(code: string) {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,generic_name,brands,nutriments,serving_quantity,image_front_small_url`,
      {
        headers: { 'User-Agent': 'NutritionByNali/1.0 (worthfittraining@gmail.com)' },
        cache: 'no-store',
      }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.status === 0 || data.status === 'failure') return null
    const product = data.product
    if (!product) return null
    const n = product.nutriments || {}
    const cal = Math.round(n['energy-kcal_100g'] ?? n['energy-kcal'] ?? 0)
    const name = product.product_name || product.generic_name
    if (!cal && !name) return null
    return {
      name: name || 'Unknown Product',
      brand: product.brands || '',
      calories_per_100g: cal,
      protein_per_100g: Math.round((n.proteins_100g ?? 0) * 10) / 10,
      carbs_per_100g: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
      fat_per_100g: Math.round((n.fat_100g ?? 0) * 10) / 10,
      serving_size_g: parseFloat(product.serving_quantity) || null,
      image_url: product.image_front_small_url || null,
      source: 'openfoodfacts',
    }
  } catch {
    return null
  }
}

// ─── USDA Branded Foods lookup (by GTIN/UPC barcode) ─────────────────────────
async function lookupUSDA(code: string) {
  if (!USDA_API_KEY) return null
  try {
    // Use the GTIN/UPC direct lookup via foods/search with gtinUpc filter
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(code)}&dataType=Branded&api_key=${USDA_API_KEY}&pageSize=5`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    // Find exact GTIN/UPC match — text search may return partial matches
    const food = (data.foods || []).find(
      (f: { gtinUpc?: string }) => f.gtinUpc === code
    )
    if (!food) return null

    const nutrients = food.foodNutrients || []
    function getNutrient(name: string) {
      return (nutrients.find((n: { nutrientName: string }) =>
        n.nutrientName?.toLowerCase().includes(name.toLowerCase())
      ) as { value?: number } | undefined)?.value || 0
    }

    const cal = Math.round(getNutrient('energy') || getNutrient('calorie'))
    if (!cal) return null

    return {
      name: food.description || 'Unknown Product',
      brand: food.brandOwner || food.brandName || '',
      calories_per_100g: cal,
      protein_per_100g: Math.round(getNutrient('protein') * 10) / 10,
      carbs_per_100g: Math.round(getNutrient('carbohydrate') * 10) / 10,
      fat_per_100g: Math.round(getNutrient('total lipid') * 10) / 10,
      serving_size_g: food.servingSize && food.servingSizeUnit?.toLowerCase() === 'g'
        ? Number(food.servingSize)
        : null,
      image_url: null,
      source: 'usda',
    }
  } catch {
    return null
  }
}

// ─── GET — look up a barcode ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No barcode' }, { status: 400 })

  // 1. Community database first (fastest, user-contributed)
  const community = await lookupCommunity(code)
  if (community) return NextResponse.json(community)

  // 2. Open Food Facts + USDA in parallel
  const [off, usda] = await Promise.all([lookupOFF(code), lookupUSDA(code)])
  const result = off || usda
  if (result) return NextResponse.json(result)

  return NextResponse.json({ error: 'Product not found' }, { status: 404 })
}

// ─── POST — save a user-contributed product ───────────────────────────────────
export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json()
    const { barcode, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_size_g, added_by } = body

    if (!barcode || !name || !calories_per_100g) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // Reject zero or negative serving size — would corrupt per-100g conversion
    if (serving_size_g !== undefined && serving_size_g !== null && Number(serving_size_g) <= 0) {
      return NextResponse.json({ error: 'serving_size_g must be greater than 0' }, { status: 400 })
    }

    // Check if barcode already exists in community table
    const existing = await lookupCommunity(barcode)
    if (existing) return NextResponse.json({ success: true, action: 'already_exists' })

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Barcode_Products`
    await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Barcode: String(barcode),
          Name: String(name),
          Brand: String(brand || ''),
          Calories_per_100g: Number(calories_per_100g),
          Protein_per_100g: Number(protein_per_100g || 0),
          Carbs_per_100g: Number(carbs_per_100g || 0),
          Fat_per_100g: Number(fat_per_100g || 0),
          ...(serving_size_g ? { Serving_size_g: Number(serving_size_g) } : {}),
          Added_by: String(added_by || ''),
        },
      }),
    })

    return NextResponse.json({ success: true, action: 'created' })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
