'use client'

import { useUser } from '@clerk/nextjs'
import { useState, useRef, useEffect } from 'react'

type Message = {
  role: 'user' | 'assistant'
  content: string
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
  const end = content.indexOf(']', idx)
  if (end === -1) return { cleaned: content, logData: null }
  try {
    const json = content.slice(idx + 10, end)
    const logData = JSON.parse(json)
    const cleaned = (content.slice(0, idx) + content.slice(end + 1)).trim()
    return { cleaned, logData }
  } catch {
    return { cleaned: content, logData: null }
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
  const bottomRef = useRef<HTMLDivElement>(null)

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
    const userMessage: Message = { role: 'user', content: input.trim() }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

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

      // Only save the food log if we're in food_logger mode
      if (logData && mode === 'food_logger' && user?.primaryEmailAddress?.emailAddress) {
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
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-green-500 text-white rounded-br-sm'
                : 'bg-white text-gray-800 shadow-sm border border-gray-100 rounded-bl-sm'
            }`}>
              {msg.content || (loading && i === messages.length - 1 ? '...' : '')}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-3">
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
            disabled={loading || !input.trim()}
            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white rounded-xl px-4 py-3 text-sm font-medium transition-colors"
          >
            {loading ? '...' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1 text-center">Press Enter to send • Shift+Enter for new line</p>
      </div>
    </div>
  )
}