import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getClientByEmail, createClient, updateClient } from '@/lib/airtable'
import { calculateMacros, calculateWaterGoal } from '@/lib/macros'
import type Airtable from 'airtable'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { email, name, goal, restrictions, food_preferences, food_dislikes, height_in, weight_lbs, age, sex, activity_level, breastfeeding } = body

  const macros = calculateMacros(
    Number(weight_lbs),
    Number(height_in),
    Number(age),
    sex as 'male' | 'female',
    activity_level,
    goal,
    !!breastfeeding
  )

  const profileData: Airtable.FieldSet = {
    Name: name,
    Email: email,
    Goal: goal,
    Restrictions: restrictions,
    Preferences: food_preferences || '',
    Dislikes: food_dislikes || '',
    height_in: Number(height_in),
    Weight_lbs: Number(weight_lbs),
    Age: Number(age),
    Activity_Level: activity_level,
    Calories: macros.calories,
    Protein_g: macros.protein_g,
    Carbs_g: macros.carbs_g,
    Fat_g: macros.fat_g,
    Fiber_g: macros.fiber_g,
    Water_goal_oz: calculateWaterGoal(Number(weight_lbs)),
    Program_week: 1,
    Onboarding_complete: false,
    Meals_Per_Day: 3,
  }

  const existing = await getClientByEmail(email)

  if (existing) {
    await updateClient(existing.id, profileData)
  } else {
    await createClient(profileData)
  }

  return NextResponse.json({ success: true, macros })
}
export async function PATCH(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { email, ...fields } = body
  if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

  const existing = await getClientByEmail(email)
  if (!existing) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  await updateClient(existing.id, fields)
  return NextResponse.json({ success: true })
}

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get('email')
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const client = await getClientByEmail(email)
    if (!client) return NextResponse.json({})
    return NextResponse.json(client.fields)
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}