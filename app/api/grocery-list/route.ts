import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { meals } = await req.json()
    if (!meals || meals.length === 0) return NextResponse.json({ error: 'No meals provided' }, { status: 400 })

    const mealList = meals.map((m: { recipe_name: string; day: string; meal_slot: string }) =>
      `- ${m.day} ${m.meal_slot}: ${m.recipe_name}`
    ).join('\n')

    const prompt = `Based on this weekly meal plan, generate a consolidated grocery list:

${mealList}

Return ONLY a JSON object, no markdown:
{
  "categories": [
    {
      "name": "Proteins",
      "items": ["2 lbs chicken breast", "1 dozen eggs", "1 lb ground turkey"]
    },
    {
      "name": "Produce",
      "items": ["2 cups spinach", "3 bell peppers", "1 head broccoli"]
    }
  ]
}

Categories should be: Proteins, Produce, Grains & Carbs, Dairy, Pantry & Spices, Frozen.
Consolidate duplicate ingredients across meals. Include realistic quantities for 1 person for 1 week.`

    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response')
    let jsonText = content.text.trim().replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    const groceryList = JSON.parse(jsonText)
    return NextResponse.json({ groceryList })
  } catch (err) {
    console.error('Grocery list error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
