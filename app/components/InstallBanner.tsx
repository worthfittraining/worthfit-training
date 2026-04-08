'use client'

import { useState, useEffect } from 'react'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)

  useEffect(() => {
    // Don't show if already dismissed or if already running as installed PWA
    const dismissed = localStorage.getItem('installBannerDismissed')
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (dismissed || isStandalone) return

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setIsIOS(ios)
    setShow(true)
  }, [])

  if (!show) return null

  return (
    <div className="mx-4 mb-4 bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
      <div className="text-2xl mt-0.5">📲</div>
      <div className="flex-1">
        <p className="font-semibold text-green-900 text-sm">Add to your home screen</p>
        <p className="text-green-700 text-xs mt-0.5 leading-relaxed">
          {isIOS
            ? 'Tap the Share button (□↑) at the bottom of your browser, then "Add to Home Screen" for quick access.'
            : 'Tap the menu (⋮) in your browser, then "Add to Home Screen" to use Nutrition by Nali like an app.'}
        </p>
      </div>
      <button
        onClick={() => {
          localStorage.setItem('installBannerDismissed', '1')
          setShow(false)
        }}
        className="text-green-400 hover:text-green-600 text-lg leading-none mt-0.5"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}
