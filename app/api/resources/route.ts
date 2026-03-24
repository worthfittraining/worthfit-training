import { NextResponse } from 'next/server'
import { getResources } from '@/lib/airtable'

export interface Resource {
  id: string
  title: string
  category: string
  emoji: string
  summary: string
  content: string
  order: number
}

// Fallback content — shown if Airtable Resources table isn't set up yet.
// Once you add records to Airtable with Published checked, those take over automatically.
const FALLBACK_RESOURCES: Resource[] = [
  {
    id: 'f1',
    title: 'What Are Macros and Why Do They Matter?',
    category: 'The Basics',
    emoji: '📊',
    summary: 'Protein, carbs, and fat — here\'s what they actually do for your body.',
    content: `Macros (short for macronutrients) are the three main categories of food your body uses for energy and building material. Every food you eat is made up of some combination of protein, carbohydrates, and fat.

**Protein** is the most important macro for body composition. It builds and repairs muscle tissue, keeps you full longer than carbs or fat, and requires more energy to digest — meaning you burn extra calories just by eating it. Aim for 0.7–1g per pound of body weight daily.

**Carbohydrates** are your body's preferred fuel source, especially for your brain and during exercise. The goal isn't to avoid carbs — it's to time them well and choose quality sources like rice, oats, potatoes, and fruit.

**Fat** is essential for hormone production, vitamin absorption, and brain function. It's also the most calorie-dense macro at 9 calories per gram (vs. 4 for protein and carbs). Healthy fats from avocado, olive oil, and nuts support long-term health.

**The bottom line:** tracking macros gives you a complete picture of what you're eating, not just calories. Two people can eat the same number of calories with completely different results depending on how those calories are split between protein, carbs, and fat.`,
    order: 1,
  },
  {
    id: 'f2',
    title: 'How Much Protein Do You Actually Need?',
    category: 'The Basics',
    emoji: '🥩',
    summary: 'The real answer — not the one that sells supplements.',
    content: `The most common protein recommendation you'll hear is 0.8g per kilogram of body weight. That number comes from research on preventing deficiency — not from research on building muscle or improving body composition. For active people, it's too low.

**For most people tracking macros, the target is 0.7–1g per pound of body weight.** So if you weigh 150 lbs, you're aiming for roughly 105–150g of protein per day.

Why does it matter that much?
- Protein triggers muscle protein synthesis — the process of building and repairing muscle — more than any other macro.
- It's the most filling macro per calorie, which makes sticking to a calorie target significantly easier.
- Your body can't store excess protein the way it stores carbs or fat, so daily consistency matters more than loading up on one meal.

**High-protein foods to lean on:** chicken breast, Greek yogurt, cottage cheese, eggs, ground turkey, shrimp, tuna, and protein powder for convenience.

**Practical tip:** Build every meal around a protein source first, then add carbs and fat around it. It's much easier to hit your protein goal this way than trying to catch up at dinner.`,
    order: 2,
  },
  {
    id: 'f3',
    title: 'The Simple Meal Prep Formula',
    category: 'Meal Prep',
    emoji: '🍱',
    summary: 'One formula that makes hitting your macros almost automatic.',
    content: `You don't need complicated recipes to hit your macros. Most successful meal preppers use a simple 3-part formula for every meal:

**Protein + Carb + Vegetable**

Pick one from each category, cook in bulk, and mix and match through the week.

**Protein options to batch-cook:** chicken breast or thighs, ground beef or turkey, hard-boiled eggs, canned tuna or salmon, shrimp (cooks in under 5 minutes).

**Carb options:** white rice (a rice cooker makes this effortless), sweet potatoes (roast a whole sheet pan), oats for breakfast, pasta, or regular potatoes.

**Vegetables:** roasted broccoli, mixed greens, bell peppers, spinach, zucchini — or just buy a bag of frozen vegetables. They're equally nutritious and require zero prep.

**The Sunday formula in practice:**
1. Season and bake 2–3 lbs of chicken at 400°F for 25 minutes.
2. Cook 3–4 cups of dry rice in a rice cooker.
3. Roast a sheet pan of broccoli or sweet potatoes.
4. Divide everything into 4–5 containers.

That's 5 days of lunches in about 40 minutes of active prep. Each meal is consistent and easy to log.

**Pro tip:** Season half the chicken differently from the other half. Variety keeps you from getting bored mid-week and reaching for takeout instead.`,
    order: 3,
  },
  {
    id: 'f4',
    title: 'How to Track Macros When Eating Out',
    category: 'Meal Prep',
    emoji: '🍽️',
    summary: 'Real strategies for restaurants — not just "order a salad."',
    content: `Eating out while tracking macros is completely doable once you have a few strategies. The goal isn't perfection — it's making a reasonable estimate and staying consistent overall.

**Strategy 1: Look up the restaurant beforehand.** Most chain restaurants post nutrition info online or in their app. If you know you're going to Chipotle, you can pre-log it and adjust the rest of your day around it.

**Strategy 2: Build your plate mentally.** Identify the protein, carb, and fat components. A grilled chicken sandwich is roughly 40–50g protein, 40–50g carbs, 10–20g fat depending on the bun and sauce. That's a workable estimate.

**Strategy 3: Use a tracking app's restaurant database.** Search the dish name plus the restaurant name. User-submitted entries are often close enough for a single meal.

**Strategy 4: Make simple swaps.** Ask for sauces and dressings on the side — this alone saves 100–200 calories easily. Choose grilled over fried. Swap fries for a side salad or double vegetables.

**Strategy 5: Don't stress one meal.** One restaurant meal won't derail your progress. What matters is the week as a whole. Log your best estimate and move on without guilt.

The hardest part of eating out isn't actually the food — it's the social pressure to "just enjoy it and not track." You can enjoy it AND track it. They're not mutually exclusive.`,
    order: 4,
  },
  {
    id: 'f5',
    title: 'Estimating Portions Without a Food Scale',
    category: 'The Basics',
    emoji: '✋',
    summary: 'Your hand is a surprisingly accurate measuring tool.',
    content: `A food scale is the most accurate way to track your food — but you won't always have one. Here's a hand-based system that works well for most meals.

**Protein: 1 palm = ~3–4 oz = ~20–25g protein**
A palm-sized, palm-thickness portion of chicken, fish, beef, or tofu. Most people need 1–2 palms per meal depending on their target.

**Carbs: 1 cupped hand = ~30–40g carbs**
One cupped handful of rice, oats, or pasta. One medium fist-sized potato. One medium piece of fruit.

**Fat: 1 thumb = ~10–15g fat**
One thumb-sized portion of peanut butter, butter, or oil. A small handful of nuts (about 20 almonds).

**Vegetables: 2 fists = 1 serving**
Most vegetables are so low in calories that you don't need to stress the portion size. Fill half your plate and move on.

**How accurate is this?** Studies comparing hand estimates to weighed portions find it's accurate within about 10–20%. Over a full day with multiple meals, errors tend to balance out.

**When to use a scale vs. your hand:**
- Scale: when you're new to tracking and calibrating your eye, or during a precise cut or competition prep.
- Hand estimates: when traveling, eating out, or building sustainable everyday habits.

The goal of tracking isn't perfection — it's consistency. A reasonable estimate logged every day beats a perfect log that only lasts two weeks.`,
    order: 5,
  },
  {
    id: 'f6',
    title: 'Are Carbs Really the Enemy?',
    category: 'Myths Busted',
    emoji: '🍚',
    summary: 'Short answer: no. Here\'s what the research actually says.',
    content: `Carbohydrates have been blamed for weight gain, inflammation, energy crashes, and just about everything else at some point. Most of that reputation is undeserved.

**The real story on carbs and fat loss:** Fat loss happens when you're in a calorie deficit — consuming fewer calories than you burn. Carbs themselves don't cause fat gain any more than protein or fat does. Excess calories cause fat gain. Low-carb diets work for some people not because carbs are inherently bad, but because cutting carbs makes it easier for them to eat fewer total calories.

**What carbs actually do for you:**
- Fuel your workouts and daily activity (your muscles run on glycogen, which comes from carbs)
- Power your brain (glucose is its preferred fuel source)
- Spare protein from being used for energy, so your protein goes toward building muscle instead
- Support thyroid function and hormonal health long-term

**Where people go wrong with carbs** is eating highly processed, low-fiber sources that digest quickly and don't keep you full — white bread, chips, candy. These spike blood sugar and lead to hunger within an hour. Whole food carbs like oats, rice, potatoes, and fruit digest more slowly and keep energy stable.

**Bottom line:** Carbs aren't your enemy. Eating more calories than you burn is the only real issue. Keep your carbs mostly from whole food sources, time the bulk of them around your workouts, and you'll be fine.`,
    order: 6,
  },
  {
    id: 'f7',
    title: 'Sleep, Hunger & Why You Crave Junk When You\'re Tired',
    category: 'Lifestyle',
    emoji: '😴',
    summary: 'The hormone science behind why bad sleep wrecks your diet.',
    content: `You've probably noticed that after a bad night of sleep, you're hungrier than usual — and specifically craving carbs and sugar. That's not a willpower problem. It's your hormones.

**Two hormones control hunger:** ghrelin (the "I'm hungry" signal) and leptin (the "I'm full" signal). Even a single night of poor sleep raises ghrelin and suppresses leptin. Research shows sleep-deprived people consume an average of 300–500 extra calories the following day, almost entirely from processed carbs and fat.

**It compounds.** Sleep deprivation also raises cortisol, your primary stress hormone. Elevated cortisol promotes fat storage — especially around the belly — and breaks down muscle tissue for energy. It also impairs recovery from workouts.

**What counts as enough sleep?** Most research points to 7–9 hours for adults. Less than 6 hours consistently is where hormonal disruption becomes significant and measurable.

**Practical improvements:**
- Keep a consistent wake time even on weekends — this anchors your circadian rhythm better than anything else.
- Avoid large meals within 2–3 hours of bed.
- Keep your room cool (65–68°F is the research-backed sweet spot for sleep quality).
- Limit screens and bright light in the hour before bed.

**The connection to your goals:** If your nutrition is on point but progress has stalled, sleep quality is often the overlooked variable. It affects your hunger hormones, workout recovery, daily energy, and how your body partitions the calories you eat. It's worth treating as seriously as your training.`,
    order: 7,
  },
  {
    id: 'f8',
    title: 'Alcohol and Your Macros: The Honest Breakdown',
    category: 'Lifestyle',
    emoji: '🍺',
    summary: 'What actually happens when you drink, and how to work it in.',
    content: `Alcohol is the one macronutrient that doesn't fit neatly into the protein/carb/fat framework — and that's exactly why it causes so much confusion for people tracking.

**The basics:** Alcohol contains 7 calories per gram, sitting between carbs (4 cal/g) and fat (9 cal/g). Unlike the other macros, your body can't store alcohol — it prioritizes burning it off immediately, which puts fat burning essentially on pause while it does.

**What that means in practice:** When you drink, fat oxidation slows significantly while your liver processes the alcohol. You're not necessarily storing more fat than usual — but you're delaying fat burning for however long it takes to metabolize (roughly 1 hour per standard drink).

**The real calorie trap with alcohol** usually isn't the drinks themselves — it's the food decisions that follow. Late-night eating after drinking tends to be high-calorie and hard to log, and hangover hunger the next day is real. Those typically do more damage to the week than the drinks themselves.

**How to work it in without derailing your progress:**
- Log alcohol calories as fat or carbs in your tracker (most apps have a dedicated alcohol category).
- Plan ahead — if you know you're going out Saturday, eat slightly leaner Thursday and Friday.
- Choose lower-calorie options: light beer (~100 cal), wine (~120 cal), or spirits with soda water instead of sugary mixers.
- Alternate with water — it slows consumption and significantly reduces next-day hunger.

**Bottom line:** Occasional drinking is compatible with hitting your goals. One night out doesn't undo a week of solid nutrition. What matters is the overall pattern over weeks, not any single evening.`,
    order: 8,
  },
]

export async function GET() {
  try {
    const records = await getResources()

    if (records.length > 0) {
      const resources: Resource[] = records.map(r => ({
        id: r.id,
        title: String(r.fields.Title || ''),
        category: String(r.fields.Category || 'General'),
        emoji: String(r.fields.Emoji || '📖'),
        summary: String(r.fields.Summary || ''),
        content: String(r.fields.Content || ''),
        order: Number(r.fields.Order || 99),
      }))
      return NextResponse.json({ resources })
    }
  } catch {
    // Airtable Resources table may not exist yet — fall through to defaults
  }

  return NextResponse.json({ resources: FALLBACK_RESOURCES })
}
