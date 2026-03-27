import { NextRequest, NextResponse } from 'next/server'
import Airtable from 'airtable'
import Anthropic from '@anthropic-ai/sdk'

const getBase = () => new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(process.env.AIRTABLE_BASE_ID!)
const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getClientRecordId(email: string): Promise<string | null> {
  try {
    const records = await getBase()('Clients').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1,
    }).firstPage()
    return records.length > 0 ? records[0].id : null
  } catch { return null }
}

async function getClientProfile(email: string) {
  try {
    const records = await getBase()('Clients').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1,
    }).firstPage()
    return records.length > 0 ? records[0].fields : null
  } catch { return null }
}

function getWeekNumber(): number {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  return Math.ceil((now.getTime() - startOfYear.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email')
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const clientRecordId = await getClientRecordId(email)
    if (!clientRecordId) return NextResponse.json({ meals: [] })

    const weekNumber = getWeekNumber()
    const allRecords = await getBase()('Meal Plans').select().all()

    const meals = allRecords
      .filter(r => {
        const clientIds = (r.fields.client_id as string[]) || []
        return clientIds.includes(clientRecordId) && Number(r.fields.week_number) === weekNumber
      })
      .map(r => ({
        id: r.id,
        recipe_name: r.fields.recipe_name,
        day: r.fields.Day,
        meal_slot: r.fields.Meal_slot,
        calories: r.fields.calories,
        protein_g: r.fields.protein_g,
        carbs_g: r.fields.carbs_g,
        fat_g: r.fields.fat_g,
        notes: r.fields.Notes,
      }))

    console.log('Meal plan GET found:', meals.length, 'meals for week', weekNumber)
    return NextResponse.json({ meals })
  } catch (error) {
    console.error('Meal plan GET error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, recipe_name, calories, protein_g, carbs_g, fat_g, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    const record = await getBase()('Meal Plans').update(id, {
      recipe_name: String(recipe_name || ''),
      calories: Number(calories) || 0,
      protein_g: Number(protein_g) || 0,
      carbs_g: Number(carbs_g) || 0,
      fat_g: Number(fat_g) || 0,
      Notes: String(notes || ''),
    } as Airtable.FieldSet)

    return NextResponse.json({ ok: true, id: record.id })
  } catch (error) {
    console.error('Meal plan PATCH error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      email,
      uniqueBreakfasts = 7,
      uniqueLunches = 7,
      uniqueDinners = 7,
      includeSnacks = false,
      weekPreferences = '',
    } = await req.json()
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    console.log('Generating meal plan for:', email)

    const [clientRecordId, profile] = await Promise.all([
      getClientRecordId(email),
      getClientProfile(email),
    ])

    if (!clientRecordId || !profile) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const weekNumber = getWeekNumber()
    const calories = Number(profile.Calories) || 2000
    const protein = Number(profile.Protein_g) || 150
    const carbs = Number(profile.Carbs_g) || 200
    const fat = Number(profile.Fat_g) || 65
    const restrictions = Array.isArray(profile.Restrictions)
      ? profile.Restrictions.join(', ')
      : (profile.Restrictions || 'None')
    const dislikes = profile.Dislikes || 'None'
    const goal = profile.Goal || 'general health'

    const slots = includeSnacks
      ? ['breakfast', 'lunch', 'dinner', 'snack']
      : ['breakfast', 'lunch', 'dinner']

    const totalMeals = 7 * slots.length

    const prompt = `You are a nutrition coach creating a 7-day meal plan. Return ONLY a valid JSON array, no other text or markdown.

Client details:
- Goal: ${goal}
- Daily targets: ${calories} calories, ${protein}g protein, ${carbs}g carbs, ${fat}g fat
- Dietary restrictions: ${restrictions}
- Dislikes: ${dislikes}
${weekPreferences ? `- Special requests for this week: ${weekPreferences}` : ''}

Meal variety for this plan:
- Breakfasts: ${uniqueBreakfasts} unique recipe(s) total, repeated across all 7 days as needed
- Lunches: ${uniqueLunches} unique recipe(s) total, repeated across all 7 days as needed
- Dinners: ${uniqueDinners} unique recipe(s) total, repeated across all 7 days as needed
${includeSnacks ? '- Snacks: 1-2 different snack options, one per day' : ''}

IMPORTANT RULES:
- Return exactly ${totalMeals} meal objects (one per day per slot for all 7 days)
- When a meal repeats across days, use the EXACT same recipe_name, calories, protein_g, carbs_g, fat_g, and notes
- Spread repeated meals throughout the week — don't cluster them all at the start
- Each meal's macros should help hit the daily targets when combined

Each object must have exactly these keys:
- "day": one of Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday
- "meal_slot": one of ${slots.join(', ')}
- "recipe_name": a descriptive meal name
- "calories": number
- "protein_g": number
- "carbs_g": number
- "fat_g": number
- "notes": brief prep note or empty string

Return ONLY the JSON array, nothing else.`

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    let jsonText = content.text.trim()
    if (jsonText.includes('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }

    const mealPlan = JSON.parse(jsonText)
    if (!Array.isArray(mealPlan)) throw new Error('Response is not an array')

    console.log('Generated', mealPlan.length, 'meals, saving to Airtable...')

    // Delete existing plan for this week
    const existingRecords = await getBase()('Meal Plans').select().all()
    const toDelete = existingRecords.filter(r => {
      const clientIds = (r.fields.client_id as string[]) || []
      return clientIds.includes(clientRecordId) && Number(r.fields.week_number) === weekNumber
    })
    for (const record of toDelete) {
      await getBase()('Meal Plans').destroy(record.id)
    }

    // Save new meals
    const savedMeals = []
    for (const meal of mealPlan) {
      const record = await getBase()('Meal Plans').create({
        recipe_name: String(meal.recipe_name || ''),
        client_id: [clientRecordId],
        week_number: weekNumber,
        Day: String(meal.day || ''),
        Meal_slot: String(meal.meal_slot || ''),
        calories: Number(meal.calories) || 0,
        protein_g: Number(meal.protein_g) || 0,
        carbs_g: Number(meal.carbs_g) || 0,
        fat_g: Number(meal.fat_g) || 0,
        Notes: String(meal.notes || ''),
      } as Airtable.FieldSet)
      savedMeals.push({ id: record.id, ...meal })
    }

    console.log('Saved', savedMeals.length, 'meals successfully!')
    return NextResponse.json({ meals: savedMeals })
  } catch (error) {
    console.error('Meal plan POST error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}