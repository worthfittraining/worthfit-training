'use client'

import { useEffect, useState } from 'react'

type Resource = {
  id: string
  title: string
  category: string
  emoji: string
  summary: string
  content: string
  order: number
}

// Renders **bold** and paragraph breaks from plain text content
function ArticleContent({ text }: { text: string }) {
  const paragraphs = text.split('\n\n').filter(Boolean)

  return (
    <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
      {paragraphs.map((para, i) => {
        // Handle bullet-style lines (starting with -)
        if (para.trim().startsWith('-')) {
          const items = para.split('\n').filter(l => l.trim().startsWith('-'))
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((item, j) => (
                <li key={j}>{renderBold(item.replace(/^-\s*/, ''))}</li>
              ))}
            </ul>
          )
        }
        // Handle numbered lists
        if (/^\d+\./.test(para.trim())) {
          const items = para.split('\n').filter(l => /^\d+\./.test(l.trim()))
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {items.map((item, j) => (
                <li key={j}>{renderBold(item.replace(/^\d+\.\s*/, ''))}</li>
              ))}
            </ol>
          )
        }
        return <p key={i}>{renderBold(para)}</p>
      })}
    </div>
  )
}

function renderBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
      : part
  )
}

function ResourceCard({ resource }: { resource: Resource }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden ${
        expanded ? 'border-green-200 shadow-md' : 'border-gray-100 shadow-sm hover:border-green-200 hover:shadow-md'
      }`}
    >
      {/* Card header — always visible, tap to toggle */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full text-left p-4"
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0 mt-0.5">{resource.emoji}</div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-sm leading-snug transition-colors ${
              expanded ? 'text-green-700' : 'text-gray-800'
            }`}>
              {resource.title}
            </h3>
            {!expanded && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{resource.summary}</p>
            )}
          </div>
          <div className={`flex-shrink-0 text-gray-400 transition-transform duration-200 mt-0.5 ${
            expanded ? 'rotate-180 text-green-500' : ''
          }`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-4 pb-5 pt-1 border-t border-gray-50">
          <p className="text-xs text-gray-400 mb-4 italic">{resource.summary}</p>
          <ArticleContent text={resource.content} />
        </div>
      )}
    </div>
  )
}

const CATEGORY_EMOJIS: Record<string, string> = {
  'The Basics': '📖',
  'Meal Prep': '🍱',
  'Myths Busted': '💡',
  'Lifestyle': '🌿',
  'General': '📌',
}

export default function ResourcesPage() {
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState('All')

  useEffect(() => {
    fetch('/api/resources')
      .then(r => r.json())
      .then(d => setResources(d.resources || []))
      .catch(() => setResources([]))
      .finally(() => setLoading(false))
  }, [])

  const categories = ['All', ...Array.from(new Set(resources.map(r => r.category)))]
  const filtered = activeCategory === 'All' ? resources : resources.filter(r => r.category === activeCategory)

  // Group by category for "All" view
  const grouped = activeCategory === 'All'
    ? Array.from(new Set(resources.map(r => r.category))).map(cat => ({
        category: cat,
        items: resources.filter(r => r.category === cat),
      }))
    : [{ category: activeCategory, items: filtered }]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📚 Resources</h1>
          <p className="text-gray-500 text-sm mt-1">Nutrition guides written for real life — no fluff.</p>
        </div>

        {/* Category pills */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeCategory === cat
                    ? 'bg-green-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-green-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : resources.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No resources yet</p>
            <p className="text-gray-400 text-sm mt-1">Check back soon — guides are on the way.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(group => (
              <div key={group.category}>
                {activeCategory === 'All' && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-base">{CATEGORY_EMOJIS[group.category] || '📌'}</span>
                    <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide">{group.category}</h2>
                  </div>
                )}
                <div className="space-y-3">
                  {group.items.map(resource => (
                    <ResourceCard key={resource.id} resource={resource} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Airtable tip for coach */}
        <div className="mt-10 p-4 bg-green-50 rounded-2xl border border-green-100">
          <p className="text-xs text-green-700 font-medium mb-1">💡 Adding your own articles</p>
          <p className="text-xs text-green-600 leading-relaxed">
            Create a <strong>Resources</strong> table in Airtable with fields: Title, Category, Emoji, Summary, Content, Order, Published (checkbox). Check Published to make an article live — no code changes needed.
          </p>
        </div>

      </div>
    </div>
  )
}
