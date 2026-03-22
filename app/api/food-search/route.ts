import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query) return NextResponse.json({ results: [] })

  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,serving_size,nutriments`
    const res = await fetch(url)
    const data = await res.json()

    const results = (data.products || [])
      .filter((p: Record<string, unknown>) => {
        const n = p.nutriments as Record<string, number>
        return p.product_name && n?.['energy-kcal_100g']
      })
      .slice(0, 6)
      .map((p: Record<string, unknown>) => {
        const n = p.nutriments as Record<string, number>
        const hasPer = n['energy-kcal_serving'] !== undefined
        return {
          name: String(p.product_name || ''),
          serving: String(p.serving_size || '100g'),
          // Per serving (for display)
          calories: Math.round(hasPer ? n['energy-kcal_serving'] : n['energy-kcal_100g']),
          protein_g: Math.round((hasPer ? n['proteins_serving'] : n['proteins_100g']) || 0),
          carbs_g: Math.round((hasPer ? n['carbohydrates_serving'] : n['carbohydrates_100g']) || 0),
          fat_g: Math.round((hasPer ? n['fat_serving'] : n['fat_100g']) || 0),
          // Per 100g for quantity scaling
          cal_per_100g: Math.round(n['energy-kcal_100g'] || 0),
          protein_per_100g: Number((n['proteins_100g'] || 0).toFixed(1)),
          carbs_per_100g: Number((n['carbohydrates_100g'] || 0).toFixed(1)),
          fat_per_100g: Number((n['fat_100g'] || 0).toFixed(1)),
        }
      })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Food search error:', error)
    return NextResponse.json({ results: [] })
  }
}