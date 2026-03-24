import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import Anthropic from '@anthropic-ai/sdk'
import { getClientByEmail } from '@/lib/airtable'

const getClient = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { recipeName, calories, protein_g, carbs_g, fat_g, email } = await req.json()
    if (!recipeName) return NextResponse.json({ error: 'Recipe name required' }, { status: 400 })

    // Get dietary restrictions from profile (non-fatal)
    let restrictions = 'None'
    try {
      const client = await getClientByEmail(email)
      const profile = client?.fields || {}
      restrictions = Array.isArray(profile.Restrictions)
        ? (profile.Restrictions as string[]).join(', ')
        : String(profile.Restrictions || 'None')
    } catch { /* continue without profile */ }

    const prompt = `Give me a detailed recipe for "${recipeName}" that matches these macros:
- Calories: ~${calories}
- Protein: ~${protein_g}g
- Carbs: ~${carbs_g}g
- Fat: ~${fat_g}g
- Dietary restrictions: ${restrictions}

Return ONLY a JSON object with this exact structure, no markdown or extra text:
{
  "servings": "1 serving",
  "prepTime": "X min",
  "cookTime": "X min",
  "ingredients": [
    { "amount": "2", "unit": "large", "item": "eggs" },
    { "amount": "1/2", "unit": "cup", "item": "oats" }
  ],
  "steps": [
    "Step 1 description",
    "Step 2 description"
  ],
  "tips": "Optional short tip or empty string"
}`

    const message = await getClient().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let jsonText = content.text.trim()
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }

    const recipe = JSON.parse(jsonText)
    return NextResponse.json({ recipe })
  } catch (err) {
    console.error('Recipe API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
