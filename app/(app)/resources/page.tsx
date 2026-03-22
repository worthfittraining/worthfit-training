'use client'

import { useEffect, useState } from 'react'

type Resource = {
  id: string
  title: string
  description: string
  url: string
  category: string
  type: 'link' | 'pdf' | 'video'
}

function typeIcon(type: string) {
  if (type === 'pdf') return '📄'
  if (type === 'video') return '▶️'
  return '🔗'
}

function typeLabel(type: string) {
  if (type === 'pdf') return 'PDF'
  if (type === 'video') return 'Video'
  return 'Article'
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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">📚 Resources</h1>
          <p className="text-gray-500 text-sm mt-1">Guides, articles, and tools from your coach</p>
        </div>

        {/* Category filter */}
        {categories.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-5 scrollbar-hide">
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
          <div className="text-center py-12 text-gray-400">Loading resources...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No resources yet</p>
            <p className="text-gray-400 text-sm mt-1">Your coach will add guides and articles here soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(resource => (
              <a
                key={resource.id}
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md hover:border-green-200 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">{typeIcon(resource.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-800 text-sm group-hover:text-green-700 transition-colors truncate">
                        {resource.title}
                      </h3>
                      <span className="flex-shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                        {typeLabel(resource.type)}
                      </span>
                    </div>
                    {resource.description && (
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{resource.description}</p>
                    )}
                    <p className="text-xs text-green-600 mt-1.5 font-medium">{resource.category}</p>
                  </div>
                  <div className="text-gray-300 group-hover:text-green-500 transition-colors flex-shrink-0 text-lg">→</div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
