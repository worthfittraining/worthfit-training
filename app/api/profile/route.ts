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

  const existing = await getClientByEmail(email)

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
    // Set Plan to 'free' only on first-time signup (don't overwrite an existing paid plan)
    // Never overwrite Playbook_Active — that's managed exclusively by the Playbook sync webhook
    ...(!existing ? { Plan: 'free' } : {}),
    // Note: Playbook_Active is intentionally omitted here so it's never accidentally cleared
  }

  const isNewUser = !existing

  if (existing) {
    await updateClient(existing.id, profileData)
  } else {
    await createClient(profileData)
  }

  // Add new Worth Fit sign-ups to Flodesk automatically
  // Existing users re-submitting onboarding are skipped (no duplicate adds)
  if (isNewUser && process.env.FLODESK_API_KEY) {
    try {
      const firstName = name?.split(' ')[0] || ''
      await fetch('https://api.flodesk.com/v1/subscribers', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${process.env.FLODESK_API_KEY}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          'User-Agent': 'WorthFit/1.0',
        },
        body: JSON.stringify({
          email,
          first_name: firstName,
          segments: ['Worth Fit App'],
        }),
      })
      console.log('Flodesk: added new sign-up', email)
    } catch (err) {
      // Non-fatal — don't block onboarding if Flodesk is down
      console.error('Flodesk sync error (non-fatal):', err)
    }
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

    const fields = client.fields
    const rawPlan = String(fields.Plan || 'free')
    const playbookActive = !!fields.Playbook_Active

    // Resolve effective plan:
    // Premium (paid) > Standard (paid) > Playbook active (comped Standard) > Free
    // This means every consumer of the profile API automatically gets the right
    // plan without needing to know about Playbook_Active separately.
    let effectivePlan = rawPlan
    if (rawPlan !== 'premium' && rawPlan !== 'standard' && playbookActive) {
      effectivePlan = 'standard'
    }

    return NextResponse.json({ ...fields, Plan: effectivePlan, Playbook_Active: playbookActive })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}