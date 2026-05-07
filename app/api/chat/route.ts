import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getClientByEmail } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/prompts'
import { saveLog, deleteLog, moveLog } from '@/lib/log-actions'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Local date string YYYY-MM-DD — avoids UTC off-by-one for US users after ~7 PM */
function localDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'log_food',
    description: "Save a food item to the user's food diary. Call this whenever the user describes food they ate or drank — do not ask for confirmation first.",
    input_schema: {
      type: 'object' as const,
      properties: {
        food_name: { type: 'string', description: 'Full description of the food and portion size' },
        calories:  { type: 'number', description: 'Estimated calories' },
        protein_g: { type: 'number', description: 'Estimated protein in grams' },
        carbs_g:   { type: 'number', description: 'Estimated carbs in grams' },
        fat_g:     { type: 'number', description: 'Estimated fat in grams' },
        fiber_g:   { type: 'number', description: 'Estimated fiber in grams' },
        meal_slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Which meal this belongs to' },
        notes:     { type: 'string', description: 'Any additional notes' },
      },
      required: ['food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'meal_slot'],
    },
  },
  {
    name: 'delete_food',
    description: "Remove a food item from the user's food diary for today. Call this when the user asks to remove, delete, or says they didn't eat something.",
    input_schema: {
      type: 'object' as const,
      properties: {
        food_name: { type: 'string', description: 'The name of the food to remove' },
        meal_slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Which meal slot to remove from' },
      },
      required: ['food_name', 'meal_slot'],
    },
  },
  {
    name: 'move_food',
    description: 'Move a food item from one meal slot to another. Call this when the user says a food was logged in the wrong meal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        food_name: { type: 'string' },
        calories:  { type: 'number' },
        protein_g: { type: 'number' },
        carbs_g:   { type: 'number' },
        fat_g:     { type: 'number' },
        from_slot: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
        to_slot:   { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
      },
      required: ['food_name', 'from_slot', 'to_slot'],
    },
  },
]

export type ChatAction = { type: 'logged' | 'deleted' | 'moved'; food_name: string }

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages, email, mode } = await req.json()

    // Get client profile (non-fatal — chat works without it)
    let profile: Record<string, unknown> = {}
    try {
      const clientRecord = await getClientByEmail(email)
      profile = (clientRecord?.fields as Record<string, unknown>) || {}
    } catch (err) {
      console.warn('Airtable profile lookup failed (continuing):', err)
    }

    const systemPrompt = buildSystemPrompt(profile, 'Nali', 'Your Coach', mode)

    // Anthropic requires messages to start with a user turn
    const firstUserIdx = messages.findIndex((m: { role: string }) => m.role === 'user')
    const cleanedMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : messages
    if (cleanedMessages.length === 0) {
      return NextResponse.json({ error: 'No user message found' }, { status: 400 })
    }

    const today = localDateString()
    const actions: ChatAction[] = []

    // ── Agentic tool-use loop ──────────────────────────────────────────────────
    // Claude may call tools (log_food, delete_food, move_food) before writing its
    // final text reply. We execute each tool server-side, pass the result back,
    // and repeat until Claude stops calling tools.
    const loopMessages: Anthropic.MessageParam[] = [...cleanedMessages]

    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: loopMessages,
      tools: TOOLS,
    })

    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolUse of toolUseBlocks) {
        const input = toolUse.input as Record<string, unknown>
        let resultContent: string

        if (toolUse.name === 'log_food') {
          const result = await saveLog(email, {
            food_name: input.food_name as string,
            calories:  input.calories  as number,
            protein_g: input.protein_g as number,
            carbs_g:   input.carbs_g   as number,
            fat_g:     input.fat_g     as number,
            fiber_g:   (input.fiber_g  as number) || 0,
            meal_slot: input.meal_slot as string,
            notes:     (input.notes    as string) || '',
          }, today)
          if (result.ok) actions.push({ type: 'logged', food_name: input.food_name as string })
          resultContent = result.ok ? 'Saved successfully.' : `Error: ${result.error}`

        } else if (toolUse.name === 'delete_food') {
          const result = await deleteLog(
            email,
            input.food_name as string,
            input.meal_slot as string,
            today
          )
          if (result.ok) actions.push({ type: 'deleted', food_name: result.deleted || input.food_name as string })
          resultContent = result.ok ? `Deleted "${result.deleted}".` : `Error: ${result.error}`

        } else if (toolUse.name === 'move_food') {
          const result = await moveLog(email, {
            food_name: input.food_name as string,
            calories:  input.calories  as number,
            protein_g: input.protein_g as number,
            carbs_g:   input.carbs_g   as number,
            fat_g:     input.fat_g     as number,
            from_slot: input.from_slot as string,
            to_slot:   input.to_slot   as string,
          }, today)
          if (result.ok) actions.push({ type: 'moved', food_name: input.food_name as string })
          resultContent = result.ok ? 'Moved successfully.' : `Error: ${result.error}`

        } else {
          resultContent = 'Unknown tool.'
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: resultContent,
        })
      }

      // Append Claude's tool-call turn + our results, then loop
      loopMessages.push({ role: 'assistant', content: response.content })
      loopMessages.push({ role: 'user',      content: toolResults })

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: loopMessages,
        tools: TOOLS,
      })
    }

    // Extract final text (stop_reason === 'end_turn')
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    return NextResponse.json({ content: text, actions })

  } catch (err: unknown) {
    console.error('Chat API error:', err)
    const errStr = String(err)
    if (errStr.includes('credit') || errStr.includes('billing') || errStr.includes('balance')) {
      return NextResponse.json(
        { error: 'Nali is temporarily unavailable. Please try again in a few minutes.' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
