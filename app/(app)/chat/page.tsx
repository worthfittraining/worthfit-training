'use client'

import { useUser } from '@clerk/nextjs'
import { useState, useRef, useEffect } from 'react'
import { resolvePlan, PLAN_LIMITS, getNaliMessageCount, incrementNaliMessageCount, canSendNaliMessage } from '@/lib/plan'
import type { Plan } from '@/lib/plan'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

// Renders basic markdown inside chat bubbles (bold, italic, bullets, numbered lists)
function ChatMarkdown({ text, isUser }: { text: string; isUser: boolean }) {
  const mutedClass = isUser ? 'text-green-100' : 'text-gray-500'
  const boldClass = isUser ? 'font-semibold text-white' : 'font-semibold text-gray-900'

  function renderInline(line: string): React.ReactNode {
    // Split on **bold** and *italic*
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return <strong key={i} className={boldClass}>{part.slice(2, -2)}</strong>
      if (part.startsWith('*') && part.endsWith('*'))
        return <em key={i} className={mutedClass}>{part.slice(1, -1)}</em>
      return part
    })
  }

  const paragraphs = text.split('\n').filter((l, i, arr) => l.trim() || arr[i - 1]?.trim())

  const elements: React.ReactNode[] = []
  let bulletBuffer: string[] = []
  let numberedBuffer: string[] = []

  function flushBullets() {
    if (bulletBuffer.length) {
      elements.push(
        <ul key={`ul-${elements.length}`} className="list-disc pl-4 space-y-0.5 mt-1">
          {bulletBuffer.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
        </ul>
      )
      bulletBuffer = []
    }
  }
  function flushNumbered() {
    if (numberedBuffer.length) {
      elements.push(
        <ol key={`ol-${elements.length}`} className="list-decimal pl-4 space-y-0.5 mt-1">
          {numberedBuffer.map((b, i) => <li key={i}>{renderInline(b)}</li>)}
        </ol>
      )
      numberedBuffer = []
    }
  }

  paragraphs.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) {
      flushBullets(); flushNumbered()
      return
    }
    if (/^[-•]\s/.test(trimmed)) {
      flushNumbered()
      bulletBuffer.push(trimmed.replace(/^[-•]\s*/, ''))
    } else if (/^\d+\.\s/.test(trimmed)) {
      flushBullets()
      numberedBuffer.push(trimmed.replace(/^\d+\.\s*/, ''))
    } else {
      flushBullets(); flushNumbered()
      elements.push(<p key={i}>{renderInline(trimmed)}</p>)
    }
  })
  flushBullets(); flushNumbered()

  return <div className="space-y-1.5 text-sm leading-relaxed">{elements}</div>
}

const MODES = [
  { id: 'coach', label: '💬 Coach' },
  { id: 'food_logger', label: '🍽️ Log Food' },
  { id: 'meal_planner', label: '📋 Meal Plan' },
  { id: 'check_in', label: '✅ Check In' },
]

function extractFoodLog(content: string): { cleaned: string; logData: Record<string, unknown> | null } {
  const idx = content.indexOf('[FOOD_LOG:')
  if (idx === -1) return { cleaned: content, logData: null }

  // Find the matching closing ] by tracking JSON brace depth
  // so we don't accidentally stop at a ] inside the JSON
  let depth = 0
  let end = -1
  for (let i = idx; i < content.length; i++) {
    if (content[i] === '{') depth++
    if (content[i] === '}') depth--
    if (content[i] === ']' && depth === 0) { end = i; break }
  }
  if (end === -1) return { cleaned: content, logData: null }

  try {
    const json = content.slice(idx + 10, end)
    const logData = JSON.parse(json)
    const cleaned = (content.slice(0, idx) + content.slice(end + 1)).trim()
    return { cleaned, logData }
  } catch {
    // JSON parse failed — still strip the raw tag so it doesn't show in UI
    const cleaned = (content.slice(0, idx) + content.slice(end + 1)).trim()
    return { cleaned, logData: null }
  }
}

