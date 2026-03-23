import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getClientByEmail } from '@/lib/airtable'
import { buildSystemPrompt } from '@/lib/prompts'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, email, mode } = await req.json()

  // Get client profile from Airtable (fields already use correct capitalization)
  const clientRecord = await getClientByEmail(email)
  const profile = clientRecord?.fields || {}

  // Build personalized system prompt — pass fields directly so casing matches
  const systemPrompt = buildSystemPrompt(profile, 'Nali', 'Your Coach', mode)

  // Get full response from Claude (streaming doesn't work reliably on Vercel serverless)
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => (block as { type: 'text'; text: string }).text)
    .join('')

  return NextResponse.json({ content: text })
}