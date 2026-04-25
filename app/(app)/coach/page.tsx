'use client'

import { useUser } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Client = {
  id: string
  Name: string
  Email: string
  Goal: string
  Calories: number
  Protein_g: number
  Carbs_g: number
  Fat_g: number
  Program_week: number
  Onboarding_complete: boolean
  Last_session: string
  Coach_Email?: string
}

type ClientWithLogs = Client & {
  todayCalories: number
  todayProtein: number
  caloriePercent: number
  proteinPercent: number
}

export default function CoachDashboard() {
  const { user } = useUser()
  const router = useRouter()
  const [clients, setClients] = useState<ClientWithLogs[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [isHeadCoach, setIsHeadCoach] = useState(false)

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    try {
      const res = await fetch('/api/coach/clients')
      if (res.status === 403) {
        setForbidden(true)
        return
      }
      const data = await res.json()
      setClients(data.clients || [])
      setIsHeadCoach(data.isHeadCoach ?? false)
    } catch (err) {
      console.error('Failed to fetch clients:', err)
    } finally {
      setLoading(false)
    }
  }

  function StatusBadge({ pct }: { pct: number }) {
    if (pct === 0) return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not logged</span>
    if (pct < 50) return <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Needs attention</span>
    if (pct < 80) return <span className="text-xs bg-yellow-100 text-yellow-600 px-2 py-0.5 rounded-full">On track</span>
    return <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">Crushing it!</span>
  }

  // Not a coach — redirect to dashboard
  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Coach Access Only</h1>
        <p className="text-gray-500 text-sm mb-6">This page is only available to Nutrition by Nali coaches.</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="bg-green-500 text-white font-semibold px-6 py-3 rounded-2xl text-sm"
        >
          Go to Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Coach Dashboard</h1>
            <p className="text-gray-500 text-sm mt-1">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {isHeadCoach && <span className="ml-2 text-green-600 font-medium">· All Coaches</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
              {user?.firstName?.[0] || 'C'}
            </div>
            <span className="text-sm font-medium text-gray-700">{user?.firstName || 'Coach'}</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-gray-800">{clients.length}</div>
            <div className="text-xs text-gray-500 mt-1">{isHeadCoach ? 'Total Clients' : 'My Clients'}</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-green-600">
              {clients.filter(c => c.caloriePercent >= 50).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Active Today</div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
            <div className="text-3xl font-bold text-red-500">
              {clients.filter(c => c.caloriePercent === 0).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Not Logged Today</div>
          </div>
        </div>

        {/* Client list */}
        <h2 className="text-sm font-semibold text-gray-500 mb-3">
          {isHeadCoach ? 'ALL CLIENTS' : 'MY CLIENTS'}
        </h2>

        {loading ? (
          <div className="text-center text-gray-500 py-12">Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-gray-500">No clients assigned yet.</p>
            <p className="text-gray-500 text-sm mt-1">
              Clients will appear here once they&apos;re tagged to you in Airtable.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {clients.map(client => (
              <div key={client.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
                        {String(client.Name || '?')[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{String(client.Name || 'Unknown')}</div>
                        <div className="text-xs text-gray-500">{String(client.Email || '')}</div>
                      </div>
                    </div>
                  </div>
                  <StatusBadge pct={client.caloriePercent} />
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-500">Calories</span>
                      <span className="text-gray-700">{client.todayCalories} / {client.Calories || 0}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-gray-700 transition-all"
                        style={{ width: `${Math.min(client.caloriePercent, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-green-600">Protein</span>
                      <span className="text-gray-700">{client.todayProtein}g / {client.Protein_g || 0}g</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.min(client.proteinPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  <span>Goal: <span className="text-gray-600 capitalize">{String(client.Goal || 'Not set').replace(/_/g, ' ')}</span></span>
                  <span>Week <span className="text-gray-600">{client.Program_week || 1}</span></span>
                  {client.Onboarding_complete && <span className="text-green-500">✓ Onboarded</span>}
                  {isHeadCoach && client.Coach_Email && (
                    <span className="text-blue-500">Coach: {client.Coach_Email}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
