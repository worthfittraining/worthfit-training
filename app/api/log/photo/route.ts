import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageBase64, mediaType } = body

    if (!imageBase64 || !mediaType) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `You are a nutrition expert. Analyze this food photo and estimate the nutritional content.

Please identify what food(s) you see and estimate macros for the entire meal shown.

Respond ONLY with valid JSON in this exact format, no other text:
{
  "food_name": "descriptive name of the meal",
  "meal_slot": "breakfast",
  "calories": 0,
  "protein_g": 0,
  "carbs_g": 0,
  "fat_g": 0,
  "notes": "brief description of what you see and any assumptions made about portion sizes",
  "confidence": "low|medium|high"
}

For meal_slot, infer from the food type: breakfast, lunch, dinner, or snack.
Round all numbers to the nearest whole number.
Be conservative with estimates — it is better to slightly underestimate than overestimate.`,
            },
          ],
        },
      ],
    })

    console.log('Claude response:', JSON.stringify(response.content))

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('Raw text:', text)

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse nutrition data from image' }, { status: 422 })
    }

    const nutritionData = JSON.parse(jsonMatch[0])
    return NextResponse.json(nutritionData)
  } catch (error) {
    console.error('Photo analysis error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}