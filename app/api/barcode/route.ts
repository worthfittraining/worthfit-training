import { NextRequest, NextResponse } from 'next/server'

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN!
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID!
const USDA_API_KEY = process.env.USDA_API_KEY

// ─── Community Airtable lookup ───────────────────────────────────────────────
async function lookupCommunity(code: string) {
  try {
    const formula = encodeURIComponent(`{Barcode}="${code}"`)
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Barcode_Products?filterByFormula=${formula}&maxRecords=1`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
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

// ─── Open Food Facts lookup ───────────────────────────────────────────────────
async function lookupOFF(code: string) {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
    const data = await res.json()
    if (data.status === 0) return null
    const product = data.product
    const n = product.nutriments || {}
    const cal = Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0)
    if (!cal && !product.product_name) return null
    return {
      name: product.product_name || product.generic_name || 'Unknown Product',
      brand: product.brands || '',
      calories_per_100g: cal,
      protein_per_100g: Math.round((n.proteins_100g || 0) * 10) / 10,
      carbs_per_100g: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
      fat_per_100g: Math.round((n.fat_100g || 0) * 10) / 10,
      serving_size_g: parseFloat(product.serving_quantity) || null,
      image_url: product.image_front_small_url || product.image_url || null,
      source: 'openfoodfacts',
    }
  } catch {
    return null
  }
}

// ─── USDA Branded Foods lookup ────────────────────────────────────────────────
async function lookupUSDA(code: string) {
  if (!USDA_API_KEY) return null
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${code}&dataType=Branded&api_key=${USDA_API_KEY}&pageSize=1`
    const res = await fetch(url)
    const data = await res.json()
    const food = data.foods?.[0]
    if (!food) return null

    // Check GTIN/UPC matches
    if (food.gtinUpc && food.gtinUpc !== code) return null

    const nutrients = food.foodNutrients || []
    function getNutrient(name: string) {
      return nutrients.find((n: { nutrientName: string }) =>
        n.nutrientName?.toLowerCase().includes(name.toLowerCase())
      )?.value || 0
    }

    const cal = Math.round(getNutrient('energy') || getNutrient('calories'))
    if (!cal) return null

    return {
      name: food.description || food.lowercaseDescription || 'Unknown Product',
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
  try {
    const body = await req.json()
    const { barcode, name, brand, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, serving_size_g, added_by } = body

    if (!barcode || !name || !calories_per_100g) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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
