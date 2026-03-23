import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getClientByEmail } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/prompts'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages, email, mode } = await req.json()

    // Get client profile from Airtable (non-fatal — chat still works without it)
    let profile: Record<string, unknown> = {}
    try {
      const clientRecord = await getClientByEmail(email)
      profile = (clientRecord?.fields as Record<string, unknown>) || {}
    } catch (airtableErr) {
      console.warn('Airtable lookup failed (continuing without profile):', airtableErr)
    }

    // Build personalized system prompt
    const systemPrompt = buildSystemPrompt(profile, 'Nali', 'Your Coach', mode)

    // Anthropic requires messages to start with a user message — strip any leading assistant messages
    const firstUserIdx = messages.findIndex((m: { role: string }) => m.role === 'user')
    const cleanedMessages = firstUserIdx >= 0 ? messages.slice(firstUserIdx) : messages

    if (cleanedMessages.length === 0) {
      return NextResponse.json({ error: 'No user message found' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: cleanedMessages,
    })

    const text = response.content
      .filter(block => block.type === 'text')
      .map(block => (block as { type: 'text'; text: string }).text)
      .join('')

    return NextResponse.json({ content: text })
  } catch (err) {
    console.error('Chat API error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
