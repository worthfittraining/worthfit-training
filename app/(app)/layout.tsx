'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import SubscriptionGate from '@/app/components/SubscriptionGate'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home', icon: '🏠' },
  { href: '/log', label: 'Log', icon: '🍽️' },
  { href: '/chat', label: 'Nali', icon: '💬' },
  { href: '/meal-plan', label: 'Meals', icon: '📋' },
  { href: '/resources', label: 'Resources', icon: '📚' },
]

// Pages that should NOT show the bottom nav (full-screen flows)
const HIDE_NAV_ON = ['/onboarding', '/log/photo', '/log/barcode', '/log/new']

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const hideNav = HIDE_NAV_ON.some(p => pathname.startsWith(p))

  return (
    <SubscriptionGate>
    <div className="flex flex-col min-h-screen">
      <main className={hideNav ? 'flex-1' : 'flex-1 pb-20'}>
        {children}
      </main>

      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50">
          <div className="max-w-2xl mx-auto flex">
            {NAV_ITEMS.map(item => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                    isActive ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span className={`text-xs font-medium ${isActive ? 'text-green-600' : 'text-gray-400'}`}>
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </nav>
      )}
    </div>
    </SubscriptionGate>
  )
}
