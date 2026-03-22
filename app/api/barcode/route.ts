import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'No barcode' }, { status: 400 })

  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
    const data = await res.json()

    if (data.status === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    const product = data.product
    const n = product.nutriments || {}

    return NextResponse.json({
      name: product.product_name || product.generic_name || 'Unknown Product',
      brand: product.brands || '',
      calories_per_100g: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
      protein_per_100g: Math.round((n.proteins_100g || 0) * 10) / 10,
      carbs_per_100g: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
      fat_per_100g: Math.round((n.fat_100g || 0) * 10) / 10,
      serving_size_g: parseFloat(product.serving_quantity) || null,
      image_url: product.image_front_small_url || product.image_url || null,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch product' }, { status: 500 })
  }
}