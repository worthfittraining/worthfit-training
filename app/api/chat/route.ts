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

  // Stream response from Claude
  const stream = await client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  })

  // Return as a readable stream
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}