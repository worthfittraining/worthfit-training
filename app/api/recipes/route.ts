import { NextRequest, NextResponse } from 'next/server'
import { getClientByEmail, updateClient } from '@/lib/airtable'

type SavedRecipe = {
  name: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  servings: number
  saved_at: string
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('email')
  const query = req.nextUrl.searchParams.get('q') || ''
  if (!email) return NextResponse.json({ recipes: [] })

  try {
    const client = await getClientByEmail(email)
    if (!client?.fields?.Saved_Recipes) return NextResponse.json({ recipes: [] })

    const recipes: SavedRecipe[] = JSON.parse(String(client.fields.Saved_Recipes))
    const filtered = query
      ? recipes.filter(r => r.name.toLowerCase().includes(query.toLowerCase()))
      : recipes

    return NextResponse.json({ recipes: filtered })
  } catch {
    return NextResponse.json({ recipes: [] })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, recipe } = body as { email: string; recipe: SavedRecipe }
  if (!email || !recipe) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  try {
    const client = await getClientByEmail(email)
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    let recipes: SavedRecipe[] = []
    if (client.fields?.Saved_Recipes) {
      try { recipes = JSON.parse(String(client.fields.Saved_Recipes)) } catch { recipes = [] }
    }

    // Replace if same name exists, otherwise add
    const idx = recipes.findIndex(r => r.name.toLowerCase() === recipe.name.toLowerCase())
    if (idx >= 0) recipes[idx] = recipe
    else recipes.unshift(recipe)

    await updateClient(client.id, { Saved_Recipes: JSON.stringify(recipes) })
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
