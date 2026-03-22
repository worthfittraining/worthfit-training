import { NextRequest, NextResponse } from 'next/server'
import { getClientByEmail } from '@/lib/airtable'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  const email = req.nextUrl.searchParams.get('email')
  if (!query) return NextResponse.json({ results: [] })

  try {
    // Search Open Food Facts and saved recipes in parallel
    const [offRes, savedRecipes] = await Promise.all([
      fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8&fields=product_name,serving_size,nutriments`),
      email ? fetchSavedRecipes(email, query) : Promise.resolve([]),
    ])

    const offData = await offRes.json()

    const offResults = (offData.products || [])
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
          calories: Math.round(hasPer ? n['energy-kcal_serving'] : n['energy-kcal_100g']),
          protein_g: Math.round((hasPer ? n['proteins_serving'] : n['proteins_100g']) || 0),
          carbs_g: Math.round((hasPer ? n['carbohydrates_serving'] : n['carbohydrates_100g']) || 0),
          fat_g: Math.round((hasPer ? n['fat_serving'] : n['fat_100g']) || 0),
          cal_per_100g: Math.round(n['energy-kcal_100g'] || 0),
          protein_per_100g: Number((n['proteins_100g'] || 0).toFixed(1)),
          carbs_per_100g: Number((n['carbohydrates_100g'] || 0).toFixed(1)),
          fat_per_100g: Number((n['fat_100g'] || 0).toFixed(1)),
          is_recipe: false,
        }
      })

    // Combine: saved recipes first, then OFF results
    const results = [...savedRecipes, ...offResults]
    return NextResponse.json({ results })
  } catch (error) {
    console.error('Food search error:', error)
    return NextResponse.json({ results: [] })
  }
}

async function fetchSavedRecipes(email: string, query: string) {
  try {
    const client = await getClientByEmail(email)
    if (!client?.fields?.Saved_Recipes) return []
    const recipes = JSON.parse(String(client.fields.Saved_Recipes))
    return recipes
      .filter((r: { name: string }) => r.name.toLowerCase().includes(query.toLowerCase()))
      .map((r: { name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number }) => ({
        name: `⭐ ${r.name}`,
        serving: '1 serving',
        calories: r.calories,
        protein_g: r.protein_g,
        carbs_g: r.carbs_g,
        fat_g: r.fat_g,
        cal_per_100g: r.calories,
        protein_per_100g: r.protein_g,
        carbs_per_100g: r.carbs_g,
        fat_per_100g: r.fat_g,
        is_recipe: true,
      }))
  } catch {
    return []
  }
}
