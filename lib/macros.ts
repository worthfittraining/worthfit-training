export function calculateMacros(
  weightLbs: number,
  heightIn: number,
  age: number,
  sex: 'male' | 'female',
  activityLevel: string,
  goal: string,
  breastfeeding = false
) {
  // Convert imperial to metric
  const weightKg = weightLbs * 0.453592
  const heightCm = heightIn * 2.54

  // Mifflin-St Jeor BMR
  const bmr =
    sex === 'female'
      ? 10 * weightKg + 6.25 * heightCm - 5 * age - 161
      : 10 * weightKg + 6.25 * heightCm - 5 * age + 5

  // Activity multipliers
  const multipliers: Record<string, number> = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  }

  const tdee = bmr * (multipliers[activityLevel] || 1.2)

  // Calorie target by goal
  let calories = tdee
  if (goal === 'weight_loss') calories = tdee - 400
  if (goal === 'performance') calories = tdee + 300
  if (goal === 'body_recomp') calories = tdee

  // Breastfeeding adds ~500 cal/day to support milk production
  if (breastfeeding) calories += 500

  calories = Math.max(calories, sex === 'female' ? 1200 : 1500)

  // Macro splits
  let proteinPct = 0.30, carbsPct = 0.40, fatPct = 0.30
  if (goal === 'weight_loss') { proteinPct = 0.40; carbsPct = 0.30; fatPct = 0.30 }
  if (goal === 'performance') { proteinPct = 0.30; carbsPct = 0.50; fatPct = 0.20 }

  // Breastfeeding: boost protein by 25g on top of percentage-based calculation
  const extraProtein = breastfeeding ? 25 : 0

  // Fiber: 14g per 1000 calories (FDA recommendation), min 25g women / 38g men
  const fiberBase = Math.round((calories / 1000) * 14)
  const fiberMin = sex === 'female' ? 25 : 38
  const fiber_g = Math.max(fiberBase, fiberMin)

  return {
    calories: Math.round(calories),
    protein_g: Math.round((calories * proteinPct) / 4) + extraProtein,
    carbs_g: Math.round((calories * carbsPct) / 4),
    fat_g: Math.round((calories * fatPct) / 9),
    fiber_g,
  }
}

// Water goal: bodyweight (lbs) / 2 = oz (common recommendation)
export function calculateWaterGoal(weightLbs: number): number {
  return Math.round(weightLbs / 2)
}