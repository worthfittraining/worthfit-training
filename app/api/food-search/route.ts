import { NextRequest, NextResponse } from 'next/server'
import { getClientByEmail } from '@/lib/airtable'

// Built-in common foods — instant results, no API needed
const COMMON_FOODS = [
  { name: 'Chicken breast (cooked)', serving: '100g', calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, cal_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fat_per_100g: 3.6 },
  { name: 'Chicken thigh (cooked)', serving: '100g', calories: 209, protein_g: 26, carbs_g: 0, fat_g: 11, cal_per_100g: 209, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 11 },
  { name: 'Ground beef 80/20 (cooked)', serving: '100g', calories: 254, protein_g: 26, carbs_g: 0, fat_g: 17, cal_per_100g: 254, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 17 },
  { name: 'Ground beef 93/7 (cooked)', serving: '100g', calories: 218, protein_g: 27, carbs_g: 0, fat_g: 12, cal_per_100g: 218, protein_per_100g: 27, carbs_per_100g: 0, fat_per_100g: 12 },
  { name: 'Salmon (cooked)', serving: '100g', calories: 208, protein_g: 20, carbs_g: 0, fat_g: 13, cal_per_100g: 208, protein_per_100g: 20, carbs_per_100g: 0, fat_per_100g: 13 },
  { name: 'Tilapia (cooked)', serving: '100g', calories: 128, protein_g: 26, carbs_g: 0, fat_g: 3, cal_per_100g: 128, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 3 },
  { name: 'Shrimp (cooked)', serving: '100g', calories: 99, protein_g: 24, carbs_g: 0, fat_g: 0.3, cal_per_100g: 99, protein_per_100g: 24, carbs_per_100g: 0, fat_per_100g: 0.3 },
  { name: 'Tuna (canned in water)', serving: '100g', calories: 116, protein_g: 26, carbs_g: 0, fat_g: 1, cal_per_100g: 116, protein_per_100g: 26, carbs_per_100g: 0, fat_per_100g: 1 },
  { name: 'Egg (large, whole)', serving: '1 egg (50g)', calories: 72, protein_g: 6, carbs_g: 0.4, fat_g: 5, cal_per_100g: 143, protein_per_100g: 13, carbs_per_100g: 0.7, fat_per_100g: 10 },
  { name: 'Egg whites', serving: '100g', calories: 52, protein_g: 11, carbs_g: 0.7, fat_g: 0.2, cal_per_100g: 52, protein_per_100g: 11, carbs_per_100g: 0.7, fat_per_100g: 0.2 },
  { name: 'Greek yogurt (plain, 0% fat)', serving: '100g', calories: 59, protein_g: 10, carbs_g: 3.6, fat_g: 0.4, cal_per_100g: 59, protein_per_100g: 10, carbs_per_100g: 3.6, fat_per_100g: 0.4 },
  { name: 'Cottage cheese (low fat)', serving: '100g', calories: 72, protein_g: 12, carbs_g: 2.7, fat_g: 1, cal_per_100g: 72, protein_per_100g: 12, carbs_per_100g: 2.7, fat_per_100g: 1 },
  { name: 'White rice (cooked)', serving: '100g', calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, cal_per_100g: 130, protein_per_100g: 2.7, carbs_per_100g: 28, fat_per_100g: 0.3 },
  { name: 'Brown rice (cooked)', serving: '100g', calories: 112, protein_g: 2.6, carbs_g: 24, fat_g: 0.9, cal_per_100g: 112, protein_per_100g: 2.6, carbs_per_100g: 24, fat_per_100g: 0.9 },
  { name: 'Oats (dry)', serving: '100g', calories: 389, protein_g: 17, carbs_g: 66, fat_g: 7, cal_per_100g: 389, protein_per_100g: 17, carbs_per_100g: 66, fat_per_100g: 7 },
  { name: 'Oatmeal (cooked, water)', serving: '100g', calories: 71, protein_g: 2.5, carbs_g: 12, fat_g: 1.5, cal_per_100g: 71, protein_per_100g: 2.5, carbs_per_100g: 12, fat_per_100g: 1.5 },
  { name: 'Sweet potato (cooked)', serving: '100g', calories: 86, protein_g: 1.6, carbs_g: 20, fat_g: 0.1, cal_per_100g: 86, protein_per_100g: 1.6, carbs_per_100g: 20, fat_per_100g: 0.1 },
  { name: 'Potato (baked)', serving: '100g', calories: 93, protein_g: 2.5, carbs_g: 21, fat_g: 0.1, cal_per_100g: 93, protein_per_100g: 2.5, carbs_per_100g: 21, fat_per_100g: 0.1 },
  { name: 'Pasta (cooked)', serving: '100g', calories: 158, protein_g: 5.8, carbs_g: 31, fat_g: 0.9, cal_per_100g: 158, protein_per_100g: 5.8, carbs_per_100g: 31, fat_per_100g: 0.9 },
  { name: 'Bread (white, 1 slice)', serving: '1 slice (28g)', calories: 79, protein_g: 2.7, carbs_g: 15, fat_g: 1, cal_per_100g: 266, protein_per_100g: 9, carbs_per_100g: 49, fat_per_100g: 3.2 },
  { name: 'Bread (whole wheat, 1 slice)', serving: '1 slice (28g)', calories: 69, protein_g: 3.6, carbs_g: 12, fat_g: 1.1, cal_per_100g: 247, protein_per_100g: 13, carbs_per_100g: 41, fat_per_100g: 3.4 },
  { name: 'Banana', serving: '1 medium (118g)', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.4, cal_per_100g: 89, protein_per_100g: 1.1, carbs_per_100g: 23, fat_per_100g: 0.3 },
  { name: 'Apple', serving: '1 medium (182g)', calories: 95, protein_g: 0.5, carbs_g: 25, fat_g: 0.3, cal_per_100g: 52, protein_per_100g: 0.3, carbs_per_100g: 14, fat_per_100g: 0.2 },
  { name: 'Blueberries', serving: '100g', calories: 57, protein_g: 0.7, carbs_g: 14, fat_g: 0.3, cal_per_100g: 57, protein_per_100g: 0.7, carbs_per_100g: 14, fat_per_100g: 0.3 },
  { name: 'Strawberries', serving: '100g', calories: 32, protein_g: 0.7, carbs_g: 7.7, fat_g: 0.3, cal_per_100g: 32, protein_per_100g: 0.7, carbs_per_100g: 7.7, fat_per_100g: 0.3 },
  { name: 'Broccoli (cooked)', serving: '100g', calories: 35, protein_g: 2.4, carbs_g: 7.2, fat_g: 0.4, cal_per_100g: 35, protein_per_100g: 2.4, carbs_per_100g: 7.2, fat_per_100g: 0.4 },
  { name: 'Spinach (raw)', serving: '100g', calories: 23, protein_g: 2.9, carbs_g: 3.6, fat_g: 0.4, cal_per_100g: 23, protein_per_100g: 2.9, carbs_per_100g: 3.6, fat_per_100g: 0.4 },
  { name: 'Avocado', serving: '100g', calories: 160, protein_g: 2, carbs_g: 9, fat_g: 15, cal_per_100g: 160, protein_per_100g: 2, carbs_per_100g: 9, fat_per_100g: 15 },
  { name: 'Almonds', serving: '100g', calories: 579, protein_g: 21, carbs_g: 22, fat_g: 50, cal_per_100g: 579, protein_per_100g: 21, carbs_per_100g: 22, fat_per_100g: 50 },
  { name: 'Peanut butter', serving: '2 tbsp (32g)', calories: 188, protein_g: 8, carbs_g: 6, fat_g: 16, cal_per_100g: 588, protein_per_100g: 25, carbs_per_100g: 20, fat_per_100g: 50 },
  { name: 'Whole milk', serving: '1 cup (244ml)', calories: 149, protein_g: 8, carbs_g: 12, fat_g: 8, cal_per_100g: 61, protein_per_100g: 3.2, carbs_per_100g: 4.8, fat_per_100g: 3.3 },
  { name: 'Skim milk', serving: '1 cup (244ml)', calories: 83, protein_g: 8, carbs_g: 12, fat_g: 0.2, cal_per_100g: 34, protein_per_100g: 3.4, carbs_per_100g: 5, fat_per_100g: 0.1 },
  { name: 'Cheddar cheese', serving: '100g', calories: 403, protein_g: 25, carbs_g: 1.3, fat_g: 33, cal_per_100g: 403, protein_per_100g: 25, carbs_per_100g: 1.3, fat_per_100g: 33 },
  { name: 'Olive oil', serving: '1 tbsp (14g)', calories: 119, protein_g: 0, carbs_g: 0, fat_g: 14, cal_per_100g: 884, protein_per_100g: 0, carbs_per_100g: 0, fat_per_100g: 100 },
  { name: 'Black beans (cooked)', serving: '100g', calories: 132, protein_g: 8.9, carbs_g: 24, fat_g: 0.5, cal_per_100g: 132, protein_per_100g: 8.9, carbs_per_100g: 24, fat_per_100g: 0.5 },
  { name: 'Lentils (cooked)', serving: '100g', calories: 116, protein_g: 9, carbs_g: 20, fat_g: 0.4, cal_per_100g: 116, protein_per_100g: 9, carbs_per_100g: 20, fat_per_100g: 0.4 },
  { name: 'Protein powder (whey, 1 scoop)', serving: '1 scoop (30g)', calories: 120, protein_g: 24, carbs_g: 3, fat_g: 2, cal_per_100g: 400, protein_per_100g: 80, carbs_per_100g: 10, fat_per_100g: 6 },
]

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  const email = req.nextUrl.searchParams.get('email')
  if (!query) return NextResponse.json({ results: [] })

  const q = query.toLowerCase()

  // Always search built-in foods instantly
  const builtIn = COMMON_FOODS
    .filter(f => f.name.toLowerCase().includes(q))
    .slice(0, 4)
    .map(f => ({ ...f, is_recipe: false }))

  try {
    // Run OFF search and saved recipes in parallel, with a 5s timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const [offRes, savedRecipes] = await Promise.all([
      fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=10&fields=product_name,serving_size,nutriments`,
        { signal: controller.signal }
      ).catch(() => null),
      email ? fetchSavedRecipes(email, query) : Promise.resolve([]),
    ])

    clearTimeout(timeout)

    let offResults: typeof COMMON_FOODS = []
    if (offRes?.ok) {
      const offData = await offRes.json().catch(() => ({ products: [] }))
      offResults = (offData.products || [])
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
    }

    // Saved recipes first, then built-in matches, then OFF results (deduped by name)
    const builtInNames = new Set(builtIn.map(f => f.name.toLowerCase()))
    const dedupedOff = offResults.filter(f => !builtInNames.has(f.name.toLowerCase()))

    const results = [...savedRecipes, ...builtIn, ...dedupedOff]
    return NextResponse.json({ results })
  } catch {
    // If everything fails, at least return the built-in matches
    return NextResponse.json({ results: builtIn })
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
