'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Client = {
  id: string
  Name: string
  Email: string
  Coach_Email: string
  Goal: string
  Calories: number
  Protein_g: number
  Premium_Until?: string
}

type GroupedClients = {
  coachEmail: string
  clients: Client[]
}

export default function ManagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  // Track pending assignment changes: clientId -> new coachEmail value
  const [pending, setPending] = useState<Record<string, string>>({})
  // Track which clients are currently being saved
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  // Track save errors
  const [errors, setErrors] = useState<Record<string, string>>({})
  // Track pending Premium_Until values: clientId -> YYYY-MM-DD string (or '' to clear)
  const [pendingPremium, setPendingPremium] = useState<Record<string, string>>({})
  // Track which clients are having their Premium_Until saved
  const [savingPremium, setSavingPremium] = useState<Record<string, boolean>>({})
  // Track Premium_Until save errors
  const [premiumErrors, setPremiumErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      try {
        // First confirm head coach status
        const statusRes = await fetch('/api/coach/clients')
        if (statusRes.status === 403) {
          setForbidden(true)
          setLoading(false)
          return
        }
        const statusData = await statusRes.json()
        if (!statusData.isHeadCoach) {
          setForbidden(true)
          setLoading(false)
          return
        }

        // Fetch all clients
        const allRes = await fetch('/api/coach/all-clients')
        if (allRes.status === 403) {
          setForbidden(true)
          setLoading(false)
          return
        }
        const allData = await allRes.json()
        setClients(allData.clients || [])
      } catch (err) {
        console.error('Failed to load manage data:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave(clientId: string) {
    const newCoachEmail = pending[clientId] ?? ''
    setSaving(s => ({ ...s, [clientId]: true }))
    setErrors(e => ({ ...e, [clientId]: '' }))
    try {
      const res = await fetch('/api/coach/assign', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, coachEmail: newCoachEmail }),
      })
      if (!res.ok) {
        const data = await res.json()
        setErrors(e => ({ ...e, [clientId]: data.error || 'Save failed' }))
        return
      }
      // Update local state
      setClients(prev =>
        prev.map(c => c.id === clientId ? { ...c, Coach_Email: newCoachEmail } : c)
      )
      // Clear pending
      setPending(p => {
        const next = { ...p }
        delete next[clientId]
        return next
      })
    } catch (err) {
      setErrors(e => ({ ...e, [clientId]: String(err) }))
    } finally {
      setSaving(s => ({ ...s, [clientId]: false }))
    }
  }

  async function handleSavePremium(clientId: string) {
    const premiumUntil = pendingPremium[clientId] ?? ''
    setSavingPremium(s => ({ ...s, [clientId]: true }))
    setPremiumErrors(e => ({ ...e, [clientId]: '' }))
    try {
      const res = await fetch('/api/coach/set-premium', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, premiumUntil }),
      })
      if (!res.ok) {
        const data = await res.json()
        setPremiumErrors(e => ({ ...e, [clientId]: data.error || 'Save failed' }))
        return
      }
      // Update local state
      setClients(prev =>
        prev.map(c => c.id === clientId ? { ...c, Premium_Until: premiumUntil || undefined } : c)
      )
      // Clear pending
      setPendingPremium(p => {
        const next = { ...p }
        delete next[clientId]
        return next
      })
    } catch (err) {
      setPremiumErrors(e => ({ ...e, [clientId]: String(err) }))
    } finally {
      setSavingPremium(s => ({ ...s, [clientId]: false }))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    )
  }

  if (forbidden) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">Head Coach Only</h1>
        <p className="text-gray-500 text-sm mb-6">This page is only accessible to the head coach.</p>
        <button
          onClick={() => router.push('/coach')}
          className="bg-green-500 text-white font-semibold px-6 py-3 rounded-2xl text-sm"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  // Gather all unique coach emails (including currently pending values for display)
  const allCoachEmails = Array.from(
    new Set(clients.map(c => c.Coach_Email).filter(Boolean))
  ).sort()

  // Group clients: by Coach_Email, plus unassigned
  const groups: GroupedClients[] = allCoachEmails.map(coachEmail => ({
    coachEmail,
    clients: clients.filter(c => {
      // Use the live value (already saved), not pending
      return c.Coach_Email === coachEmail
    }),
  })).filter(g => g.clients.length > 0)

  const unassigned = clients.filter(c => !c.Coach_Email)

  // A select input of known coaches + blank option
  function CoachSelect({ client }: { client: Client }) {
    const currentValue = pending[client.id] !== undefined ? pending[client.id] : client.Coach_Email
    const isDirty = pending[client.id] !== undefined && pending[client.id] !== client.Coach_Email

    return (
      <div className="flex items-center gap-2 mt-2">
        <select
          value={currentValue}
          onChange={e => setPending(p => ({ ...p, [client.id]: e.target.value }))}
          className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="">Unassigned</option>
          {allCoachEmails.map(ce => (
            <option key={ce} value={ce}>{ce}</option>
          ))}
          {/* Allow typing a new email by keeping current value if not in list */}
          {currentValue && !allCoachEmails.includes(currentValue) && (
            <option value={currentValue}>{currentValue}</option>
          )}
        </select>
        {isDirty && (
          <button
            onClick={() => handleSave(client.id)}
            disabled={saving[client.id]}
            className="bg-green-500 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
          >
            {saving[client.id] ? 'Saving...' : 'Save'}
          </button>
        )}
      </div>
    )
  }

  function PremiumUntilInput({ client }: { client: Client }) {
    const currentValue = pendingPremium[client.id] !== undefined
      ? pendingPremium[client.id]
      : (client.Premium_Until || '')
    const isDirty = pendingPremium[client.id] !== undefined &&
      pendingPremium[client.id] !== (client.Premium_Until || '')

    return (
      <div className="mt-2">
        <label className="block text-xs text-gray-500 mb-1">Premium Until</label>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={currentValue}
            onChange={e => setPendingPremium(p => ({ ...p, [client.id]: e.target.value }))}
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-400"
          />
          {isDirty && (
            <button
              onClick={() => handleSavePremium(client.id)}
              disabled={savingPremium[client.id]}
              className="bg-green-500 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50 whitespace-nowrap"
            >
              {savingPremium[client.id] ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
        {premiumErrors[client.id] && (
          <p className="text-xs text-red-500 mt-1">{premiumErrors[client.id]}</p>
        )}
        {client.Premium_Until && !isDirty && (
          <p className="text-xs text-green-600 mt-1">Premium active until {client.Premium_Until}</p>
        )}
      </div>
    )
  }

  function ClientCard({ client }: { client: Client }) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
              {(client.Name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="font-semibold text-gray-800 text-sm">{client.Name || 'Unknown'}</div>
              <div className="text-xs text-gray-400">{client.Email}</div>
            </div>
          </div>
          <Link href={`/coach/client/${client.id}`} className="text-xs text-green-600 font-medium hover:underline">
            View
          </Link>
        </div>
        {errors[client.id] && (
          <p className="text-xs text-red-500 mt-1">{errors[client.id]}</p>
        )}
        <CoachSelect client={client} />
        <PremiumUntilInput client={client} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/coach')} className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 shadow-sm">
            ←
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Manage Clients</h1>
            <p className="text-xs text-gray-400 mt-0.5">{clients.length} total clients · {unassigned.length} unassigned</p>
          </div>
        </div>

        {/* Coach sections */}
        {groups.map(group => (
          <div key={group.coachEmail} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <h2 className="text-sm font-semibold text-gray-700 truncate">{group.coachEmail}</h2>
              <span className="text-xs text-gray-400 ml-auto">{group.clients.length} client{group.clients.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {group.clients.map(client => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        ))}

        {/* Unassigned section */}
        {unassigned.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-gray-300" />
              <h2 className="text-sm font-semibold text-gray-500">Unassigned</h2>
              <span className="text-xs text-gray-400 ml-auto">{unassigned.length} client{unassigned.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
              {unassigned.map(client => (
                <ClientCard key={client.id} client={client} />
              ))}
            </div>
          </div>
        )}

        {clients.length === 0 && (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-gray-500">No clients found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