export default function ChatPage() {
  const { user } = useUser()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('coach')
  const [logSaved, setLogSaved] = useState<string | null>(null)
  const [savedInSession, setSavedInSession] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<Plan>('free')
  const [msgCount, setMsgCount] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load plan from profile
  useEffect(() => {
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) return
    fetch(`/api/profile?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => setPlan(resolvePlan(d.Plan)))
      .catch(() => {})
  }, [user])

  // Sync local message count on mount
  useEffect(() => {
    setMsgCount(getNaliMessageCount())
  }, [])

  useEffect(() => {
    if (messages.length === 0 && user) {
      const firstName = user.firstName || 'there'
      setMessages([{
        role: 'assistant',
        content: `Hey ${firstName}! I'm Nali, your nutrition coach. How can I help you today?`
      }])
    }
  }, [user, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

async function saveFoodLog(logData: Record<string, unknown>, email: string) {
  const foodKey = `${logData.food_name}-${logData.meal_slot}`

  // Skip if already saved this exact food in this chat session
  if (savedInSession.has(foodKey)) {
    console.log('Duplicate detected, skipping:', foodKey)
    return
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const res = await fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...logData, email, date: today }),
    })
    if (res.ok) {
      setSavedInSession(prev => new Set([...prev, foodKey]))
      setLogSaved((logData.food_name as string) || 'Food')
      setTimeout(() => setLogSaved(null), 4000)
    }
  } catch (err) {
    console.error('Failed to save food log:', err)
  }
}

  async function sendMessage() {
    if (!input.trim() || loading) return

    // Check daily message limit for non-premium plans
    if (!canSendNaliMessage(plan)) return

    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Increment counter (only for limited plans)
    const limit = PLAN_LIMITS[plan].naliMessagesPerDay
    if (isFinite(limit)) {
      const newCount = incrementNaliMessageCount()
      setMsgCount(newCount)
    }

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages,
          mode,
          email: user?.primaryEmailAddress?.emailAddress,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Server error ${res.status}`)
      }

      const data = await res.json()
      const fullContent: string = data.content || ''

      if (!fullContent) {
        throw new Error('Empty response from Nali')
      }

      // Always strip [FOOD_LOG:...] tag from display — regardless of mode
      const { cleaned, logData } = extractFoodLog(fullContent)
      setMessages(prev => [...prev, { role: 'assistant', content: cleaned || fullContent }])

      // Save the food log whenever Nali includes the tag — works in any mode
      if (logData && user?.primaryEmailAddress?.emailAddress) {
        await saveFoodLog(logData, user.primaryEmailAddress!.emailAddress)
      }
    } catch (err) {
      console.error('Chat error:', err)
      const errMsg = err instanceof Error ? err.message : String(err)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">N</div>
          <span className="font-semibold text-gray-800">Nali</span>
          <span className="text-xs text-gray-400">Your AI Nutrition Coach</span>
        </div>
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">← Dashboard</a>
      </div>

      <div className="bg-white border-b border-gray-200 px-4 py-2 flex gap-2 overflow-x-auto">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              mode === m.id ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {logSaved && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-sm text-green-700 flex items-center gap-2">
          <span>✅</span>
          <span><strong>{logSaved}</strong> saved to your food log!</span>
          <a href="/log" className="underline ml-1">View log →</a>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-green-500 text-white rounded-br-sm'
                : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
            }`}>
              {msg.content
                ? <ChatMarkdown text={msg.content} isUser={msg.role === 'user'} />
                : (loading && i === messages.length - 1 ? <span className="text-sm">...</span> : null)}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-3">
        {/* Message limit hit banner */}
        {!canSendNaliMessage(plan) && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              You've used all {PLAN_LIMITS[plan].naliMessagesPerDay} Nali messages for today
            </p>
            <p className="text-xs text-amber-600 mb-2">
              {plan === 'free' ? 'Standard gets 30/day, Premium gets unlimited.' : 'Upgrade to Premium for unlimited messages.'}
            </p>
            <a href="/subscribe" className="inline-block bg-green-600 text-white text-xs font-semibold px-4 py-1.5 rounded-full hover:bg-green-700 transition-colors">
              Upgrade Plan →
            </a>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Nali anything..."
            rows={1}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-400 max-h-32"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim() || !canSendNaliMessage(plan)}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors"
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>

        <div className="flex items-center justify-between mt-1">
          <p className="text-xs text-gray-400">Press Enter to send • Shift+Enter for new line</p>
          {isFinite(PLAN_LIMITS[plan].naliMessagesPerDay) && (
            <p className="text-xs text-gray-400">
              {Math.max(0, PLAN_LIMITS[plan].naliMessagesPerDay - msgCount)} msg{Math.max(0, PLAN_LIMITS[plan].naliMessagesPerDay - msgCount) !== 1 ? 's' : ''} left today
            </p>
          )}
        </div>
      </div>
    </div>
  )
}