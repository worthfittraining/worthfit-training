export function calculateMacros(
  weightLbs: number,
  heightIn: number,
  age: number,
  sex: 'male' | 'female',
  activityLevel: string,
  goal: string
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

  calories = Math.max(calories, sex === 'female' ? 1200 : 1500)

  // Macro splits
  let proteinPct = 0.30, carbsPct = 0.40, fatPct = 0.30
  if (goal === 'weight_loss') { proteinPct = 0.40; carbsPct = 0.30; fatPct = 0.30 }
  if (goal === 'performance') { proteinPct = 0.30; carbsPct = 0.50; fatPct = 0.20 }

  return {
    calories: Math.round(calories),
    protein_g: Math.round((calories * proteinPct) / 4),
    carbs_g: Math.round((calories * carbsPct) / 4),
    fat_g: Math.round((calories * fatPct) / 9),
  }
}